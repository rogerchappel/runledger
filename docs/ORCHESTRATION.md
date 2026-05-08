# RunLedger Orchestration

RunLedger was built as a local-first OSS factory slice.

## Source inputs

- PRD: `/Users/roger/Developer/my-opensource/oss-ideas/ideas/in-progress/runledger/PRD.md`
- Scaffold: StackForge `oss-cli` template from `/Users/roger/Developer/my-opensource/stackforge`
- Target repository: `rogerchappel/runledger`

## Delivery gates

1. Scaffold into the target repo only.
2. Implement the TypeScript CLI MVP.
3. Add deterministic fixtures and tests.
4. Run local validation:
   - `npm test`
   - `npm run check`
   - `npm run build`
   - `npm run smoke`
   - `bash scripts/validate.sh`
5. Push directly to `main` for the public GitHub repo.
6. Set GitHub description/topics.
7. Protect `main` best-effort using Roger's helper script.

## Ownership notes

This repo is intentionally small and traceable. Future tasks should land with a linked issue or PR when not part of the initial factory bootstrap.
