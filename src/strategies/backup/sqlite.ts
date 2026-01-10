import { basename, extname } from 'node:path';
import { access, constants } from 'node:fs/promises';
import { z } from 'zod';
import type { BackupResult, BackupStrategy } from '../../types.js';
import {
  BackupError,
  generateTempPath,
  maybeCompress,
  removeFile,
} from '../../utils.js';

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

const SQLiteConfigSchema = z.object({
  path: z.string().min(1, 'Database path is required'),
  compress: z.boolean().default(true),
});

export type SQLiteConfig = z.infer<typeof SQLiteConfigSchema>;

export class SQLiteBackupStrategy implements BackupStrategy<SQLiteConfig> {
  readonly name = 'sqlite';
  readonly configSchema = SQLiteConfigSchema;

  async backup(config: SQLiteConfig): Promise<BackupResult> {
    const validatedConfig = this.configSchema.parse(config);
    validateSqlitePath(validatedConfig.path);
    const startTime = Date.now();

    // Verify file exists
    try {
      await access(validatedConfig.path, constants.R_OK);
    } catch {
      throw new BackupError(
        `SQLite database file not found: ${validatedConfig.path}`,
        'backup'
      );
    }

    // Dynamic import for optional dependency
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let Database: any;
    try {
      Database = (await import('better-sqlite3')).default;
    } catch {
      throw new BackupError(
        'better-sqlite3 is required for SQLite backups. Install it with: pnpm add better-sqlite3',
        'backup'
      );
    }

    const db = Database(validatedConfig.path, {
      readonly: true,
      timeout: 300000, // 5 minutes for large databases
    });

    try {
      // Checkpoint WAL if in WAL mode
      try {
        db.pragma('wal_checkpoint(PASSIVE)');
      } catch {
        // Not in WAL mode, ignore
      }

      const outputPath = generateTempPath('sqlite-backup', '.db');

      // Use native backup API
      await db.backup(outputPath);

      const { finalPath, compressed, sizeBytes } = await maybeCompress(
        outputPath,
        validatedConfig.compress
      );

      return {
        filePath: finalPath,
        fileName: basename(finalPath),
        sizeBytes,
        database: basename(validatedConfig.path),
        createdAt: new Date(),
        compressed,
        metadata: {
          type: 'sqlite',
          duration: Date.now() - startTime,
          sourcePath: validatedConfig.path,
        },
      };
    } finally {
      db.close();
    }
  }

  async cleanup(filePath: string): Promise<void> {
    await removeFile(filePath);
  }
}

export function createSQLiteBackupStrategy(): BackupStrategy<SQLiteConfig> {
  return new SQLiteBackupStrategy();
}
