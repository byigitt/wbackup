import { basename } from 'node:path';
import { z } from 'zod';
import type { BackupResult, BackupStrategy } from '../../types.js';
import {
  generateTempPath,
  maybeCompress,
  removeFile,
  runCommand,
} from '../../utils.js';

const PostgresConfigSchema = z.object({
  connectionString: z.string().min(1, 'Connection string is required'),
  format: z.enum(['plain', 'custom', 'directory', 'tar']).default('custom'),
  compress: z.boolean().default(true),
  schema: z.string().optional(),
  table: z.string().optional(),
  dataOnly: z.boolean().default(false),
  schemaOnly: z.boolean().default(false),
  clean: z.boolean().default(false),
  additionalArgs: z.array(z.string()).default([]),
});

export type PostgresConfig = z.infer<typeof PostgresConfigSchema>;

const FORMAT_EXTENSIONS: Record<string, string> = {
  plain: '.sql',
  custom: '.dump',
  tar: '.tar',
  directory: '',
};

export class PostgresBackupStrategy implements BackupStrategy<PostgresConfig> {
  readonly name = 'postgresql';
  readonly configSchema = PostgresConfigSchema;

  async backup(config: PostgresConfig): Promise<BackupResult> {
    const validatedConfig = this.configSchema.parse(config);
    const startTime = Date.now();

    const extension = FORMAT_EXTENSIONS[validatedConfig.format] ?? '.dump';
    const outputPath = generateTempPath('postgres-backup', extension);
    const args = this.buildArgs(validatedConfig, outputPath);
    const env = this.buildEnv(validatedConfig);

    await runCommand({
      command: 'pg_dump',
      args,
      env,
      notFoundMessage: 'pg_dump not found. Please install PostgreSQL client tools.',
    });

    // Only compress plain SQL format - others have built-in compression
    const shouldCompress = validatedConfig.compress && validatedConfig.format === 'plain';
    const { finalPath, compressed, sizeBytes } = await maybeCompress(outputPath, shouldCompress);

    return {
      filePath: finalPath,
      fileName: basename(finalPath),
      sizeBytes,
      database: this.extractDatabaseName(validatedConfig.connectionString),
      createdAt: new Date(),
      compressed,
      metadata: {
        type: 'postgresql',
        format: validatedConfig.format,
        duration: Date.now() - startTime,
        schema: validatedConfig.schema,
        table: validatedConfig.table,
      },
    };
  }

  async cleanup(filePath: string): Promise<void> {
    await removeFile(filePath);
  }

  private buildArgs(config: PostgresConfig, outputPath: string): string[] {
    const args: string[] = [`--format=${config.format}`, `--file=${outputPath}`];

    if (config.schema) {
      args.push(`--schema=${config.schema}`);
    }
    if (config.table) {
      args.push(`--table=${config.table}`);
    }
    if (config.dataOnly) {
      args.push('--data-only');
    }
    if (config.schemaOnly) {
      args.push('--schema-only');
    }
    if (config.clean) {
      args.push('--clean');
    }
    if (config.format === 'custom') {
      args.push('--compress=9');
    }

    args.push(...config.additionalArgs);
    args.push(config.connectionString);

    return args;
  }

  private buildEnv(config: PostgresConfig): NodeJS.ProcessEnv {
    const env = { ...process.env };

    try {
      const url = new URL(config.connectionString);
      if (url.password) {
        env['PGPASSWORD'] = decodeURIComponent(url.password);
      }
    } catch {
      // Not a URL format, let pg_dump handle it
    }

    return env;
  }

  private extractDatabaseName(connectionString: string): string {
    try {
      const url = new URL(connectionString);
      const dbFromPath = url.pathname.slice(1);
      return dbFromPath || 'postgres';
    } catch {
      const match = /dbname=([^\s]+)/i.exec(connectionString);
      return match?.[1] ?? 'postgres';
    }
  }
}

export function createPostgresBackupStrategy(): BackupStrategy<PostgresConfig> {
  return new PostgresBackupStrategy();
}
