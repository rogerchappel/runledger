export type RunStatus = 'passed' | 'failed';

export interface RunRecord {
  schema: 'runledger.v1';
  id: string;
  command: string[];
  cwd: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  status: RunStatus;
  stdout: string;
  stderr: string;
  redacted: boolean;
  prevHash: string;
  hash: string;
}

export interface VerifyIssue {
  line: number;
  kind: 'parse-error' | 'schema-error' | 'prev-hash-mismatch' | 'hash-mismatch';
  message: string;
}

export interface VerifyResult {
  ok: boolean;
  records: RunRecord[];
  issues: VerifyIssue[];
}

export interface Summary {
  total: number;
  passed: number;
  failed: number;
  changed: boolean;
  firstStartedAt: string | null;
  lastFinishedAt: string | null;
  records: RunRecord[];
}
