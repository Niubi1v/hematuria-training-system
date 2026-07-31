# Desktop UI quality audit

Audit date: 2026-08-01

Baseline: `origin/codex/hematuria-desktop-local-ai-poc` at `9393b14b7b8f8bd9ca9d4e4962816e1a45579e1e`

Mode: Operate; clinical OSCE workbench

## Evidence and method

- Inspected a copied, unmodified Tauri portable build at Windows 125% scaling. The source mentor artifact was not changed.
- Captured baseline home, settings, and stage 1 screenshots under `D:\HematuriaDesktopArtifacts\UIQuality\before`.
- Inspected the seven-stage component, settings UI, design tokens, UI states, accessibility tree, and existing viewport tests.
- The copied desktop service rejected stage progression after stage 1. Stages 2–7 therefore require controlled Playwright sessions through the repository's real stage handler for rendered verification.
- Target viewports: 1366×768, 1440×900, 1093×614 as the 1366×768 effective area at 125%, and 390×844.

## P0

1. **Settings cannot be reliably dismissed at 125% scaling.** The centered modal exceeds the effective viewport, its heading and close control are clipped above the visible area, and the backdrop does not provide a usable scroll path to them.
2. **Primary stage actions are not persistently discoverable in short windows.** Long stage content and an independently scrolling main pane place the submit action below the initial viewport. The risk increases sharply in stages 3–6.

## P1

1. Sidebar, main workspace, evidence drawer, chat history, and some stage sections create competing vertical scroll owners. Keyboard and pointer context can move without a clear boundary.
2. Stage 3 repeats bordered evidence groups for a primary diagnosis and three differentials. Completion is textual and remote from the submit action, increasing working-memory load.
3. Stage 4 combines a long department catalog, request details, urgency, questions, evidence, and replies without a compact workflow summary near the action.
4. Stage 5 renders many full-height order editors in sequence. The selected order count and completion state are not visible where the learner commits the stage.
5. Stage 6 uses a long repeated checklist with optional notes, again separating progress from commitment.
6. Stage 7 labels a disclosure as raw 360-point scoring and renders internal evidence identifiers. This leaks scoring and provenance internals instead of presenting a learner-facing percentage review.
7. The settings diagnostic section can expose implementation fields such as `intent`, `answerSource`, and `factState`. Local runtime/model names are more technical than the learner needs.
8. Student-facing copy still contains the term “AI” in the order workbench. Several error banners describe transport rejection instead of one clear recovery action.
9. Raw buttons and fields do not consistently share hover, focus, active, disabled, loading, and error treatments.

## P2

1. Small muted helper text, uppercase eyebrow labels, and mixed radius and border treatments weaken hierarchy.
2. Repeated nested cards add visual chrome without always adding task grouping.
3. The wide home screen has avoidable dead space, while long Chinese or English values have limited explicit wrapping safeguards.
4. Some secondary controls rely on color and border changes that are subtle in high-contrast or keyboard use.

## Selected repair scope

- Fix both P0 findings.
- Address P1 findings for scroll ownership, stages 3–7 learner summaries, settings and student copy boundaries, and reusable control states.
- Do not change medical content, stage payloads, validation requirements, server handlers, or the 360-point backend contract.
- Use no more than two screenshot review rounds.

## External skill research

### Impeccable

- Source: `pbakaus/impeccable`, commit `5bec5408e5ad52f44691f30639ee80d00e9713d8`, Apache-2.0 with attribution notice.
- Adopted: Operate mode; measurable P0/P1/P2 audit; semantic layout and one clear scroll owner; specific recovery copy; long-content and error hardening; context-aware responsive adaptation; state-complete polish; detector heuristics for nested cards, cramped padding, overflow, tiny text, low contrast, inconsistent radii, and clipped popovers.
- Excluded: bolder, delight, overdrive, animate, colorize, and any hook, installer, detector execution, or automatic modifier.

### Taste Skill

- Source: `Leonxlnx/taste-skill`, commit `e988add20dab0fa97d7a76781c48961c8184288e`, MIT.
- Adopted: scan–diagnose–targeted-fix sequencing; preserve the existing stack; one restrained accent; crisp borders; clear hierarchy; plain, specific copy; anti-template review; complete interaction states.
- Excluded: landing or portfolio defaults, gpt-taste, external fonts, photos, textures, gradients, asymmetric editorial layouts, and elaborate scrolling animation.

## Implemented repairs

- Constrained the settings dialog to the effective viewport, added internal scrolling, a visible close control, and Escape-key dismissal.
- Removed student-visible development diagnostics, runtime aliases, model names, raw evidence identifiers, and raw score fields. Local-resource choices remain functionally unchanged and are described as lightweight or standard profiles.
- Added a persistent stage action region with learner-facing completion summaries for diagnosis, consultation, orders, perioperative management, and review.
- Hid the third information column below 1180 CSS pixels so the 1093×614 effective 125% viewport retains a usable central workspace.
- Consolidated duplicate recovery banners, replaced implementation-focused service wording, and used percentage-only stage and final review feedback.
- Removed the stage 7 nested timeline scroll region and made the remaining desktop details drawer keyboard-focusable.
- Normalized shared control timing, disabled fields, shadows, mobile action wrapping, and focus behavior without changing validation or stage payloads.

## Screenshot review

- Exact baseline screenshots: `D:\HematuriaDesktopArtifacts\UIQuality\before\before-*.png` (21 matched web views) plus three real Tauri baseline captures.
- Round 1: `D:\HematuriaDesktopArtifacts\UIQuality\after\round1-*.png` (21 matched views).
- Round 2 and final visual review: `D:\HematuriaDesktopArtifacts\UIQuality\after\round2-*.png` (21 matched views).
- Four viewport definitions passed horizontal-overflow and persistent-action assertions for stages 3–7: 1093×614 effective 125%, 1366×768, 1440×900, and 390×844.

## Validation evidence

- Node 22.14.0 TypeScript and ESLint: pass.
- UI clinical stage 3, stage 4 consultation, and stage 5/6/7 contract suites: pass.
- Targeted desktop and mobile Playwright, four-size layout checks, settings dialog, and axe critical/serious checks: pass after updating one stale UI-copy assertion.
- Next desktop-target build: pass, 82 static pages.
- Tauri 2 release build and NSIS bundle: pass using copied runtime/cache inputs and a read-only pinned Rust toolchain; the model was excluded by the runtime whitelist.
- Repository secret scan and scanner self-test: pass.
- Skill validator: pass.
- `git diff -- data`: empty.

Generated UI artifact: `D:\HematuriaDesktopArtifacts\UIQuality\build\Hematuria-UIQuality-0.1.0-x64-setup.exe`, SHA-256 `A72BD43E247554C24B09579A3132537C0475DA4219F63DEEA5272A0310D96288`.
