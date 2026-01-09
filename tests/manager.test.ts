import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';
import { BackupManager } from '../src/manager.js';
import { registry } from '../src/registry.js';
import type { BackupStrategy, DeliveryStrategy, BackupResult } from '../src/types.js';

// Mock strategies
const MockBackupConfigSchema = z.object({
  connectionString: z.string(),
  compress: z.boolean().default(true),
});

const MockDeliveryConfigSchema = z.object({
  webhookUrl: z.string(),
});

const mockBackupResult: BackupResult = {
  filePath: '/tmp/test-backup.dump',
  fileName: 'test-backup.dump',
  sizeBytes: 1024,
  database: 'testdb',
  createdAt: new Date(),
  compressed: true,
  metadata: { type: 'mock', duration: 100 },
};

const createMockBackupStrategy = (): BackupStrategy => ({
  name: 'mock-db',
  configSchema: MockBackupConfigSchema,
  backup: vi.fn().mockResolvedValue(mockBackupResult),
  cleanup: vi.fn().mockResolvedValue(undefined),
});

const createMockDeliveryStrategy = (): DeliveryStrategy => ({
  name: 'mock-webhook',
  configSchema: MockDeliveryConfigSchema,
  maxFileSizeBytes: 25 * 1024 * 1024,
  deliver: vi.fn().mockResolvedValue({
    success: true,
    platform: 'mock',
    messageId: '123',
    deliveredAt: new Date(),
  }),
});

describe('BackupManager', () => {
  let mockBackupStrategy: ReturnType<typeof createMockBackupStrategy>;
  let mockDeliveryStrategy: ReturnType<typeof createMockDeliveryStrategy>;

  beforeEach(() => {
    mockBackupStrategy = createMockBackupStrategy();
    mockDeliveryStrategy = createMockDeliveryStrategy();

    // Register mock strategies
    try {
      registry.registerBackup('mock-db', () => mockBackupStrategy);
    } catch {
      // Already registered
    }
    try {
      registry.registerDelivery('mock-webhook', () => mockDeliveryStrategy);
    } catch {
      // Already registered
    }
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('fluent API', () => {
    it('should chain methods correctly', () => {
      const manager = new BackupManager()
        .database('mock-db', { connectionString: 'test://' })
        .delivery('mock-webhook', { webhookUrl: 'https://test.com' })
        .compress(true)
        .retainBackup(false);

      expect(manager).toBeInstanceOf(BackupManager);
    });
  });

  describe('validation', () => {
    it('should throw if database not configured', async () => {
      const manager = new BackupManager()
        .delivery('mock-webhook', { webhookUrl: 'https://test.com' });

      await expect(manager.run()).rejects.toThrow('Database configuration is required');
    });

    it('should throw if delivery not configured', async () => {
      const manager = new BackupManager()
        .database('mock-db', { connectionString: 'test://' });

      await expect(manager.run()).rejects.toThrow('Delivery configuration is required');
    });
  });

  describe('run', () => {
    it('should execute backup and delivery', async () => {
      const result = await new BackupManager()
        .database('mock-db', { connectionString: 'test://' })
        .delivery('mock-webhook', { webhookUrl: 'https://test.com' })
        .run();

      expect(result.backup).toBeDefined();
      expect(result.delivery.success).toBe(true);
      expect(result.totalDuration).toBeGreaterThanOrEqual(0);
    });

    it('should call cleanup after successful delivery', async () => {
      await new BackupManager()
        .database('mock-db', { connectionString: 'test://' })
        .delivery('mock-webhook', { webhookUrl: 'https://test.com' })
        .run();

      expect(mockBackupStrategy.cleanup).toHaveBeenCalledWith(mockBackupResult.filePath);
    });

    it('should not cleanup if retainBackup is true', async () => {
      await new BackupManager()
        .database('mock-db', { connectionString: 'test://' })
        .delivery('mock-webhook', { webhookUrl: 'https://test.com' })
        .retainBackup(true)
        .run();

      expect(mockBackupStrategy.cleanup).not.toHaveBeenCalled();
    });
  });

  describe('callbacks', () => {
    it('should call onProgress during execution', async () => {
      const progressSpy = vi.fn();

      await new BackupManager()
        .database('mock-db', { connectionString: 'test://' })
        .delivery('mock-webhook', { webhookUrl: 'https://test.com' })
        .onProgress(progressSpy)
        .run();

      expect(progressSpy).toHaveBeenCalledWith('backup', expect.any(String));
      expect(progressSpy).toHaveBeenCalledWith('delivery', expect.any(String));
      expect(progressSpy).toHaveBeenCalledWith('cleanup', expect.any(String));
    });

    it('should call onSuccess after completion', async () => {
      const successSpy = vi.fn();

      await new BackupManager()
        .database('mock-db', { connectionString: 'test://' })
        .delivery('mock-webhook', { webhookUrl: 'https://test.com' })
        .onSuccess(successSpy)
        .run();

      expect(successSpy).toHaveBeenCalledWith(expect.objectContaining({
        backup: expect.any(Object),
        delivery: expect.any(Object),
        totalDuration: expect.any(Number),
      }));
    });

    it('should call onError on failure', async () => {
      const errorSpy = vi.fn();
      const failingDelivery = createMockDeliveryStrategy();
      (failingDelivery.deliver as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: false,
        platform: 'mock',
        error: 'Test failure',
        deliveredAt: new Date(),
      });

      try {
        registry.registerDelivery('failing-webhook', () => failingDelivery);
      } catch {
        // Already registered
      }

      await expect(
        new BackupManager()
          .database('mock-db', { connectionString: 'test://' })
          .delivery('failing-webhook', { webhookUrl: 'https://test.com' })
          .onError(errorSpy)
          .run()
      ).rejects.toThrow();

      expect(errorSpy).toHaveBeenCalledWith(expect.any(Error), 'delivery');
    });
  });

  describe('error handling', () => {
    it('should cleanup on delivery failure', async () => {
      const failingDelivery = createMockDeliveryStrategy();
      (failingDelivery.deliver as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));

      try {
        registry.registerDelivery('error-webhook', () => failingDelivery);
      } catch {
        // Already registered
      }

      await expect(
        new BackupManager()
          .database('mock-db', { connectionString: 'test://' })
          .delivery('error-webhook', { webhookUrl: 'https://test.com' })
          .run()
      ).rejects.toThrow('Network error');

      expect(mockBackupStrategy.cleanup).toHaveBeenCalled();
    });
  });
});
