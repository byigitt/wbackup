import type {
  BackupResult,
  BackupManagerResult,
  OnSuccessCallback,
  OnErrorCallback,
  OnProgressCallback,
} from './types.js';
import { registry } from './registry.js';
import { BackupError } from './utils.js';

export class BackupManager {
  private databaseConfig?: { type: string; config: Record<string, unknown> };
  private deliveryConfig?: { type: string; config: Record<string, unknown> };
  private shouldCompress = true;
  private shouldRetainBackup = false;
  private onSuccessCallback?: OnSuccessCallback;
  private onErrorCallback?: OnErrorCallback;
  private onProgressCallback?: OnProgressCallback;

  database(type: string, config: Record<string, unknown>): this {
    this.databaseConfig = { type, config };
    return this;
  }

  delivery(type: string, config: Record<string, unknown>): this {
    this.deliveryConfig = { type, config };
    return this;
  }

  compress(enabled: boolean): this {
    this.shouldCompress = enabled;
    return this;
  }

  retainBackup(enabled: boolean): this {
    this.shouldRetainBackup = enabled;
    return this;
  }

  onSuccess(callback: OnSuccessCallback): this {
    this.onSuccessCallback = callback;
    return this;
  }

  onError(callback: OnErrorCallback): this {
    this.onErrorCallback = callback;
    return this;
  }

  onProgress(callback: OnProgressCallback): this {
    this.onProgressCallback = callback;
    return this;
  }

  async run(): Promise<BackupManagerResult> {
    if (!this.databaseConfig) {
      throw new Error('Database configuration is required. Call .database() first.');
    }
    if (!this.deliveryConfig) {
      throw new Error('Delivery configuration is required. Call .delivery() first.');
    }

    const startTime = Date.now();
    const backupStrategy = registry.getBackupStrategy(this.databaseConfig.type);
    const deliveryStrategy = registry.getDeliveryStrategy(this.deliveryConfig.type);

    let backupResult: BackupResult | undefined;

    try {
      // Phase 1: Backup
      this.progress('backup', `Starting ${backupStrategy.name} backup...`);

      const backupConfig = { ...this.databaseConfig.config, compress: this.shouldCompress };
      const validatedBackupConfig = backupStrategy.configSchema.parse(backupConfig);
      backupResult = await backupStrategy.backup(validatedBackupConfig);

      this.progress('backup', `Backup completed: ${backupResult.fileName}`);

      // Phase 2: Delivery
      this.progress('delivery', `Sending to ${deliveryStrategy.name}...`);

      const validatedDeliveryConfig = deliveryStrategy.configSchema.parse(this.deliveryConfig.config);
      const deliveryResult = await deliveryStrategy.deliver(validatedDeliveryConfig, backupResult);

      if (!deliveryResult.success) {
        throw new BackupError(deliveryResult.error ?? 'Delivery failed', 'delivery');
      }

      this.progress('delivery', 'Delivery completed successfully');

      // Phase 3: Cleanup
      if (!this.shouldRetainBackup) {
        this.progress('cleanup', 'Cleaning up temporary files...');
        await backupStrategy.cleanup(backupResult.filePath);
        this.progress('cleanup', 'Cleanup completed');
      }

      const result: BackupManagerResult = {
        backup: backupResult,
        delivery: deliveryResult,
        totalDuration: Date.now() - startTime,
      };

      await this.onSuccessCallback?.(result);
      return result;
    } catch (error) {
      const phase = error instanceof BackupError ? error.phase : 'backup';

      // Attempt cleanup on failure
      if (backupResult && !this.shouldRetainBackup) {
        await backupStrategy.cleanup(backupResult.filePath).catch(() => {});
      }

      if (this.onErrorCallback) {
        const err = error instanceof Error ? error : new Error(String(error));
        await this.onErrorCallback(err, phase);
      }

      throw error;
    }
  }

  private progress(phase: string, message: string): void {
    this.onProgressCallback?.(phase, message);
  }
}

// Simple functional API
export interface SimpleBackupOptions {
  database: string;
  connectionString: string;
  databaseName?: string;
  webhook: {
    type: string;
    url: string;
    username?: string;
  };
  compress?: boolean;
  retainBackup?: boolean;
}

export function backup(options: SimpleBackupOptions): Promise<BackupManagerResult> {
  const manager = new BackupManager()
    .database(options.database, {
      connectionString: options.connectionString,
      database: options.databaseName,
    })
    .delivery(options.webhook.type, {
      webhookUrl: options.webhook.url,
      username: options.webhook.username,
    });

  if (options.compress !== undefined) {
    manager.compress(options.compress);
  }

  if (options.retainBackup !== undefined) {
    manager.retainBackup(options.retainBackup);
  }

  return manager.run();
}
