import { z } from 'zod';

// ============================================================================
// Core Types
// ============================================================================

export interface BackupResult {
  readonly filePath: string;
  readonly fileName: string;
  readonly sizeBytes: number;
  readonly database: string;
  readonly createdAt: Date;
  readonly compressed: boolean;
  readonly metadata: Record<string, unknown>;
}

export interface DeliveryResult {
  readonly success: boolean;
  readonly platform: string;
  readonly messageId?: string;
  readonly error?: string;
  readonly deliveredAt: Date;
}

export interface BackupMetadata {
  readonly database: string;
  readonly host: string;
  readonly timestamp: Date;
  readonly sizeBytes: number;
  readonly compressed: boolean;
  readonly duration: number;
}

// ============================================================================
// Strategy Interfaces
// ============================================================================

export interface BackupStrategy<TConfig = unknown> {
  readonly name: string;
  readonly configSchema: z.ZodType<TConfig>;
  backup(config: TConfig): Promise<BackupResult>;
  cleanup(filePath: string): Promise<void>;
}

export interface DeliveryStrategy<TConfig = unknown> {
  readonly name: string;
  readonly configSchema: z.ZodType<TConfig>;
  readonly maxFileSizeBytes: number;
  deliver(config: TConfig, backup: BackupResult): Promise<DeliveryResult>;
}

// ============================================================================
// Registry Types
// ============================================================================

export type BackupStrategyFactory<TConfig = unknown> = () => BackupStrategy<TConfig>;
export type DeliveryStrategyFactory<TConfig = unknown> = () => DeliveryStrategy<TConfig>;

// ============================================================================
// Manager Types
// ============================================================================

export interface BackupManagerConfig {
  database: {
    type: string;
    config: unknown;
  };
  delivery: {
    type: string;
    config: unknown;
  };
  compress: boolean;
  retainBackup: boolean;
  tempDir?: string;
}

export interface BackupManagerResult {
  readonly backup: BackupResult;
  readonly delivery: DeliveryResult;
  readonly totalDuration: number;
}

// ============================================================================
// Event Callbacks
// ============================================================================

export type OnSuccessCallback = (result: BackupManagerResult) => void | Promise<void>;
export type OnErrorCallback = (error: Error, phase: 'backup' | 'delivery' | 'cleanup') => void | Promise<void>;
export type OnProgressCallback = (phase: string, message: string) => void;
