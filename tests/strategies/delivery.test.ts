import { describe, it, expect } from 'vitest';
import {
  DiscordDeliveryStrategy,
  TelegramDeliveryStrategy,
} from '../../src/strategies/delivery/index.js';

describe('DiscordDeliveryStrategy', () => {
  const strategy = new DiscordDeliveryStrategy();

  describe('metadata', () => {
    it('should have correct name', () => {
      expect(strategy.name).toBe('discord');
    });

    it('should have 25MB max file size', () => {
      expect(strategy.maxFileSizeBytes).toBe(25 * 1024 * 1024);
    });
  });

  describe('config validation', () => {
    it('should validate valid config', () => {
      const config = {
        webhookUrl: 'https://discord.com/api/webhooks/123/abc',
      };
      const result = strategy.configSchema.parse(config);
      expect(result.webhookUrl).toBe('https://discord.com/api/webhooks/123/abc');
      expect(result.username).toBe('Backup Bot'); // default
      expect(result.embedColor).toBe(0x5865f2); // default
      expect(result.includeMetadata).toBe(true); // default
    });

    it('should accept optional fields', () => {
      const config = {
        webhookUrl: 'https://discord.com/api/webhooks/123/abc',
        username: 'My Bot',
        avatarUrl: 'https://example.com/avatar.png',
        threadId: '987654321',
        embedColor: 0x00ff00,
        includeMetadata: false,
      };
      const result = strategy.configSchema.parse(config);
      expect(result.username).toBe('My Bot');
      expect(result.avatarUrl).toBe('https://example.com/avatar.png');
      expect(result.threadId).toBe('987654321');
      expect(result.embedColor).toBe(0x00ff00);
      expect(result.includeMetadata).toBe(false);
    });

    it('should reject invalid webhook URL', () => {
      const config = { webhookUrl: 'not-a-url' };
      expect(() => strategy.configSchema.parse(config)).toThrow();
    });

    it('should reject invalid avatar URL', () => {
      const config = {
        webhookUrl: 'https://discord.com/api/webhooks/123/abc',
        avatarUrl: 'not-a-url',
      };
      expect(() => strategy.configSchema.parse(config)).toThrow();
    });

    it('should reject missing webhook URL', () => {
      expect(() => strategy.configSchema.parse({})).toThrow();
    });
  });
});

describe('TelegramDeliveryStrategy', () => {
  const strategy = new TelegramDeliveryStrategy();

  describe('metadata', () => {
    it('should have correct name', () => {
      expect(strategy.name).toBe('telegram');
    });

    it('should have 50MB max file size', () => {
      expect(strategy.maxFileSizeBytes).toBe(50 * 1024 * 1024);
    });
  });

  describe('config validation', () => {
    it('should validate valid config', () => {
      const config = {
        botToken: '123456:ABC-DEF',
        chatId: '-1001234567890',
      };
      const result = strategy.configSchema.parse(config);
      expect(result.botToken).toBe('123456:ABC-DEF');
      expect(result.chatId).toBe('-1001234567890');
      expect(result.parseMode).toBe('HTML'); // default
      expect(result.disableNotification).toBe(false); // default
      expect(result.protectContent).toBe(false); // default
    });

    it('should accept all parse modes', () => {
      const modes = ['HTML', 'Markdown', 'MarkdownV2'] as const;
      for (const parseMode of modes) {
        const config = {
          botToken: '123:abc',
          chatId: '123',
          parseMode,
        };
        const result = strategy.configSchema.parse(config);
        expect(result.parseMode).toBe(parseMode);
      }
    });

    it('should accept optional fields', () => {
      const config = {
        botToken: '123:abc',
        chatId: '456',
        parseMode: 'MarkdownV2' as const,
        disableNotification: true,
        protectContent: true,
      };
      const result = strategy.configSchema.parse(config);
      expect(result.disableNotification).toBe(true);
      expect(result.protectContent).toBe(true);
    });

    it('should reject empty bot token', () => {
      const config = { botToken: '', chatId: '123' };
      expect(() => strategy.configSchema.parse(config)).toThrow();
    });

    it('should reject empty chat ID', () => {
      const config = { botToken: '123:abc', chatId: '' };
      expect(() => strategy.configSchema.parse(config)).toThrow();
    });

    it('should reject invalid parse mode', () => {
      const config = {
        botToken: '123:abc',
        chatId: '456',
        parseMode: 'invalid',
      };
      expect(() => strategy.configSchema.parse(config)).toThrow();
    });
  });
});
