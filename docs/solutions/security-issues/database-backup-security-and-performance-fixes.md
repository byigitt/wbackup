---
title: "Security and Performance Fixes for Database Backup Strategies"
category: security-issues
tags:
  - path-traversal
  - security
  - performance
  - memory-management
  - redis
  - sqlite
  - mysql
  - mongodb
  - postgresql
  - backup
  - oom
  - streaming
affected_components:
  - src/strategies/backup/redis.ts
  - src/strategies/backup/sqlite.ts
  - src/strategies/backup/mysql.ts
  - src/strategies/backup/mongodb.ts
  - src/strategies/backup/postgresql.ts
  - src/utils.ts
severity: critical
date_solved: 2026-01-10
pr_reference: "https://github.com/byigitt/wbackup/pull/1"
---

# Security and Performance Fixes for Database Backup Strategies

## Problem Summary

During code review of the MySQL, SQLite, and Redis backup strategy implementations (v1.1.0 feature), multiple security vulnerabilities and performance issues were identified.

### Issues Fixed

| Priority | Issue | Impact |
|----------|-------|--------|
| P1 Critical | Redis rdbPath path traversal | Arbitrary file read via `../` sequences |
| P1 Critical | SQLite path path traversal | Arbitrary file read via `../` sequences |
| P1 Critical | splitFile OOM crash | Heap exhaustion for files >4GB |
| P2 Important | Redis polling inefficiency | 2x unnecessary Redis commands |
| P2 Important | SQLite timeout too short | Backup fails for DBs >1GB |
| P2 Important | Compression level 9 | ~10x slower than necessary |
| P2 Important | Code duplication | Identical logic in 5 strategies |

---

## P1 Fixes (Security/Critical)

### 1. Redis Path Traversal Fix

**File:** `src/strategies/backup/redis.ts`

#### Root Cause
The Redis backup strategy allowed arbitrary file paths via `rdbPath` config. An attacker could use `../../../etc/passwd` to read files outside the Redis data directory.

#### Solution

```typescript
function validateRdbPath(rdbPath: string): void {
  if (extname(rdbPath).toLowerCase() !== '.rdb') {
    throw new BackupError(
      'Invalid RDB path: must end with .rdb extension',
      'backup'
    );
  }
  if (rdbPath.includes('..')) {
    throw new BackupError(
      'Invalid RDB path: path traversal not allowed',
      'backup'
    );
  }
}

// Called after config parse:
const rdbPath = validatedConfig.rdbPath || (await this.discoverRdbPath(redis));
validateRdbPath(rdbPath);
```

---

### 2. SQLite Path Traversal Fix

**File:** `src/strategies/backup/sqlite.ts`

#### Root Cause
SQLite backup accepted arbitrary paths without validation, enabling path traversal attacks.

#### Solution

```typescript
const VALID_SQLITE_EXTENSIONS = ['.db', '.sqlite', '.sqlite3'];

function validateSqlitePath(dbPath: string): void {
  const ext = extname(dbPath).toLowerCase();
  if (!VALID_SQLITE_EXTENSIONS.includes(ext)) {
    throw new BackupError(
      `Invalid SQLite path: must end with ${VALID_SQLITE_EXTENSIONS.join(', ')}`,
      'backup'
    );
  }
  if (dbPath.includes('..')) {
    throw new BackupError(
      'Invalid SQLite path: path traversal not allowed',
      'backup'
    );
  }
}

// Called immediately after config parse:
const validatedConfig = this.configSchema.parse(config);
validateSqlitePath(validatedConfig.path);
```

---

### 3. splitFile OOM Fix

**File:** `src/utils.ts`

#### Root Cause
Original implementation loaded entire file into memory:

```typescript
// BAD: Causes OOM for large files
const buffer = await readFile(filePath);
```

For a 10GB backup file, this requires 10GB of heap memory, exceeding Node.js limits.

#### Solution

Stream-based splitting with fixed 64KB buffer:

```typescript
export async function splitFile(filePath: string, maxSizeBytes: number): Promise<string[]> {
  const fileSize = await getFileSize(filePath);
  if (fileSize <= maxSizeBytes) return [filePath];

  const chunks: string[] = [];
  const numChunks = Math.ceil(fileSize / maxSizeBytes);
  const { open } = await import('node:fs/promises');
  const fileHandle = await open(filePath, 'r');

  try {
    for (let i = 0; i < numChunks; i++) {
      const chunkPath = `${filePath}.part${i + 1}`;
      const start = i * maxSizeBytes;
      const chunkSize = Math.min(maxSizeBytes, fileSize - start);

      const BUFFER_SIZE = 64 * 1024; // 64KB - O(1) memory
      const writeStream = createWriteStream(chunkPath);

      let bytesWritten = 0;
      while (bytesWritten < chunkSize) {
        const readSize = Math.min(BUFFER_SIZE, chunkSize - bytesWritten);
        const buffer = Buffer.allocUnsafe(readSize);
        const { bytesRead } = await fileHandle.read(buffer, 0, readSize, start + bytesWritten);
        if (bytesRead === 0) break;

        await new Promise<void>((resolve, reject) => {
          writeStream.write(buffer.subarray(0, bytesRead), (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
        bytesWritten += bytesRead;
      }

      await new Promise<void>((resolve, reject) => {
        writeStream.end((err) => err ? reject(err) : resolve());
      });
      chunks.push(chunkPath);
    }
  } finally {
    await fileHandle.close();
  }

  return chunks;
}
```

**Memory impact:**

| File Size | Before (Memory) | After (Memory) |
|-----------|-----------------|----------------|
| 1GB | 1GB | 64KB |
| 10GB | CRASH | 64KB |
| 100GB | CRASH | 64KB |

---

## P2 Fixes (Performance)

### 1. Redis Polling Optimization

**File:** `src/strategies/backup/redis.ts`

Reduced from 2 Redis commands per poll to 1:

```typescript
// Before: 2 commands per iteration
const currentSave = await redis.lastsave();
const infoCheck = await redis.info('persistence');

// After: 1 command, parse timestamp from INFO
const infoCheck = await redis.info('persistence');
const lastSaveMatch = infoCheck.match(/rdb_last_save_time:(\d+)/);
const currentSave = lastSaveMatch ? parseInt(lastSaveMatch[1], 10) : 0;
```

**Impact:** 50% fewer Redis commands during BGSAVE monitoring.

---

### 2. SQLite Timeout Increase

**File:** `src/strategies/backup/sqlite.ts`

```typescript
// Before: 5 seconds (fails for DBs > 1GB)
timeout: 5000

// After: 5 minutes (matches Redis SAVE_TIMEOUT)
timeout: 300000
```

---

### 3. Compression Level Optimization

**File:** `src/utils.ts`

```typescript
// Before: Maximum compression, ~10x slower
const gzip = createGzip({ level: 9 });

// After: Balanced compression, only ~5% larger files
const gzip = createGzip({ level: 6 });
```

---

### 4. maybeCompress Utility

**File:** `src/utils.ts`

Extracted shared compression logic used by all 5 backup strategies:

```typescript
export async function maybeCompress(
  path: string,
  shouldCompress: boolean
): Promise<{ finalPath: string; compressed: boolean; sizeBytes: number }> {
  let finalPath = path;
  let compressed = false;

  if (shouldCompress) {
    finalPath = await compressFile(path);
    compressed = true;
  }

  const sizeBytes = await getFileSize(finalPath);
  return { finalPath, compressed, sizeBytes };
}
```

---

## Prevention Checklist

### For Path Handling

- [ ] Validate all user-supplied paths before filesystem operations
- [ ] Use extension allowlists (e.g., `.rdb`, `.db`, `.sqlite`, `.sqlite3`)
- [ ] Block `..` path traversal sequences
- [ ] Validate early, before any I/O

### For Large File Operations

- [ ] Never use `readFile()` on files of unknown/unbounded size
- [ ] Use `createReadStream()`/`createWriteStream()` for large files
- [ ] Use fixed-size buffers (64KB-1MB typical)
- [ ] Always close file handles in `finally` blocks

### For Performance

- [ ] Minimize API calls in polling loops
- [ ] Size timeouts for production workloads (5+ minutes for backups)
- [ ] Use compression level 6 instead of 9

---

## Code Review Questions

Ask these during every review:

1. **"Where does this path come from?"** - If user-supplied, is it validated?
2. **"What happens if this file is 10GB?"** - If using `readFile()`, change to streams
3. **"How many API calls does this loop make?"** - Can they be combined?
4. **"What's the timeout for this operation?"** - Is it sized for production?

---

## Related References

- **PR:** https://github.com/byigitt/wbackup/pull/1
- **ROADMAP.md:** v1.1.0 More Databases (MySQL, SQLite, Redis support)
- **Cross-reference:** Also applies to performance-issues category

---

## Verification

All 81 tests pass after fixes:

```
✓ tests/utils.test.ts (21 tests)
✓ tests/manager.test.ts (10 tests)
✓ tests/strategies/backup.test.ts (24 tests)
✓ tests/strategies/delivery.test.ts (15 tests)
✓ tests/registry.test.ts (11 tests)
```
