---
name: hematuria-clinical-data-policy
description: "Use when reviewing or changing Data Agent authority, clinical order/result presentation, physical-exam display, units, reference ranges, bilingual labels, status localization, report visibility, or scoring-data isolation in this hematuria training repository. Trigger for clinical data policy checks and fail-closed display behavior; do not use it to invent or approve clinical values."
---

# Hematuria Clinical Data Policy

## Purpose

Apply the repository's clinical data authority and presentation contracts without altering clinical truth. Keep incomplete or unreviewed metadata visibly blocked rather than inferred.

## Workflow

1. Inspect the diff and identify the affected layer: source data, derived projection, API contract, Data Agent display, or scoring.
2. Read the relevant existing evidence:
   - `docs/goal/HEMATURIA_PRODUCTION_GOAL.md`
   - `docs/goal/FINAL_REPORT.md`
   - `docs/goal/TEST_EVIDENCE.md`
   - `docs/medical-review/EXPERT_REVIEW_GUIDE.md`
   - `docs/medical-review/hematuria_expert_review_queue.xlsx`
3. Trace each displayed value to its source and provenance. Separate clinical values from presentation-only labels.
4. If a unit, reference range, English name, source binding, or reviewer decision is missing, preserve the value and use established fail-closed pending-review behavior.
5. Change only presentation or authority logic explicitly in scope. Do not edit `data/**`.
6. Run the minimum tests, then check `git diff -- data`.
7. Route disputed medical meaning to `$hematuria-medical-governance` and release verification to `$hematuria-release-gate`.

## Required Boundaries

- Treat source values, order IDs, result bindings, units, ranges, abnormal flags, diagnoses, and physical findings as immutable medical facts.
- Never infer a unit, reference range, English clinical name, normality, or polarity from engineering context.
- Preserve provenance and distinguish `source`, `derived`, `simulation`, and unreviewed metadata.
- Keep Data Agent authority separate from Patient Agent answers and scoring authority.
- Keep hidden reports and teacher material unavailable before the allowed stage.
- Preserve `reviewerStatus`, `teacherReviewRequired`, `needs_revision`, and the 360-point scoring contract.
- Use existing localized pending-review text; do not silently drop blocked fields or show internal identifiers as clinical labels.

## Reuse Existing Assets

| Concern | Existing command or evidence |
|---|---|
| Data Agent presentation | `pnpm run test:data-agent-presentation` |
| Data Agent authority and scoring isolation | `pnpm run test:data-agent-authority` |
| Orders and result binding | `pnpm run test:orders` |
| Contradictions and clinical contracts | `pnpm run test:clinical` |
| Physical-exam quality | `pnpm run test:exam-qc` |
| Patient-facing profile boundary | `pnpm run test:profile-qc` |
| Product-wide visibility contracts | `pnpm run test:product` |
| Metadata and English-name review | `docs/medical-review/hematuria_expert_review_queue.xlsx` |

Prefer these contracts over a new policy file or duplicate fixture set.

## Test Levels

### Minimum tests

- Display or localization only: run `test:data-agent-presentation`.
- Authority, report visibility, or scoring isolation: run `test:data-agent-authority` plus `test:product`.
- Order/result mapping: run `test:orders` plus `test:clinical`.
- Physical-exam display: run `test:exam-qc`.
- Any TypeScript change: also run `pnpm run typecheck`.

### Full gate

Run `pnpm run lint`, `pnpm run typecheck`, and `pnpm run test` when shared clinical projections, APIs, stage visibility, scoring inputs, or multiple cases are affected. Invoke `$hematuria-release-gate` before declaring release readiness.

## Prohibited

- Do not modify `data/**` or generated clinical facts.
- Do not fill missing metadata or translate a clinical term by assumption.
- Do not change abnormal/normal status, diagnosis, treatment, or scoring to satisfy a UI test.
- Do not run `generate:*`, `convert:excel`, `apply:medical-review`, or `build:medical-review-queue`.
- Do not expose teacher reports, answer keys, credentials, or raw sensitive payloads.

## Output

```text
Status: PASS | BLOCKED | FAIL
Scope: affected data path, UI/API surface, and files
Authority: source/provenance and fail-closed decision
Tests: exact minimum and full-gate results
Boundaries: data diff, scoring, and review-state checks
Remaining: metadata, medical, or release blockers
```
