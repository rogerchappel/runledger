# RunLedger Task Plan

## MVP delivery

- [x] Scaffold OSS TypeScript CLI with StackForge.
- [x] Preserve the source PRD in `docs/PRD.md`.
- [x] Implement `record` for local command execution and JSONL append.
- [x] Add SHA-256 hash chaining for tamper-evident ledgers.
- [x] Redact common tokens, API keys, passwords, and bearer credentials by default.
- [x] Implement deterministic `summarize` Markdown/JSON output.
- [x] Implement `verify` with non-zero failure gates.
- [x] Add checked-in fixtures and node test coverage.
- [x] Add local smoke script using fixtures and a real CLI run.
- [x] Document quick start, safety model, examples, limitations, and contribution flow.

## Follow-up candidates

- [ ] Add shell completion generation.
- [ ] Support configurable redaction patterns from an explicit local config file.
- [ ] Add optional diff/file artifact references without storing full file content.
- [ ] Publish an npm package once release policy is approved.
