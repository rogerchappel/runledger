const SECRET_PATTERNS: RegExp[] = [
  /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}\b/g,
  /\bsk-[A-Za-z0-9_-]{20,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\b(?:password|passwd|pwd|secret|token|api[_-]?key|authorization)\s*[:=]\s*([^\s"']+)/gi,
  /Bearer\s+[A-Za-z0-9._~+\/-]+=*/gi
];

export function redactSecrets(input: string): string {
  let output = input;
  for (const pattern of SECRET_PATTERNS) {
    output = output.replace(pattern, (match, captured: string | undefined) => {
      if (captured) return match.replace(captured, '[REDACTED]');
      if (/^Bearer\s+/i.test(match)) return 'Bearer [REDACTED]';
      return '[REDACTED]';
    });
  }
  return output;
}
