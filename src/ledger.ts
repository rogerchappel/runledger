import { mkdir, readFile, appendFile, writeFile, rmdir } from 'node:fs/promises';
import path from 'node:path';
import { GENESIS_HASH, hashRecord, stableStringify, withHash } from './hash.js';
import type { RunRecord, Summary, VerifyIssue, VerifyResult } from './types.js';

const HASH_PATTERN = /^[0-9a-f]{64}$/;
const SIGNALS = new Set([
  'SIGABRT', 'SIGALRM', 'SIGBUS', 'SIGCHLD', 'SIGCONT', 'SIGFPE', 'SIGHUP',
  'SIGILL', 'SIGINT', 'SIGIO', 'SIGIOT', 'SIGKILL', 'SIGPIPE', 'SIGPOLL',
  'SIGPROF', 'SIGPWR', 'SIGQUIT', 'SIGSEGV', 'SIGSTKFLT', 'SIGSTOP', 'SIGSYS',
  'SIGTERM', 'SIGTRAP', 'SIGTSTP', 'SIGTTIN', 'SIGTTOU', 'SIGURG', 'SIGUSR1',
  'SIGUSR2', 'SIGVTALRM', 'SIGWINCH', 'SIGXCPU', 'SIGXFSZ'
]);

function recordSchemaErrors(value: unknown): string[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return ['record must be a JSON object'];
  }
  const record = value as Record<string, unknown>;
  const errors: string[] = [];
  if (record.schema !== 'runledger.v1') errors.push('schema must be "runledger.v1"');
  if (typeof record.id !== 'string' || record.id.length === 0) errors.push('id must be a non-empty string');
  if (!Array.isArray(record.command) || record.command.length === 0 || record.command.some((part) => typeof part !== 'string' || part.length === 0)) {
    errors.push('command must be a non-empty array of non-empty strings');
  }
  if (typeof record.cwd !== 'string' || record.cwd.length === 0) errors.push('cwd must be a non-empty string');

  const started = typeof record.startedAt === 'string' ? Date.parse(record.startedAt) : Number.NaN;
  const finished = typeof record.finishedAt === 'string' ? Date.parse(record.finishedAt) : Number.NaN;
  if (!Number.isFinite(started)) errors.push('startedAt must be a valid timestamp string');
  if (!Number.isFinite(finished)) errors.push('finishedAt must be a valid timestamp string');
  if (Number.isFinite(started) && Number.isFinite(finished) && finished < started) errors.push('finishedAt must not precede startedAt');
  if (typeof record.durationMs !== 'number' || !Number.isFinite(record.durationMs) || record.durationMs < 0) {
    errors.push('durationMs must be a finite non-negative number');
  }

  const validExitCode = record.exitCode === null
    || (typeof record.exitCode === 'number' && Number.isInteger(record.exitCode) && record.exitCode >= 0);
  if (!validExitCode) errors.push('exitCode must be null or a non-negative integer');
  if (record.signal !== null && (typeof record.signal !== 'string' || !SIGNALS.has(record.signal))) {
    errors.push('signal must be null or a recognized signal name');
  }
  if (validExitCode && (record.signal === null || (typeof record.signal === 'string' && SIGNALS.has(record.signal)))) {
    if ((record.exitCode === null) === (record.signal === null)) {
      errors.push('exactly one of exitCode and signal must be non-null');
    }
  }
  if (record.status !== 'passed' && record.status !== 'failed') errors.push('status must be "passed" or "failed"');
  if (record.status === 'passed' && (record.exitCode !== 0 || record.signal !== null)) {
    errors.push('status "passed" requires exitCode 0 and signal null');
  }
  if (record.status === 'failed' && record.exitCode === 0 && record.signal === null) {
    errors.push('status "failed" requires a non-zero/null exitCode or signal');
  }
  if (typeof record.stdout !== 'string') errors.push('stdout must be a string');
  if (typeof record.stderr !== 'string') errors.push('stderr must be a string');
  if (typeof record.redacted !== 'boolean') errors.push('redacted must be a boolean');
  if (typeof record.prevHash !== 'string' || !HASH_PATTERN.test(record.prevHash)) errors.push('prevHash must be a 64-character lowercase hexadecimal string');
  if (typeof record.hash !== 'string' || !HASH_PATTERN.test(record.hash)) errors.push('hash must be a 64-character lowercase hexadecimal string');
  return errors;
}

export async function readLedger(file: string): Promise<RunRecord[]> {
  const text = await readFile(file, 'utf8');
  return parseLedger(text).records;
}

export function parseLedger(text: string): VerifyResult {
  const records: RunRecord[] = [];
  const issues: VerifyIssue[] = [];
  let expectedPrev = GENESIS_HASH;
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    const lineNo = index + 1;
    if (line.trim().length === 0) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line) as unknown;
    } catch (error) {
      issues.push({ line: lineNo, kind: 'parse-error', message: String(error) });
      return;
    }
    const schemaErrors = recordSchemaErrors(parsed);
    const candidate = typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : undefined;
    if (schemaErrors.length > 0) {
      issues.push({ line: lineNo, kind: 'schema-error', message: schemaErrors.join('; ') });
    }
    if (!candidate || typeof candidate.hash !== 'string' || typeof candidate.prevHash !== 'string') {
      return;
    }
    const record = candidate as unknown as RunRecord;
    if (record.prevHash !== expectedPrev) {
      issues.push({ line: lineNo, kind: 'prev-hash-mismatch', message: `expected ${expectedPrev}, got ${record.prevHash}` });
    }
    const actual = hashRecord(record);
    if (record.hash !== actual) {
      issues.push({ line: lineNo, kind: 'hash-mismatch', message: `expected ${actual}, got ${record.hash}` });
    }
    expectedPrev = record.hash;
    if (schemaErrors.length === 0) records.push(record);
  });
  return { ok: issues.length === 0, records, issues };
}

export async function appendRecord(file: string, record: RunRecord): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await appendFile(file, `${stableStringify(record)}\n`, 'utf8');
}

const LOCK_RETRY_MS = 25;
const LOCK_TIMEOUT_MS = 10_000;

async function acquireLedgerLock(file: string): Promise<() => Promise<void>> {
  const lock = `${file}.lock`;
  await mkdir(path.dirname(file), { recursive: true });
  const deadline = Date.now() + LOCK_TIMEOUT_MS;
  while (true) {
    try {
      await mkdir(lock);
      return async () => rmdir(lock);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      if (Date.now() >= deadline) {
        throw new Error(`could not obtain ledger lock ${lock} within ${LOCK_TIMEOUT_MS}ms; verify no record process is active before removing it`);
      }
      await new Promise((resolve) => setTimeout(resolve, LOCK_RETRY_MS));
    }
  }
}

export async function commitRecord(file: string, record: RunRecord): Promise<RunRecord> {
  const release = await acquireLedgerLock(file);
  try {
    const prevHash = await lastHash(file);
    const { hash: _staleHash, ...fields } = record;
    const committed = withHash({ ...fields, prevHash });
    await appendRecord(file, committed);
    return committed;
  } finally {
    await release();
  }
}

export async function lastHash(file: string): Promise<string> {
  try {
    const verify = parseLedger(await readFile(file, 'utf8'));
    if (!verify.ok) {
      const details = verify.issues.map((issue) => `line ${issue.line}: ${issue.kind}`).join(', ');
      throw new Error(`existing ledger is invalid (${details})`);
    }
    return verify.records.at(-1)?.hash ?? GENESIS_HASH;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return GENESIS_HASH;
    throw error;
  }
}

export function summarize(records: RunRecord[], changed = false): Summary {
  return {
    total: records.length,
    passed: records.filter((record) => record.status === 'passed').length,
    failed: records.filter((record) => record.status === 'failed').length,
    changed,
    firstStartedAt: records[0]?.startedAt ?? null,
    lastFinishedAt: records.at(-1)?.finishedAt ?? null,
    records
  };
}

export async function writeOutput(file: string | undefined, content: string): Promise<void> {
  if (!file || file === '-') {
    process.stdout.write(content);
    return;
  }
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content, 'utf8');
}
