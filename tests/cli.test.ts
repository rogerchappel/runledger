import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

test('CLI renders examples', async () => {
  const { stdout } = await execFileAsync(process.execPath, ['dist/src/index.js', 'examples']);
  assert.match(stdout, /runledger record/);
});

test('CLI verify renders JSON for fixture', async () => {
  const { stdout } = await execFileAsync(process.execPath, ['dist/src/index.js', 'verify', 'examples/sample-runs.jsonl', '--format', 'json']);
  const parsed = JSON.parse(stdout) as { ok: boolean; records: unknown[] };
  assert.equal(parsed.ok, true);
  assert.equal(parsed.records.length, 2);
});
