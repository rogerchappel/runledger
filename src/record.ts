import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { redactSecrets } from './redact.js';
import { withHash } from './hash.js';
import type { RunRecord } from './types.js';

export const OUTPUT_CAPTURE_LIMIT_BYTES = 1024 * 1024;

function completeUtf8PrefixLength(buffer: Buffer): number {
  if (buffer.length === 0) return 0;
  let leadIndex = buffer.length - 1;
  while (leadIndex >= 0 && (buffer[leadIndex]! & 0xc0) === 0x80) leadIndex -= 1;
  if (leadIndex < 0) return buffer.length;

  const lead = buffer[leadIndex]!;
  const expectedBytes =
    (lead & 0x80) === 0 ? 1
      : (lead & 0xe0) === 0xc0 ? 2
        : (lead & 0xf0) === 0xe0 ? 3
          : (lead & 0xf8) === 0xf0 ? 4
            : 1;
  return buffer.length - leadIndex < expectedBytes ? leadIndex : buffer.length;
}

class BoundedCapture {
  private readonly chunks: Buffer[] = [];
  private retainedBytes = 0;
  private totalBytes = 0;

  append(chunk: Buffer | string): void {
    const buffer = typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk;
    this.totalBytes += buffer.length;
    const available = OUTPUT_CAPTURE_LIMIT_BYTES - this.retainedBytes;
    if (available > 0) {
      const retained = buffer.subarray(0, available);
      this.chunks.push(retained);
      this.retainedBytes += retained.length;
    }
  }

  text(): string {
    const captured = Buffer.concat(this.chunks);
    const completeBytes = completeUtf8PrefixLength(captured);
    const retained = captured.subarray(0, completeBytes).toString('utf8');
    const omittedBytes = this.totalBytes - completeBytes;
    return omittedBytes === 0
      ? retained
      : `${retained}\n[runledger: truncated ${omittedBytes} bytes]\n`;
  }
}

export interface RecordRunOptions {
  command: string[];
  cwd: string;
  prevHash: string;
  redact: boolean;
  now?: () => Date;
  id?: string;
}

export async function recordRun(options: RecordRunOptions): Promise<RunRecord> {
  if (options.command.length === 0) throw new Error('missing command after --');
  const started = options.now?.() ?? new Date();
  const startMs = Date.now();
  const child = spawn(options.command[0] as string, options.command.slice(1), {
    cwd: options.cwd,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const stdoutCapture = new BoundedCapture();
  const stderrCapture = new BoundedCapture();
  child.stdout?.on('data', (chunk: Buffer) => {
    const text = chunk.toString('utf8');
    stdoutCapture.append(chunk);
    if (!options.redact) process.stdout.write(text);
  });
  child.stderr?.on('data', (chunk: Buffer) => {
    const text = chunk.toString('utf8');
    stderrCapture.append(chunk);
    if (!options.redact) process.stderr.write(text);
  });
  const { code, signal, launchError } = await new Promise<{
    code: number | null;
    signal: NodeJS.Signals | null;
    launchError?: NodeJS.ErrnoException;
  }>((resolve) => {
    child.on('error', (error: NodeJS.ErrnoException) => resolve({ code: 1, signal: null, launchError: error }));
    child.on('close', (exitCode, exitSignal) => resolve({ code: exitCode, signal: exitSignal }));
  });
  if (launchError) {
    const errorCode = launchError.code ?? 'UNKNOWN';
    stderrCapture.append(`command launch failed (${errorCode}): ${launchError.message}\n`);
  }
  const finished = options.now?.() ?? new Date();
  const stdout = stdoutCapture.text();
  const stderr = stderrCapture.text();
  const cleanStdout = options.redact ? redactSecrets(stdout) : stdout;
  const cleanStderr = options.redact ? redactSecrets(stderr) : stderr;
  if (options.redact) {
    process.stdout.write(cleanStdout);
    process.stderr.write(cleanStderr);
  }
  return withHash({
    schema: 'runledger.v1',
    id: options.id ?? randomUUID(),
    command: options.command,
    cwd: options.cwd,
    startedAt: started.toISOString(),
    finishedAt: finished.toISOString(),
    durationMs: Math.max(0, Date.now() - startMs),
    exitCode: code,
    signal,
    status: code === 0 ? 'passed' : 'failed',
    stdout: cleanStdout,
    stderr: cleanStderr,
    redacted: options.redact,
    prevHash: options.prevHash
  });
}
