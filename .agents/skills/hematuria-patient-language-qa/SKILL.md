---
name: hematuria-patient-language-qa
description: "Use when reviewing or changing Chinese/English Patient Agent wording, patient-facing answers, intent aliases, semantic routing, contextual follow-ups, compound questions, unknown fallbacks, or bilingual conflict quarantine in this hematuria training repository. Trigger for language QA, patient-answer regressions, polarity checks, and proportionate Patient Agent test selection; do not use it to decide medical truth."
---

# Hematuria Patient Language QA

## Purpose

Audit patient-facing language and routing without changing medical facts. Preserve deterministic safety projection, bilingual conflict quarantine, and teacher-only information boundaries.

## Workflow

1. Inspect the branch, diff, and affected Patient Agent path.
2. Read only the relevant existing evidence:
   - `docs/goal/PATIENT_INTENT_NORMALIZATION_AUDIT.md`
   - `docs/goal/PATIENT_UNKNOWN_FALLBACK_REPORT.md`
   - `docs/goal/PATIENT_PROMPT_AUDIT.md`
   - `docs/goal/PATIENT_INTENT_DECISION_TRACE.md`
   - `docs/goal/HEM-P0-023_ADJUDICATION.md`
3. Classify the request as language/alias, routing, context/compound answer, safe projection/quarantine, or medical adjudication.
4. Route medical adjudication to `$hematuria-medical-governance`. Do not choose a source value, polarity, diagnosis, or reviewer outcome.
5. Make the smallest scoped code or test change. Keep source slots and approved runtime projections authoritative.
6. Run the minimum tests below. Escalate to the full gate for shared routing, safety projection, bilingual classification, or release behavior.
7. Confirm `git diff -- data` is empty and report medical blocks separately from engineering QA.

## Required Boundaries

- Treat `data/**` as read-only. Never rewrite a fact, polarity, provenance, `reviewerStatus`, `teacherReviewRequired`, `needs_revision`, or the 360-point rule.
- Preserve HEM-P0-001 and HEM-P0-023 blocks until named human review resolves them.
- Keep missing, unobserved, ambiguous, and bilingual-inconsistent facts as natural `unknown`; never convert them to negative.
- Let intent matching identify the requested fact only. It must not manufacture the fact value.
- Limit Patient Agent output to the current allowed answer. Do not expose diagnoses, complete histories, reports, scoring points, or teacher answers before the allowed stage.
- Use an LLM only to phrase an already allowed fact; provider output cannot expand certainty or bypass deterministic filtering.
- Keep compound answers complete for allowed matched facts while omitting quarantined or teacher-only facts.

## Reuse Existing Assets

| Concern | Existing command |
|---|---|
| Intent catalog and aliases | `pnpm run test:patient-intents` |
| History, pain, and context routing | `pnpm run test:patient-history-routing`, `pnpm run test:patient-pain-routing`, `pnpm run test:patient-context` |
| Compound questions | `pnpm run test:patient-compound-history` |
| Safe patient projection | `pnpm run test:patient-safe-projection` |
| Semantic and chief-complaint routing | `pnpm run test:patient-semantic-classifier`, `pnpm run test:patient-chief-complaint` |
| Prompt safety | `pnpm run test:patient-prompt-audit` |
| Bilingual behavior and quarantine | `pnpm run test:bilingual`, `pnpm run test:bilingual-conflict-quarantine` |
| Stage-level regression | `pnpm run test:42-stage-flow` |

Do not create a duplicate language matrix or test runner when these scripts cover the change.

## Test Levels

### Minimum tests

- Wording or alias only: run the nearest intent, paraphrase, bilingual, or prompt-audit command.
- Routing or follow-up: run the affected routing command plus `test:patient-safe-projection`.
- Compound or polarity behavior: run `test:patient-compound-history` plus `test:bilingual-conflict-quarantine`.
- Any Patient Agent code change: also run `pnpm run typecheck`.

### Full gate

Run `pnpm run lint`, `pnpm run typecheck`, and `pnpm run test` when shared matchers, catalogs, projections, agent contracts, or multiple cases change. Invoke `$hematuria-release-gate` for build, bundle, browser, security, and remote evidence requirements.

## Prohibited

- Do not edit medical facts to make a language test pass.
- Do not add broad LLM guessing, whole-sentence whitelists, or a fallback that increases certainty.
- Do not remove conflict quarantine or collect an unreviewed fact for scoring.
- Do not log prompts, patient answers, credentials, tokens, or hidden teacher content.
- Do not run conversion, generation, or medical-review apply commands for a language-only task.

## Output

```text
Status: PASS | BLOCKED | FAIL
Scope: affected language, intent, cases, and files
Evidence: policy and source paths used
Tests: exact commands and results; distinguish minimum from full gate
Boundaries: data diff and quarantine status
Remaining: medical review or release evidence still required
```
