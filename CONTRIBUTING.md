# Working on this repository

The skill is plain files and Node. There is nothing to install to use it, and one test-only
dependency to check it. This page is what you need before your first change.

## Run everything

```bash
node --test test/protocol.test.mjs            # the protocol, the checker, the renderer, the builder
npm ci && npx playwright install chromium firefox webkit
npx playwright test                           # every page, 3 browsers × desktop, tablet, phone
node checks/browser/list-page.check.mjs       # the list pages in a real Chrome (skips without Chrome)
node checks/browser/flow-page.check.mjs       # the flow page, the brief, hostile input
```

The same suites run on every pull request. `main` changes only through a pull request with a passing
check.

## What a change carries

- **A new refusal comes with a test that proves it.** Add the rule to `bin/check.mjs`, then a test in
  `test/protocol.test.mjs` that feeds it a file it must refuse. Remove the rule and watch the test
  fail before you keep it: a guard nobody has seen fail is not a guard.
- **Every checker message says three things**: what is wrong, what to do, and what leaving it would
  cause. `expiresAt "yesterday" is not a UTC date-time like 2026-10-03T08:00:00Z. Give it an end, or
  an old yes can be used for a new situation.` A message that only names the problem is a bug.
- **The example pages are generated.** After changing `bin/render.mjs` or an example, run:
  ```bash
  for p in review.example.json:checkout-uat decision-review.example.json:decision-review flow-booking.review.json:flow-booking; do
    node bin/render.mjs "examples/${p%%:*}" "examples/${p##*:}.html"; done
  ```
  CI fails if they are out of date.
- **A page fetches nothing.** No URL, no web font, no script from anywhere: a reviewer opens it on a
  plane, and a test refuses any request that is not the file itself. Inline what you need.
- **Anything copied into a generated page is MIT-0** (`lib/build-feedback.mjs`, the page template, the
  styles). A test fails if another licence reaches a page. The tools are Apache-2.0, the protocol and
  schemas CC0-1.0; see [LICENSING.md](LICENSING.md).
- **Both sides of a format change.** A new field belongs in the schema (`schemas/*.json`, both are
  `additionalProperties: false`), in the checker, in the page, and in `PROTOCOL.md` in the same change.
- **Touch targets stay 44 px on a touch screen**, and the page must work by keyboard alone.
- **`SKILL.md` is tested with agents, not only read.** If you change what it tells an agent to do, run
  a fresh agent on the old wording and on the new one, with the same task, and say in the pull request
  what each did. That file is the whole instruction layer; wording changes behaviour.

## How a change travels

1. An issue says what should be true when it is done.
2. A branch per issue, a pull request that closes it.
3. The pull request says what changed, what it refuses now, and what you ran.
4. A human merges.

## Where things are

| Path | What it is |
|---|---|
| `SKILL.md` | what an agent reads: when to use the skill, how to write a review, how to report what comes back |
| `PROTOCOL.md` | the contract: invariants, verdict sets, diagrams, approvals, comments, what each check refuses |
| `schemas/` | `review.v1` and `feedback.v1`, served at the address their `$id` names |
| `bin/check.mjs` | the checker: `review`, `feedback`, `pair`, `history`, `followup` |
| `bin/render.mjs` | one review file in, one offline HTML page out |
| `bin/answer.mjs` | answers given in chat, written as a checked feedback file |
| `bin/pictures.mjs` | the pictures a reviewer attached, written out as files to look at |
| `lib/` | the pieces the page and the checker share: the builder, the layouts, the drawings |
| `examples/` | the worked examples, and the pages generated from them |
| `test/`, `checks/browser/` | the unit tests, the cross-browser tests, the real-Chrome checks |

## Asking for a human's judgement

This project uses its own skill on itself. When a change needs someone to judge several things at
once, write a review, render it, and send the page — rather than a paragraph in a comment thread.
