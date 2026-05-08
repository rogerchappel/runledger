# Safety model

RunLedger is designed to be boring on purpose.

- No telemetry.
- No hosted account.
- No network calls in CLI commands.
- Redaction is enabled by default.
- Ledger writes are append-only JSONL at the path the caller chooses.
- Verification fails when a hash changes, a previous hash does not line up, or a record cannot be parsed.

## What RunLedger does not prove

RunLedger does not prove who ran a command, that a machine was uncompromised, or that a ledger was not deleted and recreated. It provides local review evidence with tamper-evident continuity.
