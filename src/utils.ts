import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rm, stat, readFile } from 'node:fs/promises';
import { createGzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';

export class BackupError extends Error {
  constructor(
    message: string,
    public readonly phase: 'backup' | 'delivery' | 'cleanup',
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'BackupError';
  }
}

export async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

export async function removeFile(filePath: string): Promise<void> {
  await rm(filePath, { force: true }).catch(() => {});
}

export async function getFileSize(filePath: string): Promise<number> {
  const stats = await stat(filePath);
  return stats.size;
}

export async function compressFile(inputPath: string): Promise<string> {
  const outputPath = `${inputPath}.gz`;
  const gzip = createGzip({ level: 9 });
  const source = createReadStream(inputPath);
  const destination = createWriteStream(outputPath);

  await pipeline(source, gzip, destination);
  await removeFile(inputPath);

  return outputPath;
}

export function generateTempPath(prefix: string, extension: string): string {
  const id = randomBytes(8).toString('hex');
  const timestamp = Date.now();
  return join(tmpdir(), `${prefix}-${timestamp}-${id}${extension}`);
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const size = sizes[i];
  if (!size) return `${bytes} B`;
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${size}`;
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
  return `${(ms / 60000).toFixed(2)}m`;
}

export async function splitFile(filePath: string, maxSizeBytes: number): Promise<string[]> {
  const fileSize = await getFileSize(filePath);

  if (fileSize <= maxSizeBytes) {
    return [filePath];
  }

  const chunks: string[] = [];
  const numChunks = Math.ceil(fileSize / maxSizeBytes);
  const { writeFile } = await import('node:fs/promises');
  const buffer = await readFile(filePath);

  for (let i = 0; i < numChunks; i++) {
    const start = i * maxSizeBytes;
    const end = Math.min(start + maxSizeBytes, fileSize);
    const chunk = buffer.subarray(start, end);
    const chunkPath = `${filePath}.part${i + 1}`;
    await writeFile(chunkPath, chunk);
    chunks.push(chunkPath);
  }

  return chunks;
}

// Shared utility for running CLI commands (used by backup strategies)
export interface RunCommandOptions {
  command: string;
  args: string[];
  env?: NodeJS.ProcessEnv;
  notFoundMessage: string;
}

export function runCommand(options: RunCommandOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(options.command, options.args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: options.env ?? process.env,
    });

    let stderr = '';

    child.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    child.on('error', (error) => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        reject(new BackupError(options.notFoundMessage, 'backup', error));
      } else {
        reject(new BackupError(`Failed to spawn ${options.command}: ${error.message}`, 'backup', error));
      }
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new BackupError(`${options.command} exited with code ${code}: ${stderr}`, 'backup'));
      }
    });
  });
}

// Shared utility for reading a file as a Blob (used by delivery strategies)
export async function readFileAsBlob(filePath: string): Promise<{ blob: Blob; fileName: string }> {
  const fileBuffer = await readFile(filePath);
  const fileName = basename(filePath);
  return { blob: new Blob([fileBuffer]), fileName };
}
