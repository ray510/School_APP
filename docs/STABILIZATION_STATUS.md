# Phase 1 stabilization — 2026-09-18

Base: `ray510/HK_APP`, `main` commit `7d04886264ddca498d859711689a2280f4ac9b32`.
Branch: `fix/phase1-stabilization`. Main and Cloudflare resources are not changed by this work.

## Executed evidence

| Check | Status | Evidence / boundary |
|---|---|---|
| Native Node regression suite | PASS | `node scripts/run-regressions.mjs`: 51 passed, 0 failed, exit 0, Node 22.16.0 / Linux. |
| SQLite SQL / fixture compatibility | PASS | Included above; actual original migration, ten tables, foreign keys, replay-safe synthetic fixture. Not D1 runtime validation. |
| Parser / normalizer / readiness logic | PASS | Included above; no third-party dependencies. The test-only resolver maps the identity workspace export. |
| Full workspace installation | BLOCKED | Execution sandbox cannot resolve registry.npmjs.org. No lockfile was fabricated. |
| Node 24 full typecheck / lint / Vitest / Vite build | NOT_RUN | Added CI workflow; require actual run logs. Node 22 regressions are not full Node 24 acceptance. |
| Wrangler dry-run, local migrations, HTTP smoke | NOT_RUN | Commands added but not executed in this sandbox. SQLite tests are not a substitute. |
| Browser / Playwright | NOT_RUN | No browser acceptance claim. |
| Cloudflare remote operations | NOT_RUN | No remote resources, migrations, seed, deployment, cron or publication. |

CI is separate evidence. Its result must be read after execution; the existence of the workflow is not a PASS.

## Changes

- Direct `c.env.DB` / `c.env.ASSETS`; no `c.env.Bindings` runtime access.
- Health reads APP_ENV, DB connectivity, recorded migration and published heads. Empty, missing and degraded are not called ready/published.
- Missing frontend HTML entry restored; frontend validates the health contract and shows empty/error states.
- CSV empty-quote bug fixed; strict UTF-8 or explicitly selected BIG5; malformed shape/HTML rejected. Short-row warnings block normalization.
- School level comes only from an explicit reviewed category map. No name heuristic, default primary, fabricated full-day session or hard-coded snapshot date.
- Duplicate source keys quarantined; unknown session encoded as UNKNOWN. Existing source-scoped school-ID hashing preserved (not UUID v5).
- Root/per-workspace tsconfigs and scripts; generated Worker types; explicit non-watch test collection; real contracts workspace dependency.
- Local-only migration/fixture/config/smoke commands; identical absolute persistence path from every working directory. Fixtures are synthetic and unpublished.
- Historical completion claims superseded. Initial migration is unchanged.

## Toolchain and unresolved reproducibility

Node 24.x and pnpm 10.28.0 are required for the full toolchain. Wrangler is pinned to the verified upstream release 4.135.0; vue-tsc is moved off the incompatible 1.x toolchain. Other existing dependency ranges are deliberately not advertised as locked. No claim of dependency security audit is made.

The bootstrap CI resolves dependencies only when no lockfile exists and saves the generated lockfile as an artifact. Review and commit it, then rerun with `--frozen-lockfile` before release. A green bootstrap run is not proof of a reproducible build. CI has read-only repository permissions and does not commit or deploy.

## Known remaining work

Real S01 category/session/campus mappings still need source evidence. S02–S04 are not newly verified. Search, comparison, admission events, cross-source identity reconciliation and publication controls are not completed. `source probe/build` and `review` deliberately fail with BLOCKED rather than pretending success.

`pnpm test:e2e` remains NOT_RUN until real browser tests are provided. Production asset indexing, build-info validation, complete source lineage and release safety remain release gates in DEVELOPMENT.md. Do not enable admin writes or deploy this branch merely because regression tests pass.

## Sources used for implementation

- Hono bindings: https://hono.dev/docs/getting-started/cloudflare-workers#bindings
- Wrangler command deprecations: https://developers.cloudflare.com/workers/wrangler/deprecations/
- Wrangler configuration/types: https://developers.cloudflare.com/workers/wrangler/configuration/
- Node TextDecoder: https://nodejs.org/api/util.html#class-utiltextdecoder
- Wrangler pinned release: https://github.com/cloudflare/workers-sdk/releases/tag/wrangler%404.135.0
- pnpm pinned release: https://github.com/pnpm/pnpm/releases/tag/v10.28.0
