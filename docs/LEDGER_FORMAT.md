# Ledger format

RunLedger writes newline-delimited JSON. Every line is a `runledger.v1` record.

Required continuity fields:

- `prevHash`: the previous record hash, or 64 zeroes for the first record.
- `hash`: SHA-256 of the canonical JSON record without the `hash` field.

The canonical JSON serializer sorts object keys recursively. This keeps Markdown, JSON summaries, and hash calculations deterministic across runs.

A verifier should reject malformed JSON, non-`runledger.v1` records, previous-hash mismatches, and hash mismatches.
