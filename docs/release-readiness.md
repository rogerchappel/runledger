# Release readiness

Use this checklist before cutting a release or asking for a release review.

## Local verification

```sh
npm install
npm run check
npm run test
npm run smoke
npm run package:smoke
npm run release:check
```

## Package contents

Run `npm run package:smoke` to create the package tarball, install it into an
isolated temporary project, and execute the installed `runledger --help`
binary. The temporary project and tarball are removed after the check.

## Publication contract

RunLedger has not had its first npm release. A `v*.*.*` tag triggers the release
workflow, which packs once, publishes that exact tarball to npm with public
access and provenance, and attaches the same tarball to the GitHub release.
Pull requests that change the release surface pack once and exercise `npm
publish <tarball> --dry-run --access public` without publishing.

## Notes

- Keep README examples aligned with the fixture-backed smoke command.
- Do not publish until CI is green on the release branch.
- Update CHANGELOG.md with user-facing changes before tagging.
