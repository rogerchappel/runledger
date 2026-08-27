# Changelog

All notable changes to this project will be documented in this file.

This project follows the [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format and uses semantic versioning when versioned releases are published.

## [Unreleased]

### Fixed

- `record` now rejects non-flag arguments before the `--` separator (exit 1, no ledger write) instead of silently truncating the recorded command.
- `verify` now exits 2 on any invalid ledger regardless of `--fail-on` mode; `--fail-on failed` still exits 3 when a recorded command failed.
- Removed the behaviorless `--fail-on changed` value; supported thresholds are now `invalid` and `failed`.

## [0.1.0] - 2026-05-08

### Added

- Added a release-readiness checklist for local verification and package review.

- Local-first `record`, `summarize`, `verify`, and `examples` commands.
- Tamper-evident JSONL hash chaining.
- Default redaction for common secret, token, password, and bearer credential shapes.
- Deterministic Markdown and JSON output.
- Fixtures, tests, smoke script, and validation docs.

## Release Links

- Latest release: `https://github.com/rogerchappel/runledger/releases/latest`
