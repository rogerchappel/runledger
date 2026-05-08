import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { redactSecrets } from './redact.js';
import { withHash } from './hash.js';
import type { RunRecord } from './types.js';

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
  let stdout = '';
  let stderr = '';
  child.stdout?.on('data', (chunk: Buffer) => {
    const text = chunk.toString('utf8');
    stdout += text;
    process.stdout.write(text);
  });
  child.stderr?.on('data', (chunk: Buffer) => {
    const text = chunk.toString('utf8');
    stderr += text;
    process.stderr.write(text);
  });
  const { code, signal } = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (exitCode, exitSignal) => resolve({ code: exitCode, signal: exitSignal }));
  });
  const finished = options.now?.() ?? new Date();
  const cleanStdout = options.redact ? redactSecrets(stdout) : stdout;
  const cleanStderr = options.redact ? redactSecrets(stderr) : stderr;
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
