---
name: hematuria-release-gate
description: "Use when assessing commit, branch, pull-request, preview, or production release readiness for this hematuria training repository; selecting minimum versus full verification; checking build, test, security, data-diff, medical-governance, and remote evidence; or preparing a concise gate report. Trigger before push, Ready review, merge, deploy, or release claims."
---

# Hematuria Release Gate

## Purpose

Evaluate release readiness from current evidence without changing medical facts or expanding deployment authority. Report stale, missing, or externally unverifiable evidence as blocked.

## Workflow

1. Record branch, full HEAD, worktree status, upstream, and the exact diff under review.
2. Read the current release policies:
   - `docs/goal/HEMATURIA_PRODUCTION_GOAL.md`
   - `ACCEPTANCE_MATRIX.md`
   - `docs/goal/TEST_EVIDENCE.md`
   - `docs/goal/DEFECT_LOG.md`
   - `docs/goal/STATIC_RELEASE_AUDIT.md`
   - `docs/goal/ROLLBACK_PLAN.md`
3. Classify the change as documentation/Skill-only, localized code, shared behavior, clinical/governance, security, build/configuration, or release candidate.
4. Run the minimum gate for the change. Run the full gate for shared contracts, security, data pipelines, scoring, release configuration, or any Ready/merge/deploy claim.
5. Recheck the worktree and `git diff -- data`. Do not accept generated drift or review-state changes.
6. Bind every result to the tested HEAD and environment. Do not reuse old CI or Preview evidence for a new HEAD.
7. Separate local, CI, Preview, Pages, and Production evidence. Mark unavailable external configuration `BLOCKED` or `NOT VERIFIED`.

## Required Boundaries

- Never modify medical facts, approve review items, clear `needs_revision`, change scoring rules, or run medical apply/generation commands to make a gate pass.
- Keep HEM-P0-001, HEM-P0-023, simulation, metadata, and case-signoff blocks independent from engineering green status.
- Preserve 42 cases, seven stages, Patient/teacher visibility boundaries, and the 360-point server-authoritative scoring contract.
- Do not expose or print secrets, tokens, cookies, signatures, patient answers, or hidden teacher content.
- Do not force-push, rewrite history, merge, mark a PR Ready, deploy Production, or change environment variables without explicit authority.
- Treat Draft Preview evidence as non-Production evidence.

## Reuse Existing Assets

| Gate | Existing command or evidence |
|---|---|
| Type safety and lint | `pnpm run typecheck`, `pnpm run lint` |
| Behavior and governance | `pnpm run test` |
| Browser flow | `pnpm run test:e2e` or the documented controlled external-server form |
| Preview contract and output | `pnpm run test:preview-config`, `pnpm run test:preview-output-security`, `pnpm run test:e2e:preview` |
| Vercel-style build | `pnpm run build`, then `pnpm run test:bundle` |
| Pages build | `pnpm run build:github`, then `pnpm run test:bundle` |
| Repository secrets | `pnpm run test:secrets`, `pnpm run test:secret-scanner` |
| Public API configuration | `pnpm run validate:api-config`, `pnpm run test:api-config`, `pnpm run test:public-routes` |
| Medical review preparation | `pnpm run test:medical-review-queue` |

Use `docs/goal/TEST_EVIDENCE.md` as the evidence format; do not create a parallel release ledger.

## Test Levels

### Minimum gate

- Documentation or repository Skill only: validate the artifact, run `pnpm run test:secrets`, inspect the diff, and confirm `git diff -- data` is empty.
- Localized code: run the nearest package test plus `typecheck`; add lint when source code changes.
- Patient, Data Agent, or medical-governance work: invoke the matching repository Skill and include its minimum tests.
- Configuration or public API change: run relevant config/security tests plus typecheck and lint.

### Full gate

For a release candidate, run the repository's required Node version and package manager, dependency audit required by current CI, typecheck, lint, `pnpm run test`, complete Playwright, both production builds with bundle scans, repository secret scanning, and the clean/data gate. Verify the exact new HEAD in CI and the intended Preview environment. Require separate human medical signoff and explicit Production authority.

Run conversion idempotency or other data-writing gates only in a dedicated clean worktree or CI job designed to detect and discard generated drift. Never run them over uncommitted user work.

## Prohibited

- Do not call a partial, timed-out, retried-only, or stale result a pass.
- Do not waive a failed assertion by increasing timeouts or deleting coverage.
- Do not make a production claim from localhost, Draft CI, or Preview evidence.
- Do not run `convert:excel`, `generate:*`, `apply:*`, or medical queue builders in the active worktree.
- Do not include secrets or sensitive values in logs, reports, commits, or prompts.

## Output

```text
Gate: PASS | BLOCKED | FAIL
HEAD: full SHA, branch, upstream, and worktree state
Scope: changed files and selected gate level
Results: exact commands, environment, exits, counts, and skipped checks
Invariants: data diff, medical states, scoring, and sensitive-data scan
External: CI/Preview/Pages/Production status tied to SHA
Blockers: owner and evidence still required
```
