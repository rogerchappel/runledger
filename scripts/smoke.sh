#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

rm -rf .smoke-runledger
mkdir -p .smoke-runledger

node dist/index.js verify examples/sample-runs.jsonl --format markdown --out .smoke-runledger/VERIFY.md
node dist/index.js summarize examples/sample-runs.jsonl --format json --out .smoke-runledger/SUMMARY.json
node dist/index.js record --ledger .smoke-runledger/runs.jsonl -- node -e "console.log('smoke ok token=ghp_abcdefghijklmnopqrstuvwxyz123456')"
node dist/index.js verify .smoke-runledger/runs.jsonl --fail-on invalid --out .smoke-runledger/REAL-VERIFY.md
node dist/index.js summarize .smoke-runledger/runs.jsonl --out .smoke-runledger/REAL-SUMMARY.md

grep -q 'RunLedger Verification' .smoke-runledger/VERIFY.md
grep -q '"total":2' .smoke-runledger/SUMMARY.json
grep -q '\[REDACTED\]' .smoke-runledger/runs.jsonl

echo "runledger smoke passed"
