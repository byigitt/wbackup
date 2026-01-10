import { basename } from 'node:path';
import { z } from 'zod';
import type { BackupResult, BackupStrategy } from '../../types.js';
import {
  generateTempPath,
  maybeCompress,
  removeFile,
  runCommand,
} from '../../utils.js';

const MongoConfigSchema = z.object({
  connectionString: z.string().min(1, 'Connection string is required'),
  database: z.string().optional(),
  collection: z.string().optional(),
  compress: z.boolean().default(true),
  authenticationDatabase: z.string().optional(),
  additionalArgs: z.array(z.string()).default([]),
});

export type MongoConfig = z.infer<typeof MongoConfigSchema>;

export class MongoBackupStrategy implements BackupStrategy<MongoConfig> {
  readonly name = 'mongodb';
  readonly configSchema = MongoConfigSchema;

  async backup(config: MongoConfig): Promise<BackupResult> {
    const validatedConfig = this.configSchema.parse(config);
    const startTime = Date.now();

    const archivePath = generateTempPath('mongodb-backup', '.archive');
    const args = this.buildArgs(validatedConfig, archivePath);

    await runCommand({
      command: 'mongodump',
      args,
      notFoundMessage: 'mongodump not found. Please install MongoDB Database Tools.',
    });

    const { finalPath, compressed, sizeBytes } = await maybeCompress(
      archivePath,
      validatedConfig.compress
    );

    return {
      filePath: finalPath,
      fileName: basename(finalPath),
      sizeBytes,
      database: this.extractDatabaseName(validatedConfig),
      createdAt: new Date(),
      compressed,
      metadata: {
        type: 'mongodb',
        duration: Date.now() - startTime,
        collection: validatedConfig.collection,
      },
    };
  }

  async cleanup(filePath: string): Promise<void> {
    await removeFile(filePath);
  }

  private buildArgs(config: MongoConfig, archivePath: string): string[] {
    const args: string[] = [`--uri=${config.connectionString}`, `--archive=${archivePath}`];

    if (config.database) {
      args.push(`--db=${config.database}`);
    }
    if (config.collection) {
      args.push(`--collection=${config.collection}`);
    }
    if (config.authenticationDatabase) {
      args.push(`--authenticationDatabase=${config.authenticationDatabase}`);
    }

    args.push(...config.additionalArgs);
    return args;
  }

  private extractDatabaseName(config: MongoConfig): string {
    if (config.database) {
      return config.database;
    }

    try {
      const url = new URL(config.connectionString);
      const dbFromPath = url.pathname.slice(1).split('?')[0];
      return dbFromPath || 'all-databases';
    } catch {
      return 'mongodb';
    }
  }
}

export function createMongoBackupStrategy(): BackupStrategy<MongoConfig> {
  return new MongoBackupStrategy();
}
