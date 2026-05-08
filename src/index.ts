#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { appendRecord, lastHash, parseLedger, summarize, writeOutput } from './ledger.js';
import { recordRun } from './record.js';
import { renderJson, renderSummaryMarkdown, renderVerifyMarkdown } from './render.js';

interface Parsed {
  flags: Map<string, string | boolean>;
  positional: string[];
  command: string[];
}

function usage(): string {
  return `RunLedger — local-first command evidence\n\nUsage:\n  runledger record [--ledger .runledger/runs.jsonl] [--no-redact] -- <command> [args...]\n  runledger summarize <ledger> [--format markdown|json] [--out file]\n  runledger verify <ledger> [--format markdown|json] [--fail-on changed|failed|invalid]\n\nExamples:\n  runledger record -- npm test\n  runledger summarize .runledger/runs.jsonl --out REPORT.md\n  runledger verify .runledger/runs.jsonl --fail-on changed\n`;
}

function parse(argv: string[]): Parsed {
  const dash = argv.indexOf('--');
  const before = dash >= 0 ? argv.slice(0, dash) : argv;
  const command = dash >= 0 ? argv.slice(dash + 1) : [];
  const flags = new Map<string, string | boolean>();
  const positional: string[] = [];
  for (let i = 0; i < before.length; i += 1) {
    const arg = before[i] as string;
    if (arg.startsWith('--')) {
      const [rawKey, inline] = arg.slice(2).split('=', 2);
      const key = rawKey ?? '';
      if (key.startsWith('no-')) flags.set(key.slice(3), false);
      else if (inline !== undefined) flags.set(key, inline);
      else if (before[i + 1] && !before[i + 1]!.startsWith('--')) flags.set(key, before[++i] as string);
      else flags.set(key, true);
    } else positional.push(arg);
  }
  return { flags, positional, command };
}

function flag(parsed: Parsed, name: string, fallback: string): string {
  const value = parsed.flags.get(name);
  return typeof value === 'string' ? value : fallback;
}

async function main(argv: string[]): Promise<number> {
  const parsed = parse(argv);
  const [cmd, ledgerArg] = parsed.positional;
  if (!cmd || cmd === 'help' || cmd === 'examples' || parsed.flags.has('help') || parsed.flags.has('examples')) {
    process.stdout.write(usage());
    return 0;
  }
  if (cmd === 'record') {
    const ledger = flag(parsed, 'ledger', '.runledger/runs.jsonl');
    const prevHash = await lastHash(ledger);
    const record = await recordRun({ command: parsed.command, cwd: process.cwd(), prevHash, redact: parsed.flags.get('redact') !== false });
    await appendRecord(ledger, record);
    return record.exitCode ?? 1;
  }
  if (cmd === 'summarize') {
    if (!ledgerArg) throw new Error('summarize requires a ledger path');
    const result = parseLedger(await readFile(ledgerArg, 'utf8'));
    const summary = summarize(result.records, !result.ok);
    const format = flag(parsed, 'format', 'markdown');
    const content = format === 'json' ? renderJson(summary) : renderSummaryMarkdown(summary);
    await writeOutput(typeof parsed.flags.get('out') === 'string' ? parsed.flags.get('out') as string : undefined, content);
    return 0;
  }
  if (cmd === 'verify') {
    if (!ledgerArg) throw new Error('verify requires a ledger path');
    const result = parseLedger(await readFile(ledgerArg, 'utf8'));
    const format = flag(parsed, 'format', 'markdown');
    const content = format === 'json' ? renderJson(result) : renderVerifyMarkdown(result);
    await writeOutput(typeof parsed.flags.get('out') === 'string' ? parsed.flags.get('out') as string : undefined, content);
    const failOn = flag(parsed, 'fail-on', 'invalid');
    if (failOn === 'changed' && !result.ok) return 2;
    if (failOn === 'invalid' && !result.ok) return 2;
    if (failOn === 'failed' && result.records.some((record) => record.status === 'failed')) return 3;
    return 0;
  }
  throw new Error(`unknown command: ${cmd}`);
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) {
  main(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  }).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

export { parseLedger, summarize };
