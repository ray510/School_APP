# HK_APP development instructions

Read README.md, DEVELOPMENT.md, DEPLOY_CLOUDFLARE.md and docs/IMPLEMENTATION_STATUS.md before changes. Check git status and preserve uncommitted user work. Do not force-push or reset hard.

Use Node 24.x and pnpm 10.28.0 with the committed frozen lockfile. A file existing is not evidence that its command works. Record command, exit code, commit and actual test scope; never mark an unexecuted item PASS.

School evidence rules:
- Admission entry year, annual profile edition, per-field reference period, fetched time and event time are distinct.
- Unknown fee is not zero; unknown session is not ALL_DAY; no inferred deadlines from prior years.
- The observed kindergarten annual file is caret-delimited; CHSC files are comma-delimited.
- Exact name/address matches are candidates, not approved canonical identities. Preserve leading zeros, multi-campus uncertainty and row/file hashes.
- Do not fabricate school rankings, official band labels, acceptance probabilities, admission events or source metadata.
- Keep private notes and personal events in browser IndexedDB; never send them to API, querystrings, logs or analytics.

Operational rules:
- Repo commits do not authorize Cloudflare production deployment or remote D1 writes.
- Current write CLI is local-only. Do not bypass its guards to claim completion.
- Do not rewrite already-applied migrations. Use additive migrations and keep health migration checks aligned.
- Import, review, publish and rollback are separate. Enforce CAS, content hash approval, scope and idempotency.
- Tests that use synthetic data must remain visibly synthetic and isolated from official channels.
- Live source probes are explicit separate jobs, not ordinary unit-test network dependencies.
- Do not commit raw archives, private evidence, secrets, node_modules, dist or local database state.

Acceptance: run pnpm typecheck, pnpm lint, pnpm test, local SQLite publication tests, builds, actual workerd/D1 smoke and desktop/mobile Playwright. Node mocks do not certify workerd. Passing local CI does not complete manual source review, remote authorization, durable backups or production acceptance.

Current evidence and remaining gates are in docs/IMPLEMENTATION_STATUS.md; older planning docs are not completion certificates.
