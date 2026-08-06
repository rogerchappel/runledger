#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
install_dir="$(mktemp -d "${TMPDIR:-/tmp}/runledger-package-smoke.XXXXXX")"
trap 'rm -rf "$install_dir"' EXIT

cd "$repo_root"
npm run build
test -f dist/src/index.js
test -f dist/src/index.d.ts
test -f examples/sample-runs.jsonl

tarfile="$(npm pack --silent --pack-destination "$install_dir")"
test -f "$install_dir/$tarfile"

cd "$install_dir"
npm init --yes >/dev/null
npm install --ignore-scripts "./$tarfile"
./node_modules/.bin/runledger --help | grep -q 'RunLedger'

echo "runledger package smoke passed: $tarfile"
