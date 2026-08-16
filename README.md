# RunLedger

RunLedger is a tiny local flight recorder for command-line work. It records what you ran, redacts obvious secrets, appends tamper-evident JSONL, and renders deterministic Markdown or JSON summaries you can paste into reviews.

It is for developers and agentic coding loops that need evidence without sending source code to a hosted dashboard.

## Quick start

```bash
npm install
npm run build
node dist/src/index.js record -- npm test
node dist/src/index.js summarize .runledger/runs.jsonl --out REPORT.md
node dist/src/index.js verify .runledger/runs.jsonl --fail-on changed
```

RunLedger has not had its first npm release yet. Until the first tagged release,
use the source-checkout commands above. Tagged releases publish the `runledger`
package to npm; after publication, install it with `npm install --global
runledger` and use `runledger` instead of `node dist/src/index.js`.

## Commands

Options that take values accept either `--option value` or `--option=value`.
Unknown options and value-taking options without a value are rejected before a
command runs or writes output.

### `record`

Runs a command and appends one JSONL record.

```bash
runledger record --ledger .runledger/runs.jsonl -- npm test
```

Each record includes command, cwd, timestamps, duration, exit code, stdout/stderr, previous hash, and record hash.
RunLedger retains at most the first 1 MiB (1,048,576 bytes) of stdout and
1 MiB of stderr in each record while continuing to drain both child streams.
When a stream exceeds that limit, its stored text ends with
`[runledger: truncated N bytes]`, where `N` is the exact number of omitted
bytes. Truncation is applied before redaction, so secrets in retained text are
still redacted and the marker is deterministic.
If the operating system cannot launch the command (for example, because the
executable does not exist), `record` still appends a failed record with exit
code 1 and a diagnostic in stderr. The attempted command remains part of the
hash chain, and later runs can append normally.
By default, command output is buffered until the command finishes, then the same
redacted stdout and stderr written to the record are forwarded to the terminal.
Use `--no-redact` only when raw output is explicitly required; it is forwarded
as the command runs in full, even when the stored copy is truncated, and stored
without redaction.

### `summarize`

Produces deterministic Markdown by default, or JSON with `--format json`.

```bash
runledger summarize examples/sample-runs.jsonl --out REPORT.md
runledger summarize examples/sample-runs.jsonl --format json
```

`summarize` verifies the ledger before rendering. For a valid ledger it writes a
deterministic Markdown or JSON summary and exits `0`. For malformed JSON, an
invalid record schema, a broken previous-hash link, or a record-hash mismatch,
it still writes the useful partial summary (with `changed` set to `true`),
reports every concrete issue on stderr, and exits `2`. When `--out` is used,
the partial summary is written there while diagnostics remain on stderr.

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
node dist/src/index.js verify examples/sample-runs.jsonl
node dist/src/index.js summarize examples/sample-runs.jsonl --format json
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
npm run package:smoke
npm run release:check
bash scripts/validate.sh
```

## Release readiness

Use [docs/release-readiness.md](docs/release-readiness.md) before opening release PRs or tagging a release.

## Contributing

Issues and PRs are welcome. Please keep changes small, include fixtures for behavior changes, and avoid telemetry or surprise network behavior. See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md).

## License

MIT
