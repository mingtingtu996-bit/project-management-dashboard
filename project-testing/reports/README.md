# Testing Reports

Generated release-readiness, handoff, diagnostic, and closeout reports are written below this directory. Report output remains ignored; this README keeps the reports root present in clean checkouts.

## Rules

- Do not write secrets, credentials, cookies, private keys, raw authorization headers, or unredacted production data into reports.
- Label every report as local, staging, or production and retain the evaluated commit SHA, target identity, generation time, and command where applicable.
- Readiness and planning reports coordinate work; they are not evidence that deployment, migration, runtime consumption, monitoring, rollback, or production acceptance occurred.
- Staging evidence cannot close a production gate, and historical reports cannot prove the current SHA.
- Commit a generated report only when an explicit governance contract requires it and the file has passed sensitive-data review.
