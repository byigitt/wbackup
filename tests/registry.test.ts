import { describe, it, expect, beforeEach } from 'vitest';
import { z } from 'zod';
import type { BackupStrategy, DeliveryStrategy, BackupResult } from '../src/types.js';

// Create a fresh registry for testing (avoid polluting global registry)
class TestRegistry {
  private readonly backupStrategies = new Map<string, () => BackupStrategy>();
  private readonly deliveryStrategies = new Map<string, () => DeliveryStrategy>();

  registerBackup<TConfig>(name: string, factory: () => BackupStrategy<TConfig>): void {
    if (this.backupStrategies.has(name)) {
      throw new Error(`Backup strategy "${name}" is already registered`);
    }
    this.backupStrategies.set(name, factory as () => BackupStrategy);
  }

  registerDelivery<TConfig>(name: string, factory: () => DeliveryStrategy<TConfig>): void {
    if (this.deliveryStrategies.has(name)) {
      throw new Error(`Delivery strategy "${name}" is already registered`);
    }
    this.deliveryStrategies.set(name, factory as () => DeliveryStrategy);
  }

  getBackupStrategy(name: string): BackupStrategy {
    const factory = this.backupStrategies.get(name);
    if (!factory) {
      const available = Array.from(this.backupStrategies.keys()).join(', ');
      throw new Error(`Unknown backup strategy "${name}". Available: ${available || 'none'}`);
    }
    return factory();
  }

  getDeliveryStrategy(name: string): DeliveryStrategy {
    const factory = this.deliveryStrategies.get(name);
    if (!factory) {
      const available = Array.from(this.deliveryStrategies.keys()).join(', ');
      throw new Error(`Unknown delivery strategy "${name}". Available: ${available || 'none'}`);
    }
    return factory();
  }

  listBackupStrategies(): string[] {
    return Array.from(this.backupStrategies.keys());
  }

  listDeliveryStrategies(): string[] {
    return Array.from(this.deliveryStrategies.keys());
  }
}

// Mock strategies for testing
const MockConfigSchema = z.object({
  testValue: z.string(),
});

const createMockBackupStrategy = (): BackupStrategy<z.infer<typeof MockConfigSchema>> => ({
  name: 'mock-backup',
  configSchema: MockConfigSchema,
  async backup() {
    return {
      filePath: '/tmp/test.dump',
      fileName: 'test.dump',
      sizeBytes: 1024,
      database: 'testdb',
      createdAt: new Date(),
      compressed: false,
      metadata: { type: 'mock' },
    };
  },
  async cleanup() {},
});

const createMockDeliveryStrategy = (): DeliveryStrategy<z.infer<typeof MockConfigSchema>> => ({
  name: 'mock-delivery',
  configSchema: MockConfigSchema,
  maxFileSizeBytes: 1024 * 1024,
  async deliver(_config: z.infer<typeof MockConfigSchema>, _backup: BackupResult) {
    return {
      success: true,
      platform: 'mock',
      deliveredAt: new Date(),
    };
  },
});

describe('Registry', () => {
  let registry: TestRegistry;

  beforeEach(() => {
    registry = new TestRegistry();
  });

  describe('registerBackup', () => {
    it('should register a backup strategy', () => {
      registry.registerBackup('mock', createMockBackupStrategy);
      expect(registry.listBackupStrategies()).toContain('mock');
    });

    it('should throw if strategy already registered', () => {
      registry.registerBackup('mock', createMockBackupStrategy);
      expect(() => registry.registerBackup('mock', createMockBackupStrategy))
        .toThrow('Backup strategy "mock" is already registered');
    });
  });

  describe('registerDelivery', () => {
    it('should register a delivery strategy', () => {
      registry.registerDelivery('mock', createMockDeliveryStrategy);
      expect(registry.listDeliveryStrategies()).toContain('mock');
    });

    it('should throw if strategy already registered', () => {
      registry.registerDelivery('mock', createMockDeliveryStrategy);
      expect(() => registry.registerDelivery('mock', createMockDeliveryStrategy))
        .toThrow('Delivery strategy "mock" is already registered');
    });
  });

  describe('getBackupStrategy', () => {
    it('should return registered strategy', () => {
      registry.registerBackup('mock', createMockBackupStrategy);
      const strategy = registry.getBackupStrategy('mock');
      expect(strategy.name).toBe('mock-backup');
    });

    it('should throw for unknown strategy', () => {
      expect(() => registry.getBackupStrategy('unknown'))
        .toThrow('Unknown backup strategy "unknown". Available: none');
    });

    it('should list available strategies in error', () => {
      registry.registerBackup('mongo', createMockBackupStrategy);
      registry.registerBackup('postgres', createMockBackupStrategy);
      expect(() => registry.getBackupStrategy('unknown'))
        .toThrow('Available: mongo, postgres');
    });
  });

  describe('getDeliveryStrategy', () => {
    it('should return registered strategy', () => {
      registry.registerDelivery('mock', createMockDeliveryStrategy);
      const strategy = registry.getDeliveryStrategy('mock');
      expect(strategy.name).toBe('mock-delivery');
    });

    it('should throw for unknown strategy', () => {
      expect(() => registry.getDeliveryStrategy('unknown'))
        .toThrow('Unknown delivery strategy "unknown". Available: none');
    });
  });

  describe('listStrategies', () => {
    it('should list all backup strategies', () => {
      registry.registerBackup('mongo', createMockBackupStrategy);
      registry.registerBackup('postgres', createMockBackupStrategy);
      expect(registry.listBackupStrategies()).toEqual(['mongo', 'postgres']);
    });

    it('should list all delivery strategies', () => {
      registry.registerDelivery('discord', createMockDeliveryStrategy);
      registry.registerDelivery('telegram', createMockDeliveryStrategy);
      expect(registry.listDeliveryStrategies()).toEqual(['discord', 'telegram']);
    });
  });
});
