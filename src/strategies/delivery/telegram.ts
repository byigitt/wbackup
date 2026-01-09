/**
 * Telegram Delivery Strategy
 *
 * Usage:
 * ```typescript
 * import { registerDeliveryStrategy, createTelegramDeliveryStrategy } from 'wbackup';
 *
 * registerDeliveryStrategy('telegram', createTelegramDeliveryStrategy);
 *
 * const manager = new BackupManager()
 *   .database('mongodb', { connectionString: '...' })
 *   .delivery('telegram', {
 *     botToken: 'your-bot-token',
 *     chatId: 'your-chat-id',
 *   });
 *
 * await manager.run();
 * ```
 */

import { z } from 'zod';
import type { BackupResult, DeliveryResult, DeliveryStrategy } from '../../types.js';
import { formatBytes, formatDuration, splitFile, removeFile, readFileAsBlob, BackupError } from '../../utils.js';

const TELEGRAM_MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

const TelegramConfigSchema = z.object({
  botToken: z.string().min(1, 'Bot token is required'),
  chatId: z.string().min(1, 'Chat ID is required'),
  parseMode: z.enum(['HTML', 'Markdown', 'MarkdownV2']).default('HTML'),
  disableNotification: z.boolean().default(false),
  protectContent: z.boolean().default(false),
});

export type TelegramConfig = z.infer<typeof TelegramConfigSchema>;

export class TelegramDeliveryStrategy implements DeliveryStrategy<TelegramConfig> {
  readonly name = 'telegram';
  readonly configSchema = TelegramConfigSchema;
  readonly maxFileSizeBytes = TELEGRAM_MAX_FILE_SIZE;

  async deliver(config: TelegramConfig, backup: BackupResult): Promise<DeliveryResult> {
    const validatedConfig = this.configSchema.parse(config);

    try {
      const chunks = await splitFile(backup.filePath, this.maxFileSizeBytes);
      const isMultiPart = chunks.length > 1;
      let messageId: string | undefined;

      for (let i = 0; i < chunks.length; i++) {
        const chunkPath = chunks[i];
        if (!chunkPath) continue;

        const captionOptions = isMultiPart
          ? { partNumber: i + 1, totalParts: chunks.length }
          : {};
        const caption = this.buildCaption(backup, captionOptions);

        const response = await this.sendDocument(validatedConfig, chunkPath, caption);

        if (i === 0) {
          messageId = response.result.message_id.toString();
        }

        if (isMultiPart) {
          await removeFile(chunkPath);
        }
      }

      const result: DeliveryResult = {
        success: true,
        platform: 'telegram',
        deliveredAt: new Date(),
      };

      if (messageId !== undefined) {
        return { ...result, messageId };
      }
      return result;
    } catch (error) {
      return {
        success: false,
        platform: 'telegram',
        error: error instanceof Error ? error.message : 'Unknown error',
        deliveredAt: new Date(),
      };
    }
  }

  private buildCaption(
    backup: BackupResult,
    options: { partNumber?: number; totalParts?: number }
  ): string {
    const parts: string[] = [];

    let title = `<b>Database Backup: ${backup.database}</b>`;
    if (options.partNumber !== undefined && options.totalParts !== undefined) {
      title += ` (Part ${options.partNumber}/${options.totalParts})`;
    }
    parts.push(title, '');

    parts.push(`<b>Size:</b> ${formatBytes(backup.sizeBytes)}`);
    parts.push(`<b>Compressed:</b> ${backup.compressed ? 'Yes' : 'No'}`);

    const duration = backup.metadata['duration'];
    if (typeof duration === 'number') {
      parts.push(`<b>Duration:</b> ${formatDuration(duration)}`);
    }

    const dbType = backup.metadata['type'];
    if (typeof dbType === 'string') {
      parts.push(`<b>Type:</b> ${dbType.toUpperCase()}`);
    }

    parts.push('', `<i>${backup.createdAt.toISOString()}</i>`);

    return parts.join('\n');
  }

  private async sendDocument(
    config: TelegramConfig,
    filePath: string,
    caption: string
  ): Promise<{ result: { message_id: number } }> {
    const url = `https://api.telegram.org/bot${config.botToken}/sendDocument`;

    const { blob, fileName } = await readFileAsBlob(filePath);
    const formData = new FormData();

    formData.append('chat_id', config.chatId);
    formData.append('caption', caption);
    formData.append('parse_mode', config.parseMode);
    formData.append('document', blob, fileName);

    if (config.disableNotification) {
      formData.append('disable_notification', 'true');
    }
    if (config.protectContent) {
      formData.append('protect_content', 'true');
    }

    const response = await fetch(url, { method: 'POST', body: formData });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new BackupError(`Telegram API error (${response.status}): ${errorBody}`, 'delivery');
    }

    return response.json() as Promise<{ result: { message_id: number } }>;
  }
}

export function createTelegramDeliveryStrategy(): DeliveryStrategy<TelegramConfig> {
  return new TelegramDeliveryStrategy();
}
