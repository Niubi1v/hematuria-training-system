---
name: hematuria-medical-governance
description: "Use when preparing, reconciling, deduplicating, prioritizing, validating, or reporting medical review materials for this hematuria training repository, including source conflicts, bilingual polarity conflicts, BLOCKED_MEDICAL history items, simulation facts, metadata, English labels, and case signoff. Trigger for read-only medical governance work; never use it to adjudicate facts or approve review items."
---

# Hematuria Medical Governance

## Purpose

Prepare traceable human-review evidence while leaving every medical fact and approval state unchanged. Keep engineering defects outside the medical queue.

## Workflow

1. Record the branch, HEAD, status, and `git diff -- data`.
2. Reuse the existing review guide and formal queue before opening individual artifacts:
   - `docs/medical-review/EXPERT_REVIEW_GUIDE.md`
   - `docs/medical-review/hematuria_expert_review_queue.xlsx`
3. Follow cited evidence into:
   - `docs/goal/HEMATURIA_PRODUCTION_GOAL.md`
   - `docs/goal/HEM-P0-023_ADJUDICATION.md`
   - `docs/goal/HISTORY_MEDICAL_BLOCKED_REVIEW.md`
   - `docs/goal/HISTORY_MEDICAL_RECONCILIATION_MATRIX.md`
   - existing workbooks and queues under `docs/medical-review/`
4. Normalize only identifiers, evidence paths, categories, deduplication keys, and priority. Use case + field/fact + root cause as the default deduplication key and retain every original defect ID and source report.
5. Write specific reviewer questions with conflicting values and the requested decision. Leave conclusion, reviewer, and date blank.
6. Preserve existing expert workbook content. Provide mappings and append lists instead of creating a duplicate workbook.
7. Run the read-only validators and confirm `data/**` has no diff.

## Required Boundaries

- Do not modify any medical fact, source value, derived value, simulation value, polarity, diagnosis, treatment, or score.
- Do not choose between conflicting sources or translate ambiguity into certainty.
- Do not approve simulation, populate reviewer identity/date, clear `teacherReviewRequired`, change `reviewerStatus`, remove `needs_revision`, or mark a case signed off.
- Preserve provenance, original defect IDs, evidence paths, and blank human-decision fields.
- Keep source/source and opposite-polarity conflicts at P0 when they affect diagnosis, triage, scoring, or definite Patient answers.
- Keep engineering, CI, browser, deployment, dependency, and UI-only defects outside the medical queue.
- Treat existing expert-entered Excel cells as immutable.

## Reuse Existing Assets

| Concern | Existing command or evidence |
|---|---|
| Consolidated queue contract | `pnpm run test:medical-review-queue` |
| Workbook schema and blank approvals | `pnpm run test:medical-review` |
| Review queue counts and provenance | `pnpm run test:medical-review-queue` |
| Candidate import safety | `pnpm run test:medical-review-import` |
| History medical reconciliation | `pnpm run test:history-medical-reconciliation` |
| Bilingual quarantine | `pnpm run test:bilingual-conflict-quarantine` |
| Primary queue | `docs/medical-review/hematuria_expert_review_queue.xlsx` |

Treat queue builders, apply scripts, conversion scripts, and report generators as mutating implementation tools. Do not run them during read-only governance preparation.

## Test Levels

### Minimum tests

- Markdown/CSV organization only: run `pnpm run test:medical-review-queue`.
- Workbook mapping or queue contract change: also run `test:medical-review` and `test:medical-review-queue`.
- Import-field documentation: also run `test:medical-review-import`.
- History or bilingual classification: also run the corresponding history or bilingual test.
- Always run `git diff -- data` and inspect reviewer/conclusion/date fields.

### Full gate

Run all medical-review tests, history reconciliation, bilingual quarantine, repository secret scanning, and the queue/workbook contracts when master counts, mappings, or signoff summaries change. Invoke `$hematuria-release-gate` only for release consideration; a green engineering gate never constitutes medical approval.

## Prohibited

- Do not run any `apply:*`, `generate:*`, `convert:excel`, or `build:medical-review-queue` command.
- Do not overwrite expert workbooks or generate a functionally duplicate Excel queue.
- Do not fabricate evidence, expert specialty, signoff readiness, reviewer, date, or decision.
- Do not copy patient-identifying data, credentials, tokens, or secrets into reports.
- Do not label unresolved items as approved, passed, or medically correct.

## Output

```text
Status: READY_FOR_HUMAN_REVIEW | BLOCKED | FAIL
Scope: files, cases, and authoritative sources
Counts: before/after deduplication and P0/P1/P2
Validation: commands, results, unique IDs, 42-case coverage, data diff
Human work: specialties and unresolved evidence
Invariants: blank decisions, unchanged statuses, no automatic approval
```
