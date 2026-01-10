import { basename, join, extname } from 'node:path';
import { copyFile } from 'node:fs/promises';
import { z } from 'zod';
import type { BackupResult, BackupStrategy } from '../../types.js';
import {
  BackupError,
  generateTempPath,
  maybeCompress,
  removeFile,
} from '../../utils.js';

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

const RedisConfigSchema = z.object({
  host: z.string().default('localhost'),
  port: z.number().default(6379),
  password: z.string().optional(),
  database: z.number().default(0),
  compress: z.boolean().default(true),
  rdbPath: z.string().optional(),
  tls: z.boolean().default(false),
});

export type RedisConfig = z.infer<typeof RedisConfigSchema>;

// Hardcoded timeouts - users can extend via additionalArgs if needed
const CONNECT_TIMEOUT = 10000;
const SAVE_TIMEOUT = 300000; // 5 minutes
const POLL_INTERVAL = 500;

export class RedisBackupStrategy implements BackupStrategy<RedisConfig> {
  readonly name = 'redis';
  readonly configSchema = RedisConfigSchema;

  async backup(config: RedisConfig): Promise<BackupResult> {
    const validatedConfig = this.configSchema.parse(config);
    const startTime = Date.now();

    // Dynamic import for optional dependency
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let Redis: any;
    try {
      Redis = (await import('ioredis')).default;
    } catch {
      throw new BackupError(
        'ioredis is required for Redis backups. Install it with: pnpm add ioredis',
        'backup'
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const options: any = {
      host: validatedConfig.host,
      port: validatedConfig.port,
      db: validatedConfig.database,
      enableReadyCheck: true,
      maxRetriesPerRequest: 3,
      connectTimeout: CONNECT_TIMEOUT,
    };

    if (validatedConfig.password) {
      options.password = validatedConfig.password;
    }

    if (validatedConfig.tls) {
      options.tls = { rejectUnauthorized: true };
    }

    const redis = new Redis(options);

    try {
      await this.waitForReady(redis);

      const rdbPath = validatedConfig.rdbPath || (await this.discoverRdbPath(redis));
      validateRdbPath(rdbPath);

      await this.triggerAndWaitForSave(redis);

      const outputPath = generateTempPath('redis-backup', '.rdb');
      await copyFile(rdbPath, outputPath);

      const { finalPath, compressed, sizeBytes } = await maybeCompress(
        outputPath,
        validatedConfig.compress
      );

      return {
        filePath: finalPath,
        fileName: basename(finalPath),
        sizeBytes,
        database: `redis-db${validatedConfig.database}`,
        createdAt: new Date(),
        compressed,
        metadata: {
          type: 'redis',
          duration: Date.now() - startTime,
          host: validatedConfig.host,
          port: validatedConfig.port,
        },
      };
    } finally {
      redis.disconnect();
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private waitForReady(redis: any): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new BackupError('Redis connection timeout', 'backup'));
      }, CONNECT_TIMEOUT);

      redis.once('ready', () => {
        clearTimeout(timer);
        resolve();
      });

      redis.once('error', (err: Error) => {
        clearTimeout(timer);
        reject(new BackupError(`Redis connection failed: ${err.message}`, 'backup'));
      });
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async discoverRdbPath(redis: any): Promise<string> {
    const dirResult = (await redis.config('GET', 'dir')) as string[];
    const filenameResult = (await redis.config('GET', 'dbfilename')) as string[];

    const dir = dirResult[1];
    const dbfilename = filenameResult[1];

    if (!dir || !dbfilename) {
      throw new BackupError(
        'Could not determine RDB file path. Provide rdbPath in config.',
        'backup'
      );
    }

    return join(dir, dbfilename);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async triggerAndWaitForSave(redis: any): Promise<void> {
    const lastSave = await redis.lastsave();

    const info = await redis.info('persistence');
    if (!info.includes('rdb_bgsave_in_progress:1')) {
      await redis.bgsave();
    }

    const startWait = Date.now();
    while (Date.now() - startWait < SAVE_TIMEOUT) {
      // Single INFO command instead of LASTSAVE + INFO (50% fewer Redis commands)
      const infoCheck = await redis.info('persistence');

      // Parse rdb_last_save_time from INFO response
      const lastSaveMatch = infoCheck.match(/rdb_last_save_time:(\d+)/);
      const currentSave = lastSaveMatch ? parseInt(lastSaveMatch[1], 10) : 0;

      if (currentSave > lastSave) {
        return;
      }

      if (infoCheck.includes('rdb_last_bgsave_status:err')) {
        throw new BackupError('Redis BGSAVE failed', 'backup');
      }

      await this.sleep(POLL_INTERVAL);
    }

    throw new BackupError(`Redis BGSAVE timed out after ${SAVE_TIMEOUT}ms`, 'backup');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async cleanup(filePath: string): Promise<void> {
    await removeFile(filePath);
  }
}

export function createRedisBackupStrategy(): BackupStrategy<RedisConfig> {
  return new RedisBackupStrategy();
}
