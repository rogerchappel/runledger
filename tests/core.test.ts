import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseLedger, summarize } from '../src/index.js';
import { redactSecrets } from '../src/redact.js';
import { renderSummaryMarkdown } from '../src/render.js';

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

test('redacts common secret shapes', () => {
  const redacted = redactSecrets('token=ghp_abcdefghijklmnopqrstuvwxyz123456 Bearer abc.def.ghi password=hunter2');
  assert.equal(redacted.includes('ghp_'), false);
  assert.equal(redacted.includes('hunter2'), false);
  assert.match(redacted, /\[REDACTED\]/);
});
