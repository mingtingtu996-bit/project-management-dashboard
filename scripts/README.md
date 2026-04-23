# Scripts Layout

This directory groups repo-level utility scripts by intent.

- `diagnostics/`: runtime and data inspection scripts used for troubleshooting
- `smoke/`: ad hoc verification and feature smoke scripts
- `db/`: one-off database helpers, seeders, and SQL utilities
- `archive/`: older investigation helpers kept for reference

Repo-root scripts intentionally kept in place because they act like entrypoints:

- `check-health.ts`
- `verify-timed-jobs-fix.ts`
- `one-click-deploy.ps1`
- `start-server.bat`
- `启动登录系统.bat`
