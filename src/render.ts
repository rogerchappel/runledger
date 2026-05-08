import type { Summary, VerifyResult } from './types.js';
import { stableStringify } from './hash.js';

function fence(text: string): string {
  const trimmed = text.trimEnd();
  return trimmed.length === 0 ? '_empty_' : `\n\`\`\`text\n${trimmed}\n\`\`\``;
}

export function renderSummaryMarkdown(summary: Summary): string {
  const lines = [
    '# RunLedger Summary',
    '',
    `- Total runs: ${summary.total}`,
    `- Passed: ${summary.passed}`,
    `- Failed: ${summary.failed}`,
    `- Changed: ${summary.changed ? 'yes' : 'no'}`,
    `- First started: ${summary.firstStartedAt ?? 'n/a'}`,
    `- Last finished: ${summary.lastFinishedAt ?? 'n/a'}`,
    '',
    '## Runs',
    ''
  ];
  for (const record of summary.records) {
    lines.push(`### ${record.id}`);
    lines.push('');
    lines.push(`- Command: \`${record.command.join(' ')}\``);
    lines.push(`- Status: ${record.status}`);
    lines.push(`- Exit code: ${record.exitCode ?? 'signal'}`);
    lines.push(`- Duration: ${record.durationMs}ms`);
    lines.push(`- Hash: \`${record.hash}\``);
    lines.push(`- Previous hash: \`${record.prevHash}\``);
    lines.push('');
    lines.push('<details><summary>stdout</summary>');
    lines.push(fence(record.stdout));
    lines.push('</details>');
    lines.push('');
    lines.push('<details><summary>stderr</summary>');
    lines.push(fence(record.stderr));
    lines.push('</details>');
    lines.push('');
  }
  return `${lines.join('\n').trimEnd()}\n`;
}

export function renderJson(value: unknown): string {
  return `${stableStringify(value)}\n`;
}

export function renderVerifyMarkdown(result: VerifyResult): string {
  const lines = ['# RunLedger Verification', '', `- Valid: ${result.ok ? 'yes' : 'no'}`, `- Records: ${result.records.length}`, `- Issues: ${result.issues.length}`, ''];
  if (result.issues.length > 0) {
    lines.push('## Issues', '');
    for (const issue of result.issues) lines.push(`- Line ${issue.line}: ${issue.kind} — ${issue.message}`);
    lines.push('');
  }
  return `${lines.join('\n').trimEnd()}\n`;
}
