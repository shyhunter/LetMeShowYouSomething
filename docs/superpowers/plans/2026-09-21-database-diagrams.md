# Database diagrams implementation plan — #32 part 3 / #69

**Goal:** Render and validate database tables and relationships in the existing offline review loop.

**Architecture:** Keep the generic nodes/edges protocol and comment targets. Add database validation in a focused checker module and drawing in a MIT-0 module. Inline the drawing with the existing renderer. Keep runtime dependency-free.

**Execution:** Inline in the approved isolated branch; user alone merges.

- [x] Add focused refusal, drawing, and proposal round-trip tests in `test/protocol.test.mjs`; run them and observe the missing-feature failures.
- [x] Add the closed database schema to `schemas/review.v1.schema.json`, preserving the merged system/sequence catalogues.
- [x] Implement bounded table/column/key/row/relationship validation in `lib/check-database.mjs`, called by `bin/check.mjs` for original and proposed diagrams.
- [x] Add deterministic, readable table/relationship drawing in `lib/draw-database.mjs`; use existing node/edge hooks and edge positions for repeated table pairs. Inline in `bin/render.mjs` and hide incompatible add proposals there. Update `lib/build-feedback.mjs` to reject those operations and retain database edge semantics.
- [x] Add a synthetic worked review and generated HTML under `examples/`; update `PROTOCOL.md`, CI example checks, contribution regeneration instructions, and browser coverage. Keep `SKILL.md` unchanged because generic protocol guidance already routes agents to PROTOCOL.md.
- [x] Prove new refusal guards catch faults when removed, run all unit and three-engine browser suites plus both real-Chrome suites, validate schemas and regenerated examples, and inspect the rendered page.
- [x] Review the final diff and public-data boundary.

Handoff: commit explicit files, push the issue branch, create a PR with `Closes #69` and `Refs #32`, and report checks. Leave merging to the user.

Baseline: 96 unit tests passed on public main at 426c284 before feature changes.

Review acceptance: show table/column names, plain-language types, a Key marker, column-specific Many/One endpoints, Example data captions and step selection. Each refusal has a named test covering ids, empty tables, keys, endpoints, cardinality, duplicates, steps, row shapes, scalar cells and bounds. Accept distinct foreign keys joining the same pair; test their comments and proposals separately. Browser checks cover these visible labels, keyboard selection, and exported feedback for both tables and relationships, with hostile text in every new surface.

Verification checkpoint: 141 unit tests and 243 cross-browser tests pass. Strict draft-2020 JSON Schema validation accepts all four worked reviews, and all four HTML examples match regeneration. Each of the 32 database diagnostic guards was disabled individually in a disposable copy; its named refusal test failed. Independent review findings about wide text and self-reference labels were reproduced, fixed, and covered by browser geometry tests. Separate comments and original edge targeting after a proposed removal are covered through exported feedback.
