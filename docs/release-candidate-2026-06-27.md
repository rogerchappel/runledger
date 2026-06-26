# RunLedger release candidate notes

Date: 2026-06-27

## Scope

This release candidate keeps the CLI local-first and focuses on making the
published package easier to verify before tagging.

## Verification

```sh
npm run release:check
```

Evidence from the 2026-06-27 release candidate pass:

- TypeScript build completed.
- Node test suite passed: 5 tests.
- CLI smoke passed against `examples/sample-runs.jsonl` and a recorded command.
- Package smoke confirmed `dist/src/index.js`, `dist/src/index.d.ts`, and
  `examples/sample-runs.jsonl` are present before `npm pack --dry-run`.

## Release notes starter

- Align README quickstart commands with the published `dist/src/index.js` CLI
  path.
- Add `prepack` and package smoke file checks so packed tarballs include the
  built CLI, library types, and sample ledger fixture.

## Limitations

RunLedger remains local review evidence, not notarization, CI, or a security
boundary. The package makes no network calls during normal CLI operation.
