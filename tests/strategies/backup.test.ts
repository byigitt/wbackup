import { describe, it, expect } from 'vitest';
import {
  MongoBackupStrategy,
  PostgresBackupStrategy,
  MySQLBackupStrategy,
  SQLiteBackupStrategy,
  RedisBackupStrategy,
} from '../../src/strategies/backup/index.js';

describe('MongoBackupStrategy', () => {
  const strategy = new MongoBackupStrategy();

  describe('metadata', () => {
    it('should have correct name', () => {
      expect(strategy.name).toBe('mongodb');
    });
  });

  describe('config validation', () => {
    it('should validate valid config', () => {
      const config = {
        connectionString: 'mongodb://localhost:27017/testdb',
      };
      const result = strategy.configSchema.parse(config);
      expect(result.connectionString).toBe('mongodb://localhost:27017/testdb');
      expect(result.compress).toBe(true); // default
    });

    it('should accept optional fields', () => {
      const config = {
        connectionString: 'mongodb://localhost:27017/testdb',
        database: 'mydb',
        collection: 'users',
        authenticationDatabase: 'admin',
        compress: false,
        additionalArgs: ['--gzip'],
      };
      const result = strategy.configSchema.parse(config);
      expect(result.database).toBe('mydb');
      expect(result.collection).toBe('users');
      expect(result.authenticationDatabase).toBe('admin');
      expect(result.compress).toBe(false);
      expect(result.additionalArgs).toEqual(['--gzip']);
    });

    it('should reject empty connection string', () => {
      const config = { connectionString: '' };
      expect(() => strategy.configSchema.parse(config)).toThrow();
    });

    it('should reject missing connection string', () => {
      expect(() => strategy.configSchema.parse({})).toThrow();
    });
  });
});

describe('PostgresBackupStrategy', () => {
  const strategy = new PostgresBackupStrategy();

  describe('metadata', () => {
    it('should have correct name', () => {
      expect(strategy.name).toBe('postgresql');
    });
  });

  describe('config validation', () => {
    it('should validate valid config', () => {
      const config = {
        connectionString: 'postgresql://user:pass@localhost:5432/testdb',
      };
      const result = strategy.configSchema.parse(config);
      expect(result.connectionString).toBe('postgresql://user:pass@localhost:5432/testdb');
      expect(result.format).toBe('custom'); // default
      expect(result.compress).toBe(true); // default
    });

    it('should accept all format options', () => {
      const formats = ['plain', 'custom', 'directory', 'tar'] as const;
      for (const format of formats) {
        const config = {
          connectionString: 'postgresql://localhost/db',
          format,
        };
        const result = strategy.configSchema.parse(config);
        expect(result.format).toBe(format);
      }
    });

    it('should accept optional fields', () => {
      const config = {
        connectionString: 'postgresql://localhost/db',
        schema: 'public',
        table: 'users',
        dataOnly: true,
        schemaOnly: false,
        clean: true,
        additionalArgs: ['--verbose'],
      };
      const result = strategy.configSchema.parse(config);
      expect(result.schema).toBe('public');
      expect(result.table).toBe('users');
      expect(result.dataOnly).toBe(true);
      expect(result.clean).toBe(true);
    });

    it('should reject invalid format', () => {
      const config = {
        connectionString: 'postgresql://localhost/db',
        format: 'invalid',
      };
      expect(() => strategy.configSchema.parse(config)).toThrow();
    });
  });
});

describe('MySQLBackupStrategy', () => {
  const strategy = new MySQLBackupStrategy();

  describe('metadata', () => {
    it('should have correct name', () => {
      expect(strategy.name).toBe('mysql');
    });
  });

  describe('config validation', () => {
    it('should validate valid config', () => {
      const config = {
        user: 'root',
        password: 'secret',
        database: 'testdb',
      };
      const result = strategy.configSchema.parse(config);
      expect(result.user).toBe('root');
      expect(result.database).toBe('testdb');
      expect(result.host).toBe('localhost');
      expect(result.port).toBe(3306);
      expect(result.compress).toBe(true);
      expect(result.ssl).toBe(false);
    });

    it('should accept optional fields', () => {
      const config = {
        host: '192.168.1.100',
        port: 3307,
        user: 'admin',
        password: 'pass',
        database: 'mydb',
        compress: false,
        ssl: true,
        additionalArgs: ['--skip-routines'],
      };
      const result = strategy.configSchema.parse(config);
      expect(result.host).toBe('192.168.1.100');
      expect(result.port).toBe(3307);
      expect(result.ssl).toBe(true);
    });

    it('should reject missing required fields', () => {
      expect(() => strategy.configSchema.parse({})).toThrow();
      expect(() => strategy.configSchema.parse({ user: 'root' })).toThrow();
      expect(() => strategy.configSchema.parse({ user: 'root', password: 'pass' })).toThrow();
    });
  });
});

describe('SQLiteBackupStrategy', () => {
  const strategy = new SQLiteBackupStrategy();

  describe('metadata', () => {
    it('should have correct name', () => {
      expect(strategy.name).toBe('sqlite');
    });
  });

  describe('config validation', () => {
    it('should validate valid config', () => {
      const config = { path: '/data/db.sqlite' };
      const result = strategy.configSchema.parse(config);
      expect(result.path).toBe('/data/db.sqlite');
      expect(result.compress).toBe(true);
    });

    it('should accept optional compress setting', () => {
      const config = { path: '/data/db.sqlite', compress: false };
      const result = strategy.configSchema.parse(config);
      expect(result.compress).toBe(false);
    });

    it('should reject missing path', () => {
      expect(() => strategy.configSchema.parse({})).toThrow();
    });

    it('should reject empty path', () => {
      expect(() => strategy.configSchema.parse({ path: '' })).toThrow();
    });
  });
});

describe('RedisBackupStrategy', () => {
  const strategy = new RedisBackupStrategy();

  describe('metadata', () => {
    it('should have correct name', () => {
      expect(strategy.name).toBe('redis');
    });
  });

  describe('config validation', () => {
    it('should validate minimal config with defaults', () => {
      const result = strategy.configSchema.parse({});
      expect(result.host).toBe('localhost');
      expect(result.port).toBe(6379);
      expect(result.database).toBe(0);
      expect(result.compress).toBe(true);
      expect(result.tls).toBe(false);
    });

    it('should accept custom rdbPath', () => {
      const config = { rdbPath: '/var/lib/redis/dump.rdb' };
      const result = strategy.configSchema.parse(config);
      expect(result.rdbPath).toBe('/var/lib/redis/dump.rdb');
    });

    it('should accept password and TLS', () => {
      const config = {
        host: 'redis.example.com',
        port: 6380,
        password: 'secret',
        tls: true,
      };
      const result = strategy.configSchema.parse(config);
      expect(result.host).toBe('redis.example.com');
      expect(result.port).toBe(6380);
      expect(result.password).toBe('secret');
      expect(result.tls).toBe(true);
    });

    it('should accept database number', () => {
      const config = { database: 5 };
      const result = strategy.configSchema.parse(config);
      expect(result.database).toBe(5);
    });
  });
});
