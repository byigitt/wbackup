# @byigitt/wbackup

Database backup package with webhook delivery. Backup MongoDB and PostgreSQL databases, then send them to Discord, Telegram, or any custom webhook.

## Installation

```bash
npm install @byigitt/wbackup
# or
pnpm add @byigitt/wbackup
```

**Requirements:**
- Node.js 18+
- `mongodump` for MongoDB backups (install [MongoDB Database Tools](https://www.mongodb.com/docs/database-tools/installation/))
- `pg_dump` for PostgreSQL backups (install [PostgreSQL client](https://www.postgresql.org/download/))

## Quick Start

```typescript
import { backup } from '@byigitt/wbackup';

await backup({
  database: 'mongodb',
  connectionString: 'mongodb://localhost:27017/mydb',
  webhook: {
    type: 'discord',
    url: 'https://discord.com/api/webhooks/YOUR_WEBHOOK_URL',
  },
});
```

## Usage

### Simple API

```typescript
import { backup } from '@byigitt/wbackup';

// MongoDB to Discord
await backup({
  database: 'mongodb',
  connectionString: 'mongodb://localhost:27017/mydb',
  webhook: {
    type: 'discord',
    url: 'https://discord.com/api/webhooks/...',
    username: 'Backup Bot', // optional
  },
  compress: true,      // optional, default: true
  retainBackup: false, // optional, keep local file after upload
});

// PostgreSQL to Discord
await backup({
  database: 'postgresql',
  connectionString: 'postgresql://user:pass@localhost:5432/mydb',
  webhook: {
    type: 'discord',
    url: 'https://discord.com/api/webhooks/...',
  },
});
```

### Fluent API

For more control, use the `BackupManager` class:

```typescript
import { BackupManager } from '@byigitt/wbackup';

const result = await new BackupManager()
  .database('mongodb', {
    connectionString: 'mongodb://localhost:27017/mydb',
    database: 'mydb',           // optional: specific database
    collection: 'users',        // optional: specific collection
  })
  .delivery('discord', {
    webhookUrl: 'https://discord.com/api/webhooks/...',
    username: 'DB Backup',
    embedColor: 0x00ff00,       // green
    includeMetadata: true,
  })
  .compress(true)
  .retainBackup(false)
  .onProgress((phase, message) => {
    console.log(`[${phase}] ${message}`);
  })
  .onSuccess((result) => {
    console.log(`Backup completed in ${result.totalDuration}ms`);
  })
  .onError((error, phase) => {
    console.error(`Failed during ${phase}:`, error.message);
  })
  .run();
```

## Supported Databases

### MongoDB

Uses `mongodump` under the hood.

```typescript
.database('mongodb', {
  connectionString: 'mongodb://user:pass@localhost:27017/mydb',
  database: 'mydb',                    // optional
  collection: 'users',                 // optional
  authenticationDatabase: 'admin',     // optional
  additionalArgs: ['--gzip'],          // optional: extra mongodump args
  compress: true,                      // gzip the archive
})
```

### PostgreSQL

Uses `pg_dump` under the hood.

```typescript
.database('postgresql', {
  connectionString: 'postgresql://user:pass@localhost:5432/mydb',
  format: 'custom',        // 'plain' | 'custom' | 'directory' | 'tar'
  schema: 'public',        // optional: specific schema
  table: 'users',          // optional: specific table
  dataOnly: false,         // optional: skip schema
  schemaOnly: false,       // optional: skip data
  clean: false,            // optional: add DROP statements
  additionalArgs: [],      // optional: extra pg_dump args
  compress: true,          // gzip (only for 'plain' format)
})
```

## Supported Delivery Platforms

### Discord

```typescript
.delivery('discord', {
  webhookUrl: 'https://discord.com/api/webhooks/...',
  username: 'Backup Bot',     // optional
  avatarUrl: 'https://...',   // optional
  threadId: '123456789',      // optional: post to thread
  embedColor: 0x5865f2,       // optional: embed color
  includeMetadata: true,      // optional: show size, duration, etc.
})
```

### Telegram

Telegram is included but not registered by default. Register it first:

```typescript
import {
  BackupManager,
  registerDeliveryStrategy,
  createTelegramDeliveryStrategy
} from '@byigitt/wbackup';

// Register Telegram
registerDeliveryStrategy('telegram', createTelegramDeliveryStrategy);

// Use it
await new BackupManager()
  .database('mongodb', { connectionString: '...' })
  .delivery('telegram', {
    botToken: 'YOUR_BOT_TOKEN',
    chatId: 'YOUR_CHAT_ID',
    parseMode: 'HTML',           // 'HTML' | 'Markdown' | 'MarkdownV2'
    disableNotification: false,
    protectContent: false,
  })
  .run();
```

## Adding Custom Strategies

### Custom Database Strategy

```typescript
import { BackupStrategy, registerBackupStrategy } from '@byigitt/wbackup';
import { z } from 'zod';

const MyConfigSchema = z.object({
  connectionString: z.string(),
  compress: z.boolean().default(true),
});

class MyDatabaseStrategy implements BackupStrategy<z.infer<typeof MyConfigSchema>> {
  readonly name = 'mydatabase';
  readonly configSchema = MyConfigSchema;

  async backup(config) {
    // Your backup logic here
    return {
      filePath: '/path/to/backup.sql',
      fileName: 'backup.sql',
      sizeBytes: 1024,
      database: 'mydb',
      createdAt: new Date(),
      compressed: config.compress,
      metadata: { type: 'mydatabase' },
    };
  }

  async cleanup(filePath) {
    // Delete temp file
  }
}

// Register it
registerBackupStrategy('mydatabase', () => new MyDatabaseStrategy());

// Use it
await new BackupManager()
  .database('mydatabase', { connectionString: '...' })
  .delivery('discord', { webhookUrl: '...' })
  .run();
```

### Custom Delivery Strategy

```typescript
import { DeliveryStrategy, registerDeliveryStrategy } from '@byigitt/wbackup';
import { z } from 'zod';

const SlackConfigSchema = z.object({
  webhookUrl: z.string().url(),
  channel: z.string(),
});

class SlackDeliveryStrategy implements DeliveryStrategy<z.infer<typeof SlackConfigSchema>> {
  readonly name = 'slack';
  readonly configSchema = SlackConfigSchema;
  readonly maxFileSizeBytes = 1024 * 1024 * 1024; // 1GB

  async deliver(config, backup) {
    // Your delivery logic here
    return {
      success: true,
      platform: 'slack',
      deliveredAt: new Date(),
    };
  }
}

// Register and use
registerDeliveryStrategy('slack', () => new SlackDeliveryStrategy());
```

## API Reference

### `backup(options)`

Simple function for quick backups.

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `database` | `string` | Yes | Database type: `'mongodb'` or `'postgresql'` |
| `connectionString` | `string` | Yes | Database connection string |
| `databaseName` | `string` | No | Specific database name |
| `webhook.type` | `string` | Yes | Delivery type: `'discord'` |
| `webhook.url` | `string` | Yes | Webhook URL |
| `webhook.username` | `string` | No | Bot username |
| `compress` | `boolean` | No | Compress backup (default: `true`) |
| `retainBackup` | `boolean` | No | Keep local file (default: `false`) |

### `BackupManager`

Fluent builder for advanced usage.

| Method | Description |
|--------|-------------|
| `.database(type, config)` | Set database type and config |
| `.delivery(type, config)` | Set delivery type and config |
| `.compress(boolean)` | Enable/disable compression |
| `.retainBackup(boolean)` | Keep local backup file |
| `.onProgress(callback)` | Progress updates |
| `.onSuccess(callback)` | Success handler |
| `.onError(callback)` | Error handler |
| `.run()` | Execute backup |

### `BackupResult`

Returned after successful backup.

```typescript
{
  filePath: string;      // Path to backup file
  fileName: string;      // Backup filename
  sizeBytes: number;     // File size
  database: string;      // Database name
  createdAt: Date;       // Backup timestamp
  compressed: boolean;   // Was compressed
  metadata: {            // Extra info
    type: string;
    duration: number;
    // ...
  };
}
```

## Error Handling

```typescript
import { BackupManager, BackupError } from '@byigitt/wbackup';

try {
  await new BackupManager()
    .database('mongodb', { connectionString: '...' })
    .delivery('discord', { webhookUrl: '...' })
    .run();
} catch (error) {
  if (error instanceof BackupError) {
    console.error(`Failed during ${error.phase}:`, error.message);
    // error.phase is 'backup' | 'delivery' | 'cleanup'
  }
}
```

## File Size Limits

Large backups are automatically split into chunks:

| Platform | Max File Size |
|----------|---------------|
| Discord | 25 MB |
| Telegram | 50 MB |

## License

MIT
