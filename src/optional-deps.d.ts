// Type declarations for optional peer dependencies
// These modules are dynamically imported and may not be installed

declare module 'better-sqlite3' {
  interface DatabaseOptions {
    readonly?: boolean;
    timeout?: number;
  }

  interface Database {
    pragma(source: string): unknown;
    backup(destinationFile: string): Promise<void>;
    close(): void;
  }

  interface DatabaseConstructor {
    (filename: string, options?: DatabaseOptions): Database;
    new (filename: string, options?: DatabaseOptions): Database;
  }

  const Database: DatabaseConstructor;
  export default Database;
}

declare module 'ioredis' {
  interface RedisOptions {
    host?: string;
    port?: number;
    password?: string;
    db?: number;
    enableReadyCheck?: boolean;
    maxRetriesPerRequest?: number;
    connectTimeout?: number;
    tls?: { rejectUnauthorized?: boolean };
  }

  interface Redis {
    config(command: 'GET', key: string): Promise<string[]>;
    lastsave(): Promise<number>;
    bgsave(): Promise<string>;
    info(section?: string): Promise<string>;
    disconnect(): void;
    once(event: 'ready', listener: () => void): this;
    once(event: 'error', listener: (err: Error) => void): this;
  }

  interface RedisConstructor {
    new (options?: RedisOptions): Redis;
  }

  const Redis: RedisConstructor;
  export default Redis;
}
