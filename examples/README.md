# RunLedger examples

- `sample-runs.jsonl` is a deterministic two-record ledger used by tests and smoke checks.

Try it:

```bash
npm run build
node dist/index.js verify examples/sample-runs.jsonl
node dist/index.js summarize examples/sample-runs.jsonl --format json
```
