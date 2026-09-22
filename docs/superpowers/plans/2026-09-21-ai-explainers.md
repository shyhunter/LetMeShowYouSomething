# AI explainers implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement task-by-task. Follow @test-driven-development and @verification-before-completion.

**Goal:** Implement the approved #70 spec, completing #32's diagram catalogue without adding runtime dependencies or live AI integrations.

**Architecture:** Add a focused semantic checker, a pure MIT-0 AI presentation helper shared by layout/drawing, and three reusable JSON/HTML reviews. Preserve the existing generic node/edge review loop and revalidate proposed copies.

**Tech Stack:** Node ESM, JSON Schema 2020-12, inline HTML/SVG/CSS, existing Playwright test dependency.

**Spec:** `docs/superpowers/specs/2026-09-21-ai-explainers-design.md` (user approved).
**Baseline:** Public main 3535a25; 141 unit tests pass. Work in codex/70-ai-explainers only. User alone merges.

## Task 1 — Checker, schema and proposal contract

Files: create `lib/check-ai.mjs`, `test/ai-checks.test.mjs`; modify `bin/check.mjs`, `schemas/review.v1.schema.json`, `lib/build-feedback.mjs`, and import the new tests from `test/protocol.test.mjs`.

- [x] Write integration tests using the real CLI and synthetic valid agent graph: start → model-call → end, explicit agent:true, explained end, estimated token breakdown. Assert invalid mutations emit named rule diagnostics and exit 1; assert valid cases exit 0.
- [x] Run `node --test test/ai-checks.test.mjs`; observe failures before implementation.
- [x] Implement `aiFaults(diagram)` returning an array of actionable diagnostic strings. Validate explicit flag/kind, AI labels, closed stop fields, graph bounds and shape, silent leaves, outgoing ends, reverse reachability to terminal stops excluding annotations/associations, and closed bounded token totals. Use Map/Set for graph identity.
- [x] Call it before kind-specific early returns in diagramFaults. AI kinds belong only to flowchart/system; allow terminal human-handoff to satisfy the existing agent ending check, not ordinary endings. Keep ordinary diagrams compatible; reject stop metadata outside valid agent endpoints. Reject malformed shapes before generic traversal can crash.
- [x] Add matching closed schema fields/defs/conditional diagram-kind and node-kind restrictions. Cross-references and graph semantics remain checker responsibilities.
- [x] Add direct and paired-feedback tests for generic add-node refusal in agent flows, invalid removal/closed-loop proposals, valid rename/relabel/removal, ordinary/system add-node compatibility, comments and followup round trips. Implement agent add-node refusal in applyProposals, retaining actionable comment guidance.
- [x] Run the focused tests and full `node --test test/protocol.test.mjs`, then commit explicit checker/schema/test files once green.

## Task 2 — Drawing, layout and controls

Files: create `lib/draw-ai.mjs`, `test/ai-drawing.test.mjs`; modify `lib/layout.mjs`, `lib/draw-diagram.mjs`, `bin/render.mjs`; import tests from `test/protocol.test.mjs`.

- [x] Write failing drawing tests for all five visible kind captions, full Why/Next strings, escaping, content-aware layout bounds, both token bases, exact counts, safe zero-total bars, long unbroken/wide-glyph text. Run `node --test test/ai-drawing.test.mjs` and observe failures.
- [x] Implement pure helpers for AI captions, deterministic wrapped text/content height, node content, and token chart SVG. No imports from Apache checker into generated pages. Render stop details in full; extend only rows containing taller nodes. Reserve icon/caption space and keep original diagram layout behavior for existing nodes.
- [x] Draw AI icons/outline using existing original icon vocabulary, visible kind captions and untruncated stop details. Append token summary within a bounded accessible chart region below flowchart/system graphs, with full labels/counts and author-supplied disclaimer; no new comment target type.
- [x] Inline MIT-0 helpers before layout and drawing. Hide generic add-node for agent flows with explanatory comment hint, retaining add-edge and all other appropriate operations; preserve database and ordinary controls.
- [x] Run focused and full unit tests; regenerate pages when renderer changes. Commit explicit presentation files after green.

## Task 3 — Three reusable offline reviews

Files: create `examples/retry-backoff.review.json`, `examples/booking-race.review.json`, `examples/ai-tool-loop.review.json` and corresponding generated `.html`; modify `PROTOCOL.md`, `CONTRIBUTING.md`, `.github/workflows/check.yml`, `test/browsers/pages.spec.mjs`.

- [x] Build only the three approved synthetic understanding reviews: finite 1/2/4-second retry path with failure/success, two contenders with atomic reservation and explicit loser outcome, and bounded AI loop with five kinds, stop explanations, token total and item links.
- [x] Validate each through `node bin/check.mjs review examples/<name>.review.json`; add unit tests for all examples and comment/proposal/followup exports before any fixes those tests require.
- [x] Document agent context, stop semantics, token basis/arithmetic limits, proposals and reusable example catalogue in PROTOCOL.md. Do not change SKILL.md.
- [x] Add all examples to CI's checker/regeneration loop, CONTRIBUTING commands and browser PAGES registry. Generate all seven HTML pages using `node bin/render.mjs`.

## Task 4 — Browser regressions, mutation proof and independent review

Files: create `test/browsers/ai.spec.mjs`; extend `checks/browser/list-page.check.mjs` for AI and hostile surfaces.

- [x] Add browser tests for captions/stops/token counts, zero totals, keyboard selection and comments, allowed rename/relabel export checked with `check pair`, refused addition controls, post-proposal rendering, HTML re-export, malicious strings in every new surface, and long/wide text bounds. Assert zero external requests/page errors and touch targets >=44px.
- [x] Run `npm ci --ignore-scripts --no-audit --no-fund` and existing pinned Playwright browsers; run `npx playwright test --workers=3`, both complete real-Chrome suites, and `node --test test/protocol.test.mjs`. Investigate/fix failures using @systematic-debugging and add reproducing tests first.
- [x] Disable each new refusal guard individually in disposable copies; verify its named test fails, then confirm real branch passes. Include proposal guard as well as semantic diagnostics. Do not mutate the working source to bypass validation.
- [x] Strictly validate all seven reviews against JSON Schema with temporary test-only tooling; compare regenerated HTML byte-for-byte; inspect screenshots and public-data boundary; run `git diff --check`.
- [x] Request independent spec-compliance and code-quality reviews of the final diff. Fix important findings and rerun affected/full suites. Record actual evidence, not expected outcomes.

## Task 5 — Publish and hand off

- [ ] Commit only intended public files; fetch main and resolve genuine integration issues without disturbing unrelated work.
- [ ] Push codex/70-ai-explainers and create a focused PR closing #70 and #32 only if every catalogue requirement is fulfilled; attach the PR to this task.
- [ ] Check off #70's six acceptance items after verified implementation, linking the PR and distinguishing implemented from merged. Leave parent #32 part 4 unchecked until the user merges.
- [ ] Wait for PR CI/security checks, report readiness and recommend human merge with reasons. Never merge. Keep the issue checkout for review follow-ups.

## Verification record — 2026-09-22

- 190 unit tests passed; 297 Playwright tests passed across three engines and three viewport sizes.
- Both complete real-Chrome suites passed, including new AI comments, exports and hostile-input checks. Desktop screenshot inspected.
- Seven review examples passed strict JSON Schema 2020-12 validation and regenerated byte-identically.
- All 32 new diagnostic/proposal guards were disabled individually in disposable copies; each named test failed as intended.
- Independent implementation/spec review found an annotation/control-edge mismatch. Reproducing tests were red before the shared-control-edge fix and green afterwards; reviewer confirmed resolution and no remaining important findings.
- No runtime dependencies, live model/provider calls, or changes to SKILL.md. Public examples use invented data only.
- Implementation is published as one cohesive feature commit after verification, rather than intermediate commits for tightly coupled checker/rendering changes. User alone merges.
