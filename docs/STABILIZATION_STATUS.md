# Phase 1 stabilization — verified CI evidence

Updated: 2026-09-18, after CI run 35362039037 completed.
Repository: ray510/HK_APP. Branch: fix/phase1-stabilization. Main is unchanged.
Tested code commit: baa7793e83e376af2ab55cb27aac3065cd3ea0a1.
PR: https://github.com/ray510/HK_APP/pull/1
CI: https://github.com/ray510/HK_APP/actions/runs/35362039037

## Actual execution results

Environment: GitHub Actions Ubuntu 24.04.5; Node 24.20.0; pnpm 10.28.0; Wrangler 4.135.0.
The initial attempt on 9ae0650 failed because generated local bindings omitted ASSETS. Explicit environment assets configuration fixed this; the subsequent full run succeeded.

| Check | Status | Evidence |
|---|---|---|
| Bootstrap workspace installation | PASS | Actual pnpm install --no-frozen-lockfile; five workspace projects. |
| Native Node regression suite | PASS | 51 passed, 0 failed; regression job 105655401590. Earlier isolated Node 22.16.0 run also passed. |
| Full typecheck | PASS | Generated Wrangler types, contracts, Vue frontend, Worker and CLI. |
| Lint | PASS | eslint with max-warnings 0. |
| Vitest | PASS | 65 passed across 3 files: identity 33, CSV 22, Hono routing 10. |
| Frontend build | PASS | Vite 5.4.21 generated dist/index.html and assets. This is not browser interaction testing. |
| Worker build | PASS | wrangler deploy --dry-run; explicitly exited without deployment. |
| Local D1 migration | PASS | 001_initial_schema.sql; 20 commands executed in local Wrangler storage. |
| Synthetic fixture | PASS | 8 local commands; fake records are clearly labelled and unpublished. |
| Real local workerd HTTP smoke | PASS | 10 checks: health, JSON API 404 for fetch/navigation, manifest, root and SPA fallback. data_status was correctly empty. |
| Frozen-lock reproducibility | NOT_RUN | CI-generated pnpm-lock.yaml is an artifact, not yet committed. |
| Browser / Playwright | NOT_RUN | No full browser acceptance claim. |
| Windows local execution | NOT_RUN | Cross-platform scripts provided; execution evidence above is Linux. |
| Live source-to-search feature | NOT_RUN | Real category/campus mappings, imports, search and comparison remain incomplete. |
| Cloudflare remote operations | NOT_RUN | No deployment, remote migration/seed, cron or publication. |

The 51 native cases and 65 Vitest cases are separate suites; they do not imply a measured coverage percentage or complete product acceptance.

## Artifact

Run artifact: https://github.com/ray510/HK_APP/actions/runs/35362039037/artifacts/10554651030
It contains pnpm-lock.yaml and the actual local Worker log.
Lockfile SHA-256: d6fb8a29d25c2568c64a6102b59a741042e4a2afd3f49ba21c9fb08db493e639.
The lockfile was downloaded and inspected: format 9.0, five importers, 429 package and snapshot entries, integrity-based package resolutions. This is not a dependency security audit.
Review and commit the actual generated lockfile, then rerun --frozen-lockfile before a reproducibility/release claim. Do not reconstruct or invent lockfile entries. GitHub artifact retention is seven days; preserve a copy.

## Implemented fixes

- Direct c.env.DB / c.env.ASSETS access, environment-specific asset bindings, generated Worker types.
- Health distinguishes service liveness, DB connectivity, recorded migration, empty data and actual published heads.
- Restored frontend HTML entry and validated health states; no claim that search or real data is already available.
- Strict CSV parsing fixes quoted empty fields, explicitly decodes BIG5 and rejects malformed or HTML responses.
- Reviewed category mappings instead of name heuristics; unknown session remains UNKNOWN; duplicate keys are quarantined.
- Source dates, snapshot IDs and mapping/parser versions come from supplied evidence, not hard-coded dates.
- Workspace typecheck/build/test configuration; local-only migration, fixture, config and smoke commands.
- Original initial migration and original source-scoped school ID algorithm preserved. No automatic production data approval.

## Remaining gates

Phase 1 remains IN_PROGRESS rather than unconditional COMPLETE: commit the generated lockfile and verify frozen installation, add browser acceptance, and retain explicit data-publication boundaries. Source probe/build and review commands remain BLOCKED where unimplemented.

School search, school details/comparison, annual admissions events, cross-source identity reconciliation and production publication are not delivered by this stabilization patch. Do not deploy merely because the local checks pass.

## Implementation references

- https://hono.dev/docs/getting-started/cloudflare-workers#bindings
- https://developers.cloudflare.com/workers/wrangler/deprecations/
- https://developers.cloudflare.com/workers/static-assets/binding/
- https://nodejs.org/api/util.html#class-utiltextdecoder
