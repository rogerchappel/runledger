# Examples

## Record a test run

```bash
runledger record -- npm test
```

## Use a custom ledger path

```bash
runledger record --ledger evidence/local.jsonl -- npm run check
```

## Summarize for a pull request

```bash
runledger summarize evidence/local.jsonl --out RUNLEDGER.md
```

## Fail a local gate on tampering

```bash
runledger verify evidence/local.jsonl --fail-on changed
```

## Inspect the checked-in fixture

```bash
npm run build
node dist/src/index.js verify examples/sample-runs.jsonl
```
