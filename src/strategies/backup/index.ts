export { MongoBackupStrategy, createMongoBackupStrategy } from './mongodb.js';
export type { MongoConfig } from './mongodb.js';

export { PostgresBackupStrategy, createPostgresBackupStrategy } from './postgresql.js';
export type { PostgresConfig } from './postgresql.js';

// Extension stubs - not registered by default
export { MySQLBackupStrategy, createMySQLBackupStrategy } from './mysql.js';
export type { MySQLConfig } from './mysql.js';
