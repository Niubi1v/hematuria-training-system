---
name: hematuria-desktop-ui-quality
description: Audit and refine the Hematuria Clinical Interview Training desktop UI in Operate mode. Use for Tauri desktop layout, responsive behavior, clinical-workbench hierarchy, student-facing wording, interaction states, accessibility, screenshot review, and UI-only release checks. Do not use it to change medical facts, patient or data agent behavior, scoring, stage contracts, persistence, model selection, or provenance.
---

# Hematuria Desktop UI Quality

## Work in Operate mode

Treat the product as a clinical OSCE workbench. Optimize task completion, scanability, predictable structure, and recovery from failure. Keep the interface familiar, restrained, professional, and clear. Preserve existing clinical workflow and business contracts.

## Respect the boundary

- Change only UI components, CSS and design tokens, student or settings copy, UI tests, and small UI audit documents.
- Do not edit `data/**` or change medical facts, triage, provenance, Patient Agent, Data Agent result logic, evidence graph, SQLite, local LLM selection, stage APIs, required fields, scoring, or the 360-point contract.
- Do not reveal complaint details, disease course, case answers, scoring internals, provider details, intent, provenance, agent names, or other implementation fields to students.
- Do not use the words AI, Provider, intent, provenance, or agent in student-facing copy. Describe availability and recovery in task language.

## Apply the fixed visual system

- Use Segoe UI and Microsoft YaHei UI through the system font stack.
- Use one low-saturation blue-green accent and neutral surfaces.
- Avoid gradients, glass effects, neon, heavy shadows, marketing banners, background photos, textures, external fonts, CDNs, and experimental asymmetric layouts.
- Maintain practical clinical information density. Group by task meaning; do not wrap every section in a card.
- Reuse the repository's tokens, buttons, fields, status treatments, icons, borders, and radii. Add tokens only when they express a reusable role.
- Use motion only to explain state change, with 150–250 ms durations. Respect reduced-motion preferences.

## Audit before editing

1. Inspect the rendered Tauri application, not screenshots alone.
2. Cover home, history, examination and investigations, diagnosis builder, consultation, order workbench, perioperative checklist, review, settings, and local-resource status.
3. Check 1366×768, 1440×900, Windows 125% effective viewport, and 390×844.
4. Test first launch without dragging, horizontal and vertical overflow, nested scrolling, persistent primary actions, stages 3–6 cognitive load, hierarchy, long Chinese and English text, empty/loading/error/disabled states, keyboard focus, contrast, hidden-answer leakage, and seven-stage consistency.
5. Record findings as P0, P1, or P2 before product edits. Treat blocked completion as P0, major task friction or accessibility failure as P1, and polish or low-risk consistency drift as P2.

## Make proportionate fixes

- Fix only P0 and high-value P1 findings unless the user expands scope.
- Keep the current task and primary action visible without introducing competing sticky regions.
- Give each pane one clear scroll owner. Avoid nested vertical scrolling where page-level flow works.
- Reduce repeated borders and nested cards; keep meaningful section boundaries.
- For stages 3–6, show selection or completion summaries near the action without changing requirements.
- Present stage 7 as a percentage-based review. Never display raw scoring fields or internal evidence identifiers.
- Write concise, specific recovery copy that states what happened and what the learner can do next.
- Cover every interactive control in default, hover, focus, active, disabled, loading, and error states. Preserve semantic labels and visible keyboard focus.

## Verify with two screenshot rounds at most

1. Save before screenshots for the same routes and viewport definitions.
2. Complete all known P0 and selected P1 fixes, then run screenshot round one.
3. Use round two only for residual issues visible in round one. Stop after round two.
4. Run UI tests, relevant Playwright coverage, TypeScript, ESLint, Tauri build, accessibility checks, four-size overflow checks, secret scanning, and `git diff -- data`.
5. Report blocked checks explicitly; never claim a gate passed from indirect evidence.

## External source note

This project-specific skill was rewritten after read-only review of:

- `pbakaus/impeccable` at commit `5bec5408e5ad52f44691f30639ee80d00e9713d8` (Apache License 2.0). Concepts adapted: Operate mode, measurable audit, layout, clarify, harden, adapt, polish, and detector heuristics.
- `Leonxlnx/taste-skill` at commit `e988add20dab0fa97d7a76781c48961c8184288e` (MIT License). Concepts adapted: scan–diagnose–targeted-fix workflow and minimalist checks for restrained color, crisp borders, hierarchy, and anti-template review.

No external hooks, installers, detectors, or automatic modifiers are bundled or executed. Recommendations that conflict with this product—landing or portfolio defaults, gpt-taste, external fonts, imagery, textures, large asymmetric layouts, elaborate scrolling animation, and Impeccable's bolder, delight, overdrive, animate, or colorize directions—are excluded.
