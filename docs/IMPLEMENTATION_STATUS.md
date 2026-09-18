# Implementation status — evidence, not completion percentages

## Scope

Branch `fix/phase1-stabilization`, draft PR #1. `main` is unchanged. There has been no Cloudflare remote deployment, remote D1 migration/import or cron activation.

The repository now contains a functioning local product path: three-level directory/search/detail/compare, browser-private shortlist and notes, private calendar, source-evidenced event contracts and ICS, explicit S01 canary normalization, reviewed local import and atomic publication/rollback. This is NOT a declaration that all original DEVELOPMENT.md phases or all official data sources are complete.

## Verified baseline on commit 977889829d8a902e5b67ed6c530f3b64dfeb4647

Actual GitHub Actions run `35364122786`, job `105662348177`, Node 24.20.0, pnpm 10.28.0, Wrangler 4.135.0:

| Check | Result |
|---|---|
| Frozen dependency installation | PASS |
| Generated Worker bindings and all package typechecks | PASS |
| ESLint with zero warnings | PASS |
| 82 Vitest unit tests | PASS |
| 8 SQLite publication tests | PASS |
| Vue production build | PASS |
| Worker dry-run build (no upload) | PASS |
| Local D1 migrations 001–002 and unpublished fixture | PASS |
| Actual workerd empty-state HTTP smoke, 10 checks | PASS |
| Local synthetic demo import replay | PASS |
| Actual workerd catalog HTTP, 19 checks | PASS |
| Desktop/mobile browser suite | FAIL: 3/6 passed; navigation synchronization failures under investigation |
| Production demo rejection in that combined step | NOT_RUN after browser step failed |

The current change fixes browser test navigation synchronization without removing assertions. It also adds reviewed-event import and migration 003. Those changes require their own CI run; do not inherit the prior PASS result automatically.

## Source observations

S01 was actually read in run `35362924609`, source-contract job `105658331728`: 3,496 raw records and 16 repeated source-number groups. This is a raw-record count, not a deduplicated school count. Source classification comes from observed exact category values, not school-name heuristics. Repeated keys are quarantined. Special-school rows are explicitly out of the initial ordinary-school scope. Session and campus correspondence still need evidence-based mapping; the current baseline uses UNKNOWN/null.

S02–S04 catalogue discovery is implemented, but selected annual-profile resources and cross-source mappings are not certified. A separate explicit live-source workflow builds unpublished S01 canaries and records catalogue results; ordinary unit tests do not contact official websites.

## Remaining gates

- Full-source coverage and duplicate identity resolution; reviewed session/campus mapping.
- Annual kindergarten/primary/secondary profile adapters and per-field provenance.
- Real admissions-event review and publication by the operator; no fictitious dates.
- Complete remote quota observations, role-separated importer/reviewer authorization, durable raw archive and backup certification.
- Staging deployment, on-platform cost measurements and production approval.
- Broader privacy/import conflict/accessibility tests and a genuinely different-version rollback exercise.

Remote write commands currently fail closed; their absence must not be represented as completed functionality. The original two design documents remain the target specification. README describes commands implemented in this branch.
