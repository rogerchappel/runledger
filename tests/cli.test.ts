import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, symlink, writeFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { OUTPUT_CAPTURE_LIMIT_BYTES } from '../src/record.js';

const execFileAsync = promisify(execFile);

async function waitForFiles(files: string[]): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (true) {
    const ready = await Promise.all(files.map((file) => access(file).then(() => true, () => false)));
    if (ready.every(Boolean)) return;
    if (Date.now() >= deadline) throw new Error(`timed out waiting for ${files.join(', ')}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

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

for (const format of ['markdown', 'json'] as const) {
  test(`CLI summarize renders valid ${format} deterministically`, async () => {
    const args = ['dist/src/index.js', 'summarize', 'examples/sample-runs.jsonl', '--format', format];
    const first = await execFileAsync(process.execPath, args);
    const second = await execFileAsync(process.execPath, args);
    assert.equal(first.stdout, second.stdout);
    assert.equal(first.stderr, '');
    if (format === 'json') {
      const summary = JSON.parse(first.stdout) as { total: number; changed: boolean };
      assert.equal(summary.total, 2);
      assert.equal(summary.changed, false);
    } else {
      assert.match(first.stdout, /# RunLedger Summary/);
      assert.match(first.stdout, /- Changed: no/);
    }
  });
}

test('CLI summarize reports malformed JSON and exits nonzero while retaining the summary', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'runledger-summary-invalid-'));
  const ledger = path.join(directory, 'runs.jsonl');
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(ledger, '{not json}\n', 'utf8');

  await assert.rejects(
    execFileAsync(process.execPath, ['dist/src/index.js', 'summarize', ledger, '--format', 'json']),
    (error: Error & { code?: number; stdout?: string; stderr?: string }) => {
      assert.equal(error.code, 2);
      assert.deepEqual(JSON.parse(error.stdout ?? ''), {
        total: 0, passed: 0, failed: 0, changed: true,
        firstStartedAt: null, lastFinishedAt: null, records: []
      });
      assert.match(error.stderr ?? '', /^line 1: parse-error: /);
      return true;
    }
  );
});

test('CLI summarize reports a hash-chain mismatch and exits nonzero', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'runledger-summary-chain-'));
  const ledger = path.join(directory, 'runs.jsonl');
  t.after(() => rm(directory, { recursive: true, force: true }));
  const lines = (await readFile('examples/sample-runs.jsonl', 'utf8')).trim().split('\n');
  const second = JSON.parse(lines[1] ?? '') as { prevHash: string };
  second.prevHash = '0'.repeat(64);
  await writeFile(ledger, `${lines[0]}\n${JSON.stringify(second)}\n`, 'utf8');

  await assert.rejects(
    execFileAsync(process.execPath, ['dist/src/index.js', 'summarize', ledger]),
    (error: Error & { code?: number; stdout?: string; stderr?: string }) => {
      assert.equal(error.code, 2);
      assert.match(error.stdout ?? '', /- Changed: yes/);
      assert.match(error.stderr ?? '', /line 2: prev-hash-mismatch:/);
      assert.match(error.stderr ?? '', /line 2: hash-mismatch:/);
      return true;
    }
  );
});

for (const [command, args] of [
  ['record', ['--typo', '--', process.execPath, '-e', 'process.exit(0)']],
  ['summarize', ['examples/sample-runs.jsonl', '--typo']],
  ['verify', ['examples/sample-runs.jsonl', '--typo']]
] as const) {
  test(`CLI rejects unknown options for ${command}`, async () => {
    await assert.rejects(
      execFileAsync(process.execPath, ['dist/src/index.js', command, ...args]),
      (error: Error & { code?: number; stderr?: string }) => {
        assert.equal(error.code, 1);
        assert.match(error.stderr ?? '', /unknown option: --typo/);
        return true;
      }
    );
  });
}

for (const [command, option] of [
  ['record', '--ledger'],
  ['summarize', '--out'],
  ['summarize', '--format'],
  ['verify', '--out'],
  ['verify', '--format'],
  ['verify', '--fail-on']
] as const) {
  test(`CLI rejects a missing value for ${option} on ${command}`, async () => {
    const ledger = command === 'record' ? [] : ['examples/sample-runs.jsonl'];
    await assert.rejects(
      execFileAsync(process.execPath, ['dist/src/index.js', command, ...ledger, option]),
      (error: Error & { code?: number; stderr?: string }) => {
        assert.equal(error.code, 1);
        assert.match(error.stderr ?? '', new RegExp(`${option} requires a value`));
        return true;
      }
    );
  });
}

test('malformed record options neither run the command nor write a ledger', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'runledger-options-'));
  const ledger = path.join(directory, 'runs.jsonl');
  const marker = path.join(directory, 'command-ran');
  t.after(() => rm(directory, { recursive: true, force: true }));

  await assert.rejects(
    execFileAsync(process.execPath, [
      'dist/src/index.js',
      'record',
      '--ledger',
      '--',
      process.execPath,
      '-e',
      `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'ran')`
    ]),
    (error: Error & { code?: number; stderr?: string }) => {
      assert.equal(error.code, 1);
      assert.match(error.stderr ?? '', /--ledger requires a value/);
      return true;
    }
  );

  await assert.rejects(readFile(marker), { code: 'ENOENT' });
  await assert.rejects(readFile(ledger), { code: 'ENOENT' });
});

test('CLI rejects options that belong to a different command', async () => {
  await assert.rejects(
    execFileAsync(process.execPath, ['dist/src/index.js', 'verify', 'examples/sample-runs.jsonl', '--ledger', 'other.jsonl']),
    (error: Error & { code?: number; stderr?: string }) => {
      assert.equal(error.code, 1);
      assert.match(error.stderr ?? '', /unknown option for verify: --ledger/);
      return true;
    }
  );
});

for (const [command, flag, value, allowed] of [
  ['summarize', '--format', 'yaml', 'markdown, json'],
  ['verify', '--format', 'yaml', 'markdown, json'],
  ['verify', '--fail-on', 'typo', 'failed, invalid']
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
      assert.match(error.stderr ?? '', /--fail-on must be one of: failed, invalid/);
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

test('overlapping CLI record writers preserve every run in a valid chain', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'runledger-concurrent-'));
  const ledger = path.join(directory, 'runs.jsonl');
  const release = path.join(directory, 'release');
  const ready = [path.join(directory, 'ready-1'), path.join(directory, 'ready-2')];
  t.after(() => rm(directory, { recursive: true, force: true }));

  const writers = ready.map((marker, index) => execFileAsync(process.execPath, [
    'dist/src/index.js',
    'record',
    '--ledger',
    ledger,
    '--',
    process.execPath,
    '-e',
    `const fs=require('node:fs');fs.writeFileSync(${JSON.stringify(marker)},'ready');const timer=setInterval(()=>{if(fs.existsSync(${JSON.stringify(release)})){clearInterval(timer);process.exit(0)}},5);setTimeout(()=>process.exit(9),5000);console.log(${JSON.stringify(`writer-${index + 1}`)})`
  ]));

  await waitForFiles(ready);
  await writeFile(release, 'release', 'utf8');
  const results = await Promise.all(writers);
  assert.deepEqual(results.map(() => 0), [0, 0]);

  const verification = await execFileAsync(process.execPath, [
    'dist/src/index.js', 'verify', ledger, '--format', 'json'
  ]);
  const parsed = JSON.parse(verification.stdout) as { ok: boolean; records: Array<{ stdout: string }> };
  assert.equal(parsed.ok, true);
  assert.equal(parsed.records.length, 2);
  assert.deepEqual(parsed.records.map((record) => record.stdout.trim()).sort(), ['writer-1', 'writer-2']);
});

for (const stream of ['stdout', 'stderr'] as const) {
  test(`CLI record redacts forwarded and stored ${stream} by default`, async (t) => {
    const directory = await mkdtemp(path.join(tmpdir(), 'runledger-redaction-'));
    const ledger = path.join(directory, 'runs.jsonl');
    const secret = 'token=abcdefghijklmnopqrstuvwx';
    t.after(() => rm(directory, { recursive: true, force: true }));

    const result = await execFileAsync(process.execPath, [
      'dist/src/index.js',
      'record',
      '--ledger',
      ledger,
      '--',
      process.execPath,
      '-e',
      `process.${stream}.write(${JSON.stringify(secret)})`
    ]);
    const record = JSON.parse(await readFile(ledger, 'utf8')) as Record<typeof stream, string>;

    assert.equal(result[stream], 'token=[REDACTED]');
    assert.equal(record[stream], 'token=[REDACTED]');
    assert.doesNotMatch(result[stream], /abcdefghijklmnopqrstuvwx/);
  });

  test(`CLI record preserves raw forwarded and stored ${stream} with --no-redact`, async (t) => {
    const directory = await mkdtemp(path.join(tmpdir(), 'runledger-no-redaction-'));
    const ledger = path.join(directory, 'runs.jsonl');
    const secret = 'token=abcdefghijklmnopqrstuvwx';
    t.after(() => rm(directory, { recursive: true, force: true }));

    const result = await execFileAsync(process.execPath, [
      'dist/src/index.js',
      'record',
      '--no-redact',
      '--ledger',
      ledger,
      '--',
      process.execPath,
      '-e',
      `process.${stream}.write(${JSON.stringify(secret)})`
    ]);
    const record = JSON.parse(await readFile(ledger, 'utf8')) as Record<typeof stream, string>;

    assert.equal(result[stream], secret);
    assert.equal(record[stream], secret);
  });
}

test('CLI stores output at the capture boundary without a truncation marker', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'runledger-output-boundary-'));
  const ledger = path.join(directory, 'runs.jsonl');
  t.after(() => rm(directory, { recursive: true, force: true }));

  await execFileAsync(process.execPath, [
    'dist/src/index.js',
    'record',
    '--ledger',
    ledger,
    '--',
    process.execPath,
    '-e',
    `process.stdout.write('x'.repeat(${OUTPUT_CAPTURE_LIMIT_BYTES}))`
  ], { maxBuffer: OUTPUT_CAPTURE_LIMIT_BYTES * 2 });

  const record = JSON.parse(await readFile(ledger, 'utf8')) as { stdout: string };
  assert.equal(Buffer.byteLength(record.stdout), OUTPUT_CAPTURE_LIMIT_BYTES);
  assert.doesNotMatch(record.stdout, /runledger: truncated/);
});

for (const stream of ['stdout', 'stderr'] as const) {
  test(`CLI preserves UTF-8 when the ${stream} capture boundary splits a character`, async (t) => {
    const directory = await mkdtemp(path.join(tmpdir(), `runledger-utf8-${stream}-`));
    const ledger = path.join(directory, 'runs.jsonl');
    t.after(() => rm(directory, { recursive: true, force: true }));

    const result = await execFileAsync(process.execPath, [
      'dist/src/index.js', 'record', '--ledger', ledger, '--', process.execPath, '-e',
      `process.${stream}.write('a'.repeat(${OUTPUT_CAPTURE_LIMIT_BYTES - 1}) + '😀')`
    ], { maxBuffer: OUTPUT_CAPTURE_LIMIT_BYTES * 2 });
    const record = JSON.parse(await readFile(ledger, 'utf8')) as Record<typeof stream, string>;

    assert.equal(result[stream], record[stream]);
    assert.equal(record[stream].slice(0, OUTPUT_CAPTURE_LIMIT_BYTES - 1), 'a'.repeat(OUTPUT_CAPTURE_LIMIT_BYTES - 1));
    assert.match(record[stream], /\[runledger: truncated 4 bytes\]\n$/);
    assert.doesNotMatch(record[stream], /\uFFFD/);

    const verify = await execFileAsync(
      process.execPath,
      ['dist/src/index.js', 'verify', ledger, '--format', 'json'],
      { maxBuffer: OUTPUT_CAPTURE_LIMIT_BYTES * 2 }
    );
    assert.equal((JSON.parse(verify.stdout) as { ok: boolean }).ok, true);
  });
}

for (const stream of ['stdout', 'stderr'] as const) {
  test(`CLI bounds large ${stream}, redacts retained text, and keeps the ledger appendable`, async (t) => {
    const directory = await mkdtemp(path.join(tmpdir(), `runledger-large-${stream}-`));
    const ledger = path.join(directory, 'runs.jsonl');
    const secret = 'token=abcdefghijklmnopqrstuvwx';
    const extraBytes = 17;
    t.after(() => rm(directory, { recursive: true, force: true }));

    const result = await execFileAsync(process.execPath, [
      'dist/src/index.js',
      'record',
      '--ledger',
      ledger,
      '--',
      process.execPath,
      '-e',
      `process.${stream}.write(${JSON.stringify(secret)} + 'x'.repeat(${OUTPUT_CAPTURE_LIMIT_BYTES + extraBytes} - ${secret.length}))`
    ], { maxBuffer: OUTPUT_CAPTURE_LIMIT_BYTES * 2 });
    const record = JSON.parse(await readFile(ledger, 'utf8')) as Record<typeof stream, string>;

    assert.match(record[stream], /^token=\[REDACTED\]/);
    assert.match(record[stream], new RegExp(`\\[runledger: truncated ${extraBytes} bytes\\]\\n$`));
    assert.equal(result[stream], record[stream]);
    assert.doesNotMatch(record[stream], /abcdefghijklmnopqrstuvwx/);

    const verify = await execFileAsync(process.execPath, ['dist/src/index.js', 'verify', ledger, '--format', 'json']);
    assert.equal((JSON.parse(verify.stdout) as { ok: boolean }).ok, true);
    await execFileAsync(process.execPath, [
      'dist/src/index.js', 'record', '--ledger', ledger, '--', process.execPath, '-e', 'process.exit(0)'
    ]);
    const afterAppend = await execFileAsync(process.execPath, ['dist/src/index.js', 'verify', ledger, '--format', 'json']);
    assert.equal((JSON.parse(afterAppend.stdout) as { ok: boolean; records: unknown[] }).records.length, 2);
  });

  test(`CLI forwards all large ${stream} while storing a bounded copy with --no-redact`, async (t) => {
    const directory = await mkdtemp(path.join(tmpdir(), `runledger-forward-large-${stream}-`));
    const ledger = path.join(directory, 'runs.jsonl');
    const outputBytes = OUTPUT_CAPTURE_LIMIT_BYTES + 23;
    t.after(() => rm(directory, { recursive: true, force: true }));

    const result = await execFileAsync(process.execPath, [
      'dist/src/index.js', 'record', '--no-redact', '--ledger', ledger, '--', process.execPath, '-e',
      `process.${stream}.write('z'.repeat(${outputBytes}))`
    ], { maxBuffer: OUTPUT_CAPTURE_LIMIT_BYTES * 2 });
    const record = JSON.parse(await readFile(ledger, 'utf8')) as Record<typeof stream, string>;

    assert.equal(Buffer.byteLength(result[stream]), outputBytes);
    assert.equal(record[stream].slice(0, OUTPUT_CAPTURE_LIMIT_BYTES), 'z'.repeat(OUTPUT_CAPTURE_LIMIT_BYTES));
    assert.match(record[stream], /\[runledger: truncated 23 bytes\]\n$/);
  });
}

test('CLI record preserves command failure after redacting forwarded output', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'runledger-redacted-failure-'));
  const ledger = path.join(directory, 'runs.jsonl');
  t.after(() => rm(directory, { recursive: true, force: true }));

  await assert.rejects(
    execFileAsync(process.execPath, [
      'dist/src/index.js',
      'record',
      '--ledger',
      ledger,
      '--',
      process.execPath,
      '-e',
      'console.error("password=hunter2"); process.exit(23)'
    ]),
    (error: Error & { code?: number; stderr?: string }) => {
      assert.equal(error.code, 23);
      assert.equal(error.stderr, 'password=[REDACTED]\n');
      return true;
    }
  );
  const record = JSON.parse(await readFile(ledger, 'utf8')) as { exitCode: number; status: string };
  assert.equal(record.exitCode, 23);
  assert.equal(record.status, 'failed');
});

for (const existingRecords of [0, 1]) {
  test(`CLI records a command launch failure after ${existingRecords === 0 ? 'creating' : 'reading'} a ledger`, async (t) => {
    const directory = await mkdtemp(path.join(tmpdir(), 'runledger-launch-failure-'));
    const ledger = path.join(directory, 'runs.jsonl');
    const missingCommand = 'runledger-command-that-does-not-exist-token=abcdefghijklmnopqrstuvwx';
    t.after(() => rm(directory, { recursive: true, force: true }));

    if (existingRecords === 1) {
      await execFileAsync(process.execPath, [
        'dist/src/index.js',
        'record',
        '--ledger',
        ledger,
        '--',
        process.execPath,
        '-e',
        'process.exit(0)'
      ]);
    }

    await assert.rejects(
      execFileAsync(process.execPath, ['dist/src/index.js', 'record', '--ledger', ledger, '--', missingCommand, '--flag']),
      (error: Error & { code?: number; stderr?: string }) => {
        assert.equal(error.code, 1);
        assert.match(error.stderr ?? '', /command launch failed \(ENOENT\)/);
        assert.doesNotMatch(error.stderr ?? '', /abcdefghijklmnopqrstuvwx/);
        return true;
      }
    );

    const lines = (await readFile(ledger, 'utf8')).trim().split('\n');
    assert.equal(lines.length, existingRecords + 1);
    const failed = JSON.parse(lines.at(-1) ?? '') as {
      command: string[];
      cwd: string;
      startedAt: string;
      finishedAt: string;
      durationMs: number;
      exitCode: number;
      signal: string | null;
      status: string;
      stdout: string;
      stderr: string;
      redacted: boolean;
    };
    assert.deepEqual(failed.command, [missingCommand, '--flag']);
    assert.equal(failed.cwd, process.cwd());
    assert.equal(Number.isNaN(Date.parse(failed.startedAt)), false);
    assert.equal(Number.isNaN(Date.parse(failed.finishedAt)), false);
    assert.ok(failed.durationMs >= 0);
    assert.equal(failed.exitCode, 1);
    assert.equal(failed.signal, null);
    assert.equal(failed.status, 'failed');
    assert.equal(failed.stdout, '');
    assert.match(failed.stderr, /command launch failed \(ENOENT\)/);
    assert.doesNotMatch(failed.stderr, /abcdefghijklmnopqrstuvwx/);
    assert.equal(failed.redacted, true);

    const verify = await execFileAsync(process.execPath, ['dist/src/index.js', 'verify', ledger, '--format', 'json']);
    assert.equal((JSON.parse(verify.stdout) as { ok: boolean }).ok, true);

    await execFileAsync(process.execPath, [
      'dist/src/index.js',
      'record',
      '--ledger',
      ledger,
      '--',
      process.execPath,
      '-e',
      'process.exit(0)'
    ]);
    const verifyAfterAppend = await execFileAsync(process.execPath, ['dist/src/index.js', 'verify', ledger, '--format', 'json']);
    const verified = JSON.parse(verifyAfterAppend.stdout) as { ok: boolean; records: unknown[] };
    assert.equal(verified.ok, true);
    assert.equal(verified.records.length, existingRecords + 2);
  });
}

test('record with -- separator appends one record with the full command', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'runledger-record-ok-'));
  const ledger = path.join(directory, 'runs.jsonl');
  t.after(() => rm(directory, { recursive: true, force: true }));

  await execFileAsync(process.execPath, [
    'dist/src/index.js', 'record', '--ledger', ledger, '--', process.execPath, '-e', 'console.log(1)'
  ]);
  const record = JSON.parse(await readFile(ledger, 'utf8')) as { command: string[]; status: string };
  assert.deepEqual(record.command, [process.execPath, '-e', 'console.log(1)']);
  assert.equal(record.status, 'passed');
});

test('record with positional args before -- errors without running or writing', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'runledger-separator-'));
  const ledger = path.join(directory, 'runs.jsonl');
  const marker = path.join(directory, 'command-ran');
  t.after(() => rm(directory, { recursive: true, force: true }));

  await assert.rejects(
    execFileAsync(process.execPath, [
      'dist/src/index.js',
      'record',
      '--ledger',
      ledger,
      'node',
      '-e',
      'console.log(1)',
      '--',
      process.execPath,
      '-e',
      `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'ran')`
    ]),
    (error: Error & { code?: number; stderr?: string }) => {
      assert.equal(error.code, 1);
      assert.match(error.stderr ?? '', /before the '--' separator/);
      return true;
    }
  );

  await assert.rejects(readFile(marker), { code: 'ENOENT' });
  await assert.rejects(readFile(ledger), { code: 'ENOENT' });
});

test('verify rejects the behaviorless changed threshold', async () => {
  await assert.rejects(
    execFileAsync(process.execPath, ['dist/src/index.js', 'verify', 'examples/sample-runs.jsonl', '--fail-on', 'changed']),
    (error: Error & { code?: number; stderr?: string }) => {
      assert.equal(error.code, 1);
      assert.match(error.stderr ?? '', /--fail-on must be one of: failed, invalid/);
      return true;
    }
  );
});

test('verify exits 2 on an invalid ledger regardless of supported --fail-on mode', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'runledger-verify-invalid-'));
  const ledger = path.join(directory, 'tampered.jsonl');
  t.after(() => rm(directory, { recursive: true, force: true }));
  const lines = (await readFile('examples/sample-runs.jsonl', 'utf8')).trim().split('\n');
  await writeFile(ledger, `${(lines[0] ?? '').replace('fixture ok', 'fixture changed')}\n`, 'utf8');

  for (const mode of ['invalid', 'failed'] as const) {
    await assert.rejects(
      execFileAsync(process.execPath, ['dist/src/index.js', 'verify', ledger, '--fail-on', mode]),
      (error: Error & { code?: number; stderr?: string }) => {
        assert.equal(error.code, 2, `--fail-on ${mode} should exit 2 on an invalid ledger`);
        return true;
      }
    );
  }
});

test('verify --fail-on failed exits 3 when a valid ledger has failed commands', async () => {
  await assert.rejects(
    execFileAsync(process.execPath, ['dist/src/index.js', 'verify', 'examples/sample-runs.jsonl', '--fail-on', 'failed']),
    (error: Error & { code?: number; stderr?: string }) => {
      assert.equal(error.code, 3);
      return true;
    }
  );
});

test('verify exits 0 on a valid ledger without failed commands', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'runledger-verify-ok-'));
  const ledger = path.join(directory, 'runs.jsonl');
  t.after(() => rm(directory, { recursive: true, force: true }));
  await execFileAsync(process.execPath, [
    'dist/src/index.js', 'record', '--ledger', ledger, '--', process.execPath, '-e', 'console.log(1)'
  ]);
  const { stdout } = await execFileAsync(process.execPath, ['dist/src/index.js', 'verify', ledger, '--fail-on', 'failed']);
  assert.match(stdout, /RunLedger Verification/);
});
