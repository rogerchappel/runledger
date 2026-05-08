import { mkdir, readFile, appendFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { GENESIS_HASH, hashRecord, stableStringify } from './hash.js';
import type { RunRecord, Summary, VerifyIssue, VerifyResult } from './types.js';

export async function readLedger(file: string): Promise<RunRecord[]> {
  const text = await readFile(file, 'utf8');
  return parseLedger(text).records;
}

export function parseLedger(text: string): VerifyResult {
  const records: RunRecord[] = [];
  const issues: VerifyIssue[] = [];
  let expectedPrev = GENESIS_HASH;
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  lines.forEach((line, index) => {
    const lineNo = index + 1;
    let record: RunRecord;
    try {
      record = JSON.parse(line) as RunRecord;
    } catch (error) {
      issues.push({ line: lineNo, kind: 'parse-error', message: String(error) });
      return;
    }
    if (record.schema !== 'runledger.v1' || typeof record.hash !== 'string' || typeof record.prevHash !== 'string') {
      issues.push({ line: lineNo, kind: 'schema-error', message: 'record is not a runledger.v1 record' });
      return;
    }
    if (record.prevHash !== expectedPrev) {
      issues.push({ line: lineNo, kind: 'prev-hash-mismatch', message: `expected ${expectedPrev}, got ${record.prevHash}` });
    }
    const actual = hashRecord(record);
    if (record.hash !== actual) {
      issues.push({ line: lineNo, kind: 'hash-mismatch', message: `expected ${actual}, got ${record.hash}` });
    }
    expectedPrev = record.hash;
    records.push(record);
  });
  return { ok: issues.length === 0, records, issues };
}

export async function appendRecord(file: string, record: RunRecord): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await appendFile(file, `${stableStringify(record)}\n`, 'utf8');
}

export async function lastHash(file: string): Promise<string> {
  try {
    const verify = parseLedger(await readFile(file, 'utf8'));
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
