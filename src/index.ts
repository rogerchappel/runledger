#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { commitRecord, lastHash, parseLedger, summarize, writeOutput } from './ledger.js';
import { recordRun } from './record.js';
import { renderJson, renderSummaryMarkdown, renderVerifyMarkdown } from './render.js';

interface Parsed {
  flags: Map<string, string | boolean>;
  positional: string[];
  command: string[];
}

const valueOptions = new Set(['ledger', 'out', 'format', 'fail-on']);
const booleanOptions = new Set(['redact', 'help', 'examples']);

function usage(): string {
  return `RunLedger — local-first command evidence\n\nUsage:\n  runledger record [--ledger .runledger/runs.jsonl] [--no-redact] -- <command> [args...]\n  runledger summarize <ledger> [--format markdown|json] [--out file]\n  runledger verify <ledger> [--format markdown|json] [--fail-on failed|invalid]\n\nrecord requires a literal '--' before the command; other arguments before it are\nrejected without running or writing. verify exits 2 on any invalid ledger and,\nunder --fail-on failed, exits 3 when a recorded command failed.\n\nExamples:\n  runledger record -- npm test\n  runledger summarize .runledger/runs.jsonl --out REPORT.md\n  runledger verify .runledger/runs.jsonl --fail-on invalid\n`;
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
      if (key === 'no-redact' && inline === undefined) {
        flags.set('redact', false);
      } else if (booleanOptions.has(key) && inline === undefined) {
        flags.set(key, true);
      } else if (valueOptions.has(key)) {
        if (inline !== undefined && inline !== '') flags.set(key, inline);
        else if (inline === undefined && before[i + 1] && !before[i + 1]!.startsWith('--')) flags.set(key, before[++i] as string);
        else throw new Error(`--${key} requires a value`);
      } else {
        throw new Error(`unknown option: --${key}`);
      }
    } else positional.push(arg);
  }
  return { flags, positional, command };
}

function validateOptions(parsed: Parsed, command: string): void {
  const common = new Set(['help', 'examples']);
  const commandOptions: Record<string, Set<string>> = {
    record: new Set(['ledger', 'redact']),
    summarize: new Set(['format', 'out']),
    verify: new Set(['format', 'out', 'fail-on'])
  };
  const allowed = commandOptions[command];
  for (const option of parsed.flags.keys()) {
    if (!common.has(option) && !allowed?.has(option)) {
      throw new Error(`unknown option for ${command}: --${option}`);
    }
  }
}

function flag(parsed: Parsed, name: string, fallback: string): string {
  const value = parsed.flags.get(name);
  return typeof value === 'string' ? value : fallback;
}

function enumFlag<const T extends readonly string[]>(
  parsed: Parsed,
  name: string,
  allowed: T,
  fallback: T[number]
): T[number] {
  const value = flag(parsed, name, fallback);
  if (!allowed.includes(value)) {
    throw new Error(`--${name} must be one of: ${allowed.join(', ')}`);
  }
  return value as T[number];
}

async function main(argv: string[]): Promise<number> {
  const parsed = parse(argv);
  const [cmd, ledgerArg] = parsed.positional;
  if (!cmd || cmd === 'help' || cmd === 'examples' || parsed.flags.has('help') || parsed.flags.has('examples')) {
    process.stdout.write(usage());
    return 0;
  }
  validateOptions(parsed, cmd);
  if (cmd === 'record') {
    if (parsed.positional.length > 1) {
      throw new Error(`record: unexpected arguments before the '--' separator (${parsed.positional.slice(1).join(', ')}); the command must follow '--'`);
    }
    const ledger = flag(parsed, 'ledger', '.runledger/runs.jsonl');
    const prevHash = await lastHash(ledger);
    const record = await recordRun({ command: parsed.command, cwd: process.cwd(), prevHash, redact: parsed.flags.get('redact') !== false });
    await commitRecord(ledger, record);
    return record.exitCode ?? 1;
  }
  if (cmd === 'summarize') {
    if (!ledgerArg) throw new Error('summarize requires a ledger path');
    const result = parseLedger(await readFile(ledgerArg, 'utf8'));
    const summary = summarize(result.records, !result.ok);
    const format = enumFlag(parsed, 'format', ['markdown', 'json'], 'markdown');
    const content = format === 'json' ? renderJson(summary) : renderSummaryMarkdown(summary);
    await writeOutput(typeof parsed.flags.get('out') === 'string' ? parsed.flags.get('out') as string : undefined, content);
    if (!result.ok) {
      for (const issue of result.issues) {
        process.stderr.write(`line ${issue.line}: ${issue.kind}: ${issue.message}\n`);
      }
      return 2;
    }
    return 0;
  }
  if (cmd === 'verify') {
    if (!ledgerArg) throw new Error('verify requires a ledger path');
    const result = parseLedger(await readFile(ledgerArg, 'utf8'));
    const format = enumFlag(parsed, 'format', ['markdown', 'json'], 'markdown');
    const content = format === 'json' ? renderJson(result) : renderVerifyMarkdown(result);
    await writeOutput(typeof parsed.flags.get('out') === 'string' ? parsed.flags.get('out') as string : undefined, content);
    const failOn = enumFlag(parsed, 'fail-on', ['failed', 'invalid'], 'invalid');
    if (!result.ok) return 2;
    if (failOn === 'failed' && result.records.some((record) => record.status === 'failed')) return 3;
    return 0;
  }
  throw new Error(`unknown command: ${cmd}`);
}

function isMain(moduleUrl: string, argvEntry: string | undefined): boolean {
  if (!argvEntry) return false;
  try {
    return realpathSync(fileURLToPath(moduleUrl)) === realpathSync(argvEntry);
  } catch {
    return false;
  }
}

if (isMain(import.meta.url, process.argv[1])) {
  main(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  }).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

export { parseLedger, summarize };
