import { describe, it, expect, afterEach } from 'vitest';
import { writeFile, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  BackupError,
  ensureDir,
  removeFile,
  getFileSize,
  compressFile,
  generateTempPath,
  formatBytes,
  formatDuration,
  splitFile,
} from '../src/utils.js';

describe('BackupError', () => {
  it('should create error with phase', () => {
    const error = new BackupError('test error', 'backup');
    expect(error.message).toBe('test error');
    expect(error.phase).toBe('backup');
    expect(error.name).toBe('BackupError');
  });

  it('should include cause when provided', () => {
    const cause = new Error('original');
    const error = new BackupError('wrapped', 'delivery', cause);
    expect(error.cause).toBe(cause);
  });
});

describe('formatBytes', () => {
  it('should format 0 bytes', () => {
    expect(formatBytes(0)).toBe('0 B');
  });

  it('should format bytes', () => {
    expect(formatBytes(500)).toBe('500.00 B');
  });

  it('should format kilobytes', () => {
    expect(formatBytes(1024)).toBe('1.00 KB');
    expect(formatBytes(1536)).toBe('1.50 KB');
  });

  it('should format megabytes', () => {
    expect(formatBytes(1048576)).toBe('1.00 MB');
    expect(formatBytes(5242880)).toBe('5.00 MB');
  });

  it('should format gigabytes', () => {
    expect(formatBytes(1073741824)).toBe('1.00 GB');
  });
});

describe('formatDuration', () => {
  it('should format milliseconds', () => {
    expect(formatDuration(500)).toBe('500ms');
    expect(formatDuration(999)).toBe('999ms');
  });

  it('should format seconds', () => {
    expect(formatDuration(1000)).toBe('1.00s');
    expect(formatDuration(5500)).toBe('5.50s');
  });

  it('should format minutes', () => {
    expect(formatDuration(60000)).toBe('1.00m');
    expect(formatDuration(90000)).toBe('1.50m');
  });
});

describe('generateTempPath', () => {
  it('should generate path with prefix and extension', () => {
    const path = generateTempPath('test-backup', '.sql');
    expect(path).toContain('test-backup');
    expect(path.endsWith('.sql')).toBe(true);
    expect(path).toContain(tmpdir());
  });

  it('should generate unique paths', () => {
    const path1 = generateTempPath('backup', '.dump');
    const path2 = generateTempPath('backup', '.dump');
    expect(path1).not.toBe(path2);
  });
});

describe('file operations', () => {
  const testDir = join(tmpdir(), 'wbackup-test-' + Date.now());
  const testFile = join(testDir, 'test.txt');

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe('ensureDir', () => {
    it('should create directory', async () => {
      await ensureDir(testDir);
      await writeFile(testFile, 'test');
      const size = await getFileSize(testFile);
      expect(size).toBe(4);
    });

    it('should not fail if directory exists', async () => {
      await ensureDir(testDir);
      await ensureDir(testDir);
    });
  });

  describe('removeFile', () => {
    it('should remove file', async () => {
      await ensureDir(testDir);
      await writeFile(testFile, 'test');
      await removeFile(testFile);
      await expect(getFileSize(testFile)).rejects.toThrow();
    });

    it('should not fail if file does not exist', async () => {
      await removeFile('/nonexistent/path/file.txt');
    });
  });

  describe('getFileSize', () => {
    it('should return file size', async () => {
      await ensureDir(testDir);
      await writeFile(testFile, 'hello world');
      const size = await getFileSize(testFile);
      expect(size).toBe(11);
    });
  });

  describe('compressFile', () => {
    it('should compress file and return new path', async () => {
      await ensureDir(testDir);
      const content = 'hello world '.repeat(100);
      await writeFile(testFile, content);

      const originalSize = await getFileSize(testFile);
      const compressedPath = await compressFile(testFile);

      expect(compressedPath).toBe(testFile + '.gz');
      const compressedSize = await getFileSize(compressedPath);
      expect(compressedSize).toBeLessThan(originalSize);
    });

    it('should remove original file after compression', async () => {
      await ensureDir(testDir);
      await writeFile(testFile, 'test content');
      await compressFile(testFile);

      await expect(getFileSize(testFile)).rejects.toThrow();
    });
  });

  describe('splitFile', () => {
    it('should return single file if under limit', async () => {
      await ensureDir(testDir);
      await writeFile(testFile, 'small file');
      const chunks = await splitFile(testFile, 1024);

      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toBe(testFile);
    });

    it('should split large file into chunks', async () => {
      await ensureDir(testDir);
      const content = 'x'.repeat(100);
      await writeFile(testFile, content);

      const chunks = await splitFile(testFile, 30);

      expect(chunks.length).toBeGreaterThan(1);
      expect(chunks[0]).toContain('.part1');

      // Cleanup chunks
      for (const chunk of chunks) {
        if (chunk !== testFile) {
          await removeFile(chunk);
        }
      }
    });
  });
});
