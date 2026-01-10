// Register default strategies
import { registerBackupStrategy, registerDeliveryStrategy } from './registry.js';
import { createMongoBackupStrategy } from './strategies/backup/mongodb.js';
import { createPostgresBackupStrategy } from './strategies/backup/postgresql.js';
import { createMySQLBackupStrategy } from './strategies/backup/mysql.js';
import { createDiscordDeliveryStrategy } from './strategies/delivery/discord.js';

registerBackupStrategy('mongodb', createMongoBackupStrategy);
registerBackupStrategy('postgresql', createPostgresBackupStrategy);
registerBackupStrategy('postgres', createPostgresBackupStrategy);
registerBackupStrategy('mysql', createMySQLBackupStrategy);

registerDeliveryStrategy('discord', createDiscordDeliveryStrategy);

// Core exports
export { BackupManager, backup } from './manager.js';
export type { SimpleBackupOptions } from './manager.js';

export { registry, registerBackupStrategy, registerDeliveryStrategy } from './registry.js';

export { BackupError } from './utils.js';

// Type exports
export type {
  BackupResult,
  DeliveryResult,
  BackupMetadata,
  BackupStrategy,
  DeliveryStrategy,
  BackupManagerConfig,
  BackupManagerResult,
  OnSuccessCallback,
  OnErrorCallback,
  OnProgressCallback,
} from './types.js';

// Backup strategy exports
export {
  MongoBackupStrategy,
  createMongoBackupStrategy,
  PostgresBackupStrategy,
  createPostgresBackupStrategy,
  MySQLBackupStrategy,
  createMySQLBackupStrategy,
  SQLiteBackupStrategy,
  createSQLiteBackupStrategy,
  RedisBackupStrategy,
  createRedisBackupStrategy,
} from './strategies/backup/index.js';

export type {
  MongoConfig,
  PostgresConfig,
  MySQLConfig,
  SQLiteConfig,
  RedisConfig,
} from './strategies/backup/index.js';

// Delivery strategy exports
export {
  DiscordDeliveryStrategy,
  createDiscordDeliveryStrategy,
  TelegramDeliveryStrategy,
  createTelegramDeliveryStrategy,
} from './strategies/delivery/index.js';

export type {
  DiscordConfig,
  TelegramConfig,
} from './strategies/delivery/index.js';
