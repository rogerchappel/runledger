# Ledger format

RunLedger writes newline-delimited JSON. Every line is a `runledger.v1` record.

Required continuity fields:

- `prevHash`: the previous record hash, or 64 zeroes for the first record.
- `hash`: SHA-256 of the canonical JSON record without the `hash` field.

The canonical JSON serializer sorts object keys recursively. This keeps Markdown, JSON summaries, and hash calculations deterministic across runs.

## Output capture

The `stdout` and `stderr` fields are UTF-8 strings. Each independently retains
at most the first 1,048,576 bytes received from the child process. RunLedger
continues draining both streams after either limit is reached, so truncation
does not alter child-process completion, exit code, or signal handling.

If bytes are omitted, the retained string ends with a newline and a marker of
the form `[runledger: truncated N bytes]`, followed by a newline. `N` is the
exact number of received bytes omitted from the retained prefix. The marker is part of the
hashed record. When the limit splits a multibyte UTF-8 character, the retained
prefix backs up to the previous complete character and `N` includes every byte
of the omitted partial character. Capture is bounded before optional secret
redaction; redaction still applies to all retained text. With `--no-redact`,
the complete raw stream is forwarded live to the terminal while only its
bounded copy is recorded.

A verifier should reject malformed JSON, non-`runledger.v1` records, previous-hash mismatches, and hash mismatches.
