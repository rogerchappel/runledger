import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseLedger, summarize } from '../src/index.js';
import { redactSecrets } from '../src/redact.js';
import { renderSummaryMarkdown } from '../src/render.js';
import { withHash } from '../src/hash.js';

const genesis = '0'.repeat(64);

function validRecord(overrides: Record<string, unknown> = {}) {
  return withHash({
    schema: 'runledger.v1',
    id: 'test-record',
    command: ['node', '--version'],
    cwd: '/tmp',
    startedAt: '2026-01-01T00:00:00.000Z',
    finishedAt: '2026-01-01T00:00:00.010Z',
    durationMs: 10,
    exitCode: 0,
    signal: null,
    status: 'passed',
    stdout: 'v22\n',
    stderr: '',
    redacted: true,
    prevHash: genesis,
    ...overrides
  } as Parameters<typeof withHash>[0]);
}

test('fixture ledger verifies and summarizes deterministically', async () => {
  const text = await readFile('examples/sample-runs.jsonl', 'utf8');
  const result = parseLedger(text);
  assert.equal(result.ok, true);
  const summary = summarize(result.records, !result.ok);
  assert.equal(summary.total, 2);
  assert.equal(summary.passed, 1);
  assert.equal(summary.failed, 1);
  assert.match(renderSummaryMarkdown(summary), /RunLedger Summary/);
});

test('Markdown summary safely delimits backticks in commands and captured streams', async () => {
  const text = await readFile('examples/sample-runs.jsonl', 'utf8');
  const result = parseLedger(text);
  const record = {
    ...result.records[0]!,
    command: ['printf', '`argument`', '```'],
    stdout: 'ordinary\n```text\ninside ``` output',
    stderr: 'failure with ```` embedded'
  };
  const markdown = renderSummaryMarkdown(summarize([record], false));

  assert.match(markdown, /- Command: ```` printf `argument` ``` ````/);
  assert.match(markdown, /````text\nordinary\n```text\ninside ``` output\n````/);
  assert.match(markdown, /`````text\nfailure with ```` embedded\n`````/);
  assert.equal((markdown.match(/^````text$/gm) ?? []).length, 1);
  assert.equal((markdown.match(/^````$/gm) ?? []).length, 1);
  assert.equal((markdown.match(/^`````text$/gm) ?? []).length, 1);
  assert.equal((markdown.match(/^`````$/gm) ?? []).length, 1);
});

test('tampering is detected', async () => {
  const text = await readFile('examples/sample-runs.jsonl', 'utf8');
  const tampered = text.replace('fixture ok', 'fixture changed');
  const result = parseLedger(tampered);
  assert.equal(result.ok, false);
  assert.equal(result.issues.some((issue) => issue.kind === 'hash-mismatch'), true);
});

test('verification issues retain physical line numbers across blank lines', () => {
  const result = parseLedger('\n{not json}\n');
  assert.equal(result.ok, false);
  assert.equal(result.issues[0]?.line, 2);
  assert.equal(result.issues[0]?.kind, 'parse-error');
});

test('verification rejects a correctly hashed record containing only chain fields', () => {
  const record = withHash({ schema: 'runledger.v1', prevHash: genesis } as Parameters<typeof withHash>[0]);
  const result = parseLedger(`\n${JSON.stringify(record)}\n`);

  assert.equal(result.ok, false);
  assert.equal(result.records.length, 0);
  assert.deepEqual(result.issues.map(({ line, kind }) => ({ line, kind })), [
    { line: 2, kind: 'schema-error' }
  ]);
  assert.match(result.issues[0]?.message ?? '', /id/);
});

test('verification enforces record field types and domain consistency', () => {
  const cases: Array<[string, Record<string, unknown>, RegExp]> = [
    ['command shape', { command: [] }, /command/],
    ['duration domain', { durationMs: Number.NaN }, /durationMs/],
    ['timestamp ordering', { finishedAt: '2025-12-31T23:59:59.000Z' }, /finishedAt/],
    ['passed exit consistency', { exitCode: 1, status: 'passed' }, /status/],
    ['failed exit consistency', { exitCode: 0, status: 'failed' }, /status/],
    ['missing termination result', { exitCode: null, signal: null, status: 'failed' }, /exitCode and signal/],
    ['ambiguous termination result', { exitCode: 1, signal: 'SIGTERM', status: 'failed' }, /exitCode and signal/],
    ['boolean type', { redacted: 'yes' }, /redacted/],
    ['captured stream type', { stdout: null }, /stdout/]
  ];

  for (const [label, overrides, expected] of cases) {
    const result = parseLedger(JSON.stringify(validRecord(overrides)));
    assert.equal(result.ok, false, label);
    assert.equal(result.records.length, 0, label);
    assert.equal(result.issues[0]?.kind, 'schema-error', label);
    assert.match(result.issues[0]?.message ?? '', expected, label);
  }
});

test('schema validation retains hash-chain diagnostics and accepts complete records', () => {
  const first = validRecord();
  const second = validRecord({ id: 'second-record', prevHash: first.hash, stdout: 'changed' });
  const valid = parseLedger(`${JSON.stringify(first)}\n${JSON.stringify(second)}\n`);
  assert.equal(valid.ok, true);
  assert.equal(valid.records.length, 2);

  const tampered = { ...second, stdout: 'tampered', prevHash: genesis };
  const invalid = parseLedger(`${JSON.stringify(first)}\n${JSON.stringify(tampered)}\n`);
  assert.equal(invalid.issues.some((issue) => issue.kind === 'prev-hash-mismatch'), true);
  assert.equal(invalid.issues.some((issue) => issue.kind === 'hash-mismatch'), true);
});

test('redacts common secret shapes', () => {
  const redacted = redactSecrets('token=ghp_abcdefghijklmnopqrstuvwxyz123456 Bearer abc.def.ghi password=hunter2');
  assert.equal(redacted.includes('ghp_'), false);
  assert.equal(redacted.includes('hunter2'), false);
  assert.match(redacted, /\[REDACTED\]/);
});
