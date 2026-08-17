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

package_json="$(tar -xOf "$install_dir/$tarfile" package/package.json)"
node -e '
  const packageJson = JSON.parse(process.argv[1]);
  if (packageJson.name !== "@rogerchappel/runledger") throw new Error(`unexpected package name: ${packageJson.name}`);
  if (packageJson.repository?.url !== "git+https://github.com/rogerchappel/runledger.git") throw new Error("unexpected repository URL");
  if (packageJson.bin?.runledger !== "./dist/src/index.js") throw new Error("runledger binary is missing or changed");
' "$package_json"
grep -Fq 'npm install --global @rogerchappel/runledger' README.md

cd "$install_dir"
npm init --yes >/dev/null
npm install --ignore-scripts "./$tarfile"
./node_modules/.bin/runledger --help | grep -q 'RunLedger'

echo "runledger package smoke passed: $tarfile"
