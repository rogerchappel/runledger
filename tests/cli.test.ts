import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

test('CLI renders examples', async () => {
  const { stdout } = await execFileAsync(process.execPath, ['dist/src/index.js', 'examples']);
  assert.match(stdout, /runledger record/);
});

test('documented example commands execute after build', async () => {
  const readme = await readFile('examples/README.md', 'utf8');
  const commands = [...readme.matchAll(/^node (.+)$/gm)].map((match) => match[1]?.split(/\s+/) ?? []);
  assert.equal(commands.length, 2);

  for (const args of commands) {
    const { stdout } = await execFileAsync(process.execPath, args);
    assert.notEqual(stdout.trim(), '');
  }
});

test('CLI verify renders JSON for fixture', async () => {
  const { stdout } = await execFileAsync(process.execPath, ['dist/src/index.js', 'verify', 'examples/sample-runs.jsonl', '--format', 'json']);
  const parsed = JSON.parse(stdout) as { ok: boolean; records: unknown[] };
  assert.equal(parsed.ok, true);
  assert.equal(parsed.records.length, 2);
});

for (const [command, flag, value, allowed] of [
  ['summarize', '--format', 'yaml', 'markdown, json'],
  ['verify', '--format', 'yaml', 'markdown, json'],
  ['verify', '--fail-on', 'typo', 'changed, failed, invalid']
] as const) {
  test(`CLI rejects unsupported ${flag} values for ${command}`, async () => {
    await assert.rejects(
      execFileAsync(process.execPath, [
        'dist/src/index.js',
        command,
        'examples/sample-runs.jsonl',
        flag,
        value
      ]),
      (error: Error & { code?: number; stderr?: string }) => {
        assert.equal(error.code, 1);
        assert.match(error.stderr ?? '', new RegExp(`${flag} must be one of: ${allowed}`));
        return true;
      }
    );
  });
}

test('CLI cannot accept an invalid ledger when --fail-on is misspelled', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'runledger-invalid-'));
  const ledger = path.join(directory, 'runs.jsonl');
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(ledger, '{not json}\n', 'utf8');

  await assert.rejects(
    execFileAsync(process.execPath, ['dist/src/index.js', 'verify', ledger, '--fail-on', 'typo']),
    (error: Error & { code?: number; stderr?: string }) => {
      assert.equal(error.code, 1);
      assert.match(error.stderr ?? '', /--fail-on must be one of: changed, failed, invalid/);
      return true;
    }
  );
});

test('CLI runs examples and functional commands through an aliased project path', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'runledger-alias-'));
  const projectAlias = path.join(directory, 'project');
  t.after(() => rm(directory, { recursive: true, force: true }));
  await symlink(process.cwd(), projectAlias, 'dir');
  const cli = path.join(projectAlias, 'dist/src/index.js');

  const examples = await execFileAsync(process.execPath, [cli, 'examples']);
  assert.match(examples.stdout, /runledger record/);

  const verify = await execFileAsync(process.execPath, [
    cli,
    'verify',
    path.join(projectAlias, 'examples/sample-runs.jsonl'),
    '--format',
    'json'
  ]);
  const parsed = JSON.parse(verify.stdout) as { ok: boolean; records: unknown[] };
  assert.equal(parsed.ok, true);
  assert.equal(parsed.records.length, 2);
});

test('CLI record refuses to run or append when the existing ledger is tampered', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'runledger-tampered-'));
  const ledger = path.join(directory, 'runs.jsonl');
  const marker = path.join(directory, 'command-ran');

  await execFileAsync(process.execPath, [
    'dist/src/index.js',
    'record',
    '--ledger',
    ledger,
    '--',
    process.execPath,
    '-e',
    'console.log("original")'
  ]);
  const tampered = (await readFile(ledger, 'utf8')).replace('original', 'tampered');
  await writeFile(ledger, tampered, 'utf8');
  const before = await readFile(ledger);

  await assert.rejects(
    execFileAsync(process.execPath, [
      'dist/src/index.js',
      'record',
      '--ledger',
      ledger,
      '--',
      process.execPath,
      '-e',
      `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'ran')`
    ]),
    (error: Error & { code?: number; stderr?: string }) => {
      assert.equal(error.code, 1);
      assert.match(error.stderr ?? '', /existing ledger is invalid \(line 1: hash-mismatch\)/);
      return true;
    }
  );

  assert.deepEqual(await readFile(ledger), before);
  await assert.rejects(readFile(marker), { code: 'ENOENT' });
});
