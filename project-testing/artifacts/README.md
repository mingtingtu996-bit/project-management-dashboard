# Testing Artifacts

This directory is the local root for generated release-test evidence. Generated files remain ignored; this README exists so a clean checkout has the directory contract required by the testing center.

## Contents

- `browser-checks/`: screenshots, videos, traces, accessibility output, and browser smoke evidence.
- Other generated subdirectories: diagnostic logs, release packages, migration evidence, and test-run output owned by the command that creates them.

## Governance

- Do not store credentials, tokens, cookies, authorization headers, database URLs, personal data, or unredacted production payloads here.
- Keep local, staging, and production evidence in explicitly named, separate subdirectories. Never use local output as staging or production proof.
- Generated evidence is ignored by default. A file may be committed only when a governing contract explicitly names it and its contents are reviewed for sensitive data.
- A report, screenshot, manifest, or passing test is supporting evidence only. It does not prove deployment, database migration, runtime consumption, rollback readiness, or production completion by itself.
- Production and destructive-operation evidence must retain target identity, SHA, timestamp, operator, approval, monitoring, and rollback lineage outside secrets.
