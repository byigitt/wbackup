import type {
  BackupStrategy,
  DeliveryStrategy,
  BackupStrategyFactory,
  DeliveryStrategyFactory,
} from './types.js';

class Registry {
  private readonly backupStrategies = new Map<string, BackupStrategyFactory>();
  private readonly deliveryStrategies = new Map<string, DeliveryStrategyFactory>();

  registerBackup<TConfig>(name: string, factory: () => BackupStrategy<TConfig>): void {
    if (this.backupStrategies.has(name)) {
      throw new Error(`Backup strategy "${name}" is already registered`);
    }
    this.backupStrategies.set(name, factory as BackupStrategyFactory);
  }

  registerDelivery<TConfig>(name: string, factory: () => DeliveryStrategy<TConfig>): void {
    if (this.deliveryStrategies.has(name)) {
      throw new Error(`Delivery strategy "${name}" is already registered`);
    }
    this.deliveryStrategies.set(name, factory as DeliveryStrategyFactory);
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

export const registry = new Registry();

// Convenience functions that delegate to the singleton registry
export const registerBackupStrategy = registry.registerBackup.bind(registry);
export const registerDeliveryStrategy = registry.registerDelivery.bind(registry);
