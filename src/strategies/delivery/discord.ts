import { z } from 'zod';
import type { BackupResult, DeliveryResult, DeliveryStrategy } from '../../types.js';
import { formatBytes, formatDuration, splitFile, removeFile, readFileAsBlob, BackupError } from '../../utils.js';

const DISCORD_MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB

const DiscordConfigSchema = z.object({
  webhookUrl: z.string().url('Invalid Discord webhook URL'),
  username: z.string().default('Backup Bot'),
  avatarUrl: z.string().url().optional(),
  threadId: z.string().optional(),
  embedColor: z.number().default(0x5865f2),
  includeMetadata: z.boolean().default(true),
});

export type DiscordConfig = z.infer<typeof DiscordConfigSchema>;

interface DiscordEmbed {
  title: string;
  color: number;
  fields: Array<{ name: string; value: string; inline?: boolean }>;
  timestamp: string;
  footer: { text: string };
}

export class DiscordDeliveryStrategy implements DeliveryStrategy<DiscordConfig> {
  readonly name = 'discord';
  readonly configSchema = DiscordConfigSchema;
  readonly maxFileSizeBytes = DISCORD_MAX_FILE_SIZE;

  async deliver(config: DiscordConfig, backup: BackupResult): Promise<DeliveryResult> {
    const validatedConfig = this.configSchema.parse(config);

    try {
      const chunks = await splitFile(backup.filePath, this.maxFileSizeBytes);
      const isMultiPart = chunks.length > 1;
      let messageId: string | undefined;

      for (let i = 0; i < chunks.length; i++) {
        const chunkPath = chunks[i];
        if (!chunkPath) continue;

        const embedOptions = isMultiPart
          ? { partNumber: i + 1, totalParts: chunks.length }
          : {};
        const embed = this.buildEmbed(validatedConfig, backup, embedOptions);

        const response = await this.sendFile(validatedConfig, chunkPath, embed);

        if (i === 0) {
          messageId = response.id;
        }

        if (isMultiPart) {
          await removeFile(chunkPath);
        }
      }

      const result: DeliveryResult = {
        success: true,
        platform: 'discord',
        deliveredAt: new Date(),
      };

      if (messageId !== undefined) {
        return { ...result, messageId };
      }
      return result;
    } catch (error) {
      return {
        success: false,
        platform: 'discord',
        error: error instanceof Error ? error.message : 'Unknown error',
        deliveredAt: new Date(),
      };
    }
  }

  private buildEmbed(
    config: DiscordConfig,
    backup: BackupResult,
    options: { partNumber?: number; totalParts?: number }
  ): DiscordEmbed {
    const fields: DiscordEmbed['fields'] = [];

    if (config.includeMetadata) {
      fields.push(
        { name: 'Database', value: backup.database, inline: true },
        { name: 'Size', value: formatBytes(backup.sizeBytes), inline: true },
        { name: 'Compressed', value: backup.compressed ? 'Yes' : 'No', inline: true }
      );

      const duration = backup.metadata['duration'];
      if (typeof duration === 'number') {
        fields.push({ name: 'Duration', value: formatDuration(duration), inline: true });
      }

      const dbType = backup.metadata['type'];
      if (typeof dbType === 'string') {
        fields.push({ name: 'Type', value: dbType.toUpperCase(), inline: true });
      }
    }

    let title = `Database Backup: ${backup.database}`;
    if (options.partNumber !== undefined && options.totalParts !== undefined) {
      title += ` (Part ${options.partNumber}/${options.totalParts})`;
    }

    return {
      title,
      color: config.embedColor,
      fields,
      timestamp: backup.createdAt.toISOString(),
      footer: { text: 'wbackup' },
    };
  }

  private async sendFile(
    config: DiscordConfig,
    filePath: string,
    embed: DiscordEmbed
  ): Promise<{ id: string }> {
    const url = new URL(config.webhookUrl);
    url.searchParams.set('wait', 'true');
    if (config.threadId) {
      url.searchParams.set('thread_id', config.threadId);
    }

    const { blob, fileName } = await readFileAsBlob(filePath);
    const formData = new FormData();

    const payload: Record<string, unknown> = {
      username: config.username,
      embeds: [embed],
    };
    if (config.avatarUrl) {
      payload['avatar_url'] = config.avatarUrl;
    }

    formData.append('payload_json', JSON.stringify(payload));
    formData.append('file', blob, fileName);

    const response = await fetch(url.toString(), { method: 'POST', body: formData });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new BackupError(`Discord API error (${response.status}): ${errorBody}`, 'delivery');
    }

    return response.json() as Promise<{ id: string }>;
  }
}

export function createDiscordDeliveryStrategy(): DeliveryStrategy<DiscordConfig> {
  return new DiscordDeliveryStrategy();
}
