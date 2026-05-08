import { createHash } from 'node:crypto';
import type { RunRecord } from './types.js';

export const GENESIS_HASH = '0'.repeat(64);

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(',')}}`;
}

export function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

export function recordPayload(record: RunRecord): Omit<RunRecord, 'hash'> {
  const { hash: _hash, ...payload } = record;
  return payload;
}

export function hashRecord(record: RunRecord): string {
  return sha256(stableStringify(recordPayload(record)));
}

export function withHash(record: Omit<RunRecord, 'hash'>): RunRecord {
  const pending = { ...record, hash: '' } satisfies RunRecord;
  return { ...record, hash: hashRecord(pending) };
}
