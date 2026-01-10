/**
 * MySQL Backup Strategy
 *
 * Usage:
 * ```typescript
 * import { registerBackupStrategy, createMySQLBackupStrategy } from 'wbackup';
 *
 * registerBackupStrategy('mysql', createMySQLBackupStrategy);
 *
 * const manager = new BackupManager()
 *   .database('mysql', {
 *     host: 'localhost',
 *     user: 'root',
 *     password: 'secret',
 *     database: 'mydb',
 *   })
 *   .delivery('discord', { webhookUrl: '...' });
 *
 * await manager.run();
 * ```
 */

import { basename } from 'node:path';
import { z } from 'zod';
import type { BackupResult, BackupStrategy } from '../../types.js';
import {
  generateTempPath,
  maybeCompress,
  removeFile,
  runCommand,
} from '../../utils.js';

const MySQLConfigSchema = z.object({
  host: z.string().default('localhost'),
  port: z.number().default(3306),
  user: z.string(),
  password: z.string(),
  database: z.string(),
  compress: z.boolean().default(true),
  ssl: z.boolean().default(false),
  additionalArgs: z.array(z.string()).default([]),
});

export type MySQLConfig = z.infer<typeof MySQLConfigSchema>;

export class MySQLBackupStrategy implements BackupStrategy<MySQLConfig> {
  readonly name = 'mysql';
  readonly configSchema = MySQLConfigSchema;

  async backup(config: MySQLConfig): Promise<BackupResult> {
    const validatedConfig = this.configSchema.parse(config);
    const startTime = Date.now();

    const outputPath = generateTempPath('mysql-backup', '.sql');
    const args = this.buildArgs(validatedConfig, outputPath);

    await runCommand({
      command: 'mysqldump',
      args,
      env: { ...process.env, MYSQL_PWD: validatedConfig.password },
      notFoundMessage: 'mysqldump not found. Please install MySQL client tools.',
    });

    const { finalPath, compressed, sizeBytes } = await maybeCompress(
      outputPath,
      validatedConfig.compress
    );

    return {
      filePath: finalPath,
      fileName: basename(finalPath),
      sizeBytes,
      database: validatedConfig.database,
      createdAt: new Date(),
      compressed,
      metadata: {
        type: 'mysql',
        duration: Date.now() - startTime,
        host: validatedConfig.host,
        port: validatedConfig.port,
      },
    };
  }

  async cleanup(filePath: string): Promise<void> {
    await removeFile(filePath);
  }

  private buildArgs(config: MySQLConfig, outputPath: string): string[] {
    const args: string[] = [
      `--host=${config.host}`,
      `--port=${config.port}`,
      `--user=${config.user}`,
      `--result-file=${outputPath}`,
      '--single-transaction',
      '--quick',
      '--routines',
      '--triggers',
    ];

    if (config.ssl) {
      args.push('--ssl-mode=REQUIRED');
    }

    args.push(...config.additionalArgs);
    args.push(config.database);

    return args;
  }
}

export function createMySQLBackupStrategy(): BackupStrategy<MySQLConfig> {
  return new MySQLBackupStrategy();
}
