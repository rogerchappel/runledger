# RunLedger

RunLedger is a tiny local flight recorder for command-line work. It records what you ran, redacts obvious secrets, appends tamper-evident JSONL, and renders deterministic Markdown or JSON summaries you can paste into reviews.

It is for developers and agentic coding loops that need evidence without sending source code to a hosted dashboard.

## Quick start

```bash
npm install
npm run build
node dist/index.js record -- npm test
node dist/index.js summarize .runledger/runs.jsonl --out REPORT.md
node dist/index.js verify .runledger/runs.jsonl --fail-on changed
```

After install from npm, use `runledger` instead of `node dist/index.js`.

## Commands

### `record`

Runs a command and appends one JSONL record.

```bash
runledger record --ledger .runledger/runs.jsonl -- npm test
```

Each record includes command, cwd, timestamps, duration, exit code, stdout/stderr, previous hash, and record hash.

### `summarize`

Produces deterministic Markdown by default, or JSON with `--format json`.

```bash
runledger summarize examples/sample-runs.jsonl --out REPORT.md
runledger summarize examples/sample-runs.jsonl --format json
```

### `examples`

Prints copy-pasteable examples without touching the network or filesystem.

```bash
runledger examples
runledger --examples
```

### `verify`

Recomputes the hash chain and reports tampering or malformed records.

```bash
runledger verify examples/sample-runs.jsonl
runledger verify .runledger/runs.jsonl --fail-on invalid
runledger verify .runledger/runs.jsonl --fail-on failed
```

## Safety model

- Local-first: the CLI makes no network calls.
- Redaction is on by default for common token, bearer, password, and API key shapes.
- Hidden writes are avoided; `record` writes only to the requested ledger path, defaulting to `.runledger/runs.jsonl`.
- JSONL entries are hash chained from a genesis hash, so edits, deletions, and reordering are detectable.
- Output is deterministic so fixture comparisons and review diffs stay tidy.

## Examples

Checked-in fixtures live in [`examples/`](examples/):

```bash
npm run build
node dist/index.js verify examples/sample-runs.jsonl
node dist/index.js summarize examples/sample-runs.jsonl --format json
npm run smoke
```

## Limitations

RunLedger is not CI, notarization, or a security boundary. A local user can delete files or start a new ledger. Treat it as practical review evidence: compact, offline, and hard to accidentally tamper with unnoticed.

## Development

```bash
npm test
npm run check
npm run build
npm run smoke
bash scripts/validate.sh
```

## Contributing

Issues and PRs are welcome. Please keep changes small, include fixtures for behavior changes, and avoid telemetry or surprise network behavior. See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md).

## License

MIT
