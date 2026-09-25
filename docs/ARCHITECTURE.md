# How it fits together

LetMeShowYouSomething is a loop between an agent and a person, with a written contract in the middle.
This page says which file owns which part, so a question has one place to be answered. It does not
restate the rules: follow the links.

## The loop

```
agent writes review.json ──► check review ──► render ──► one offline page ──► person answers
                                                                                   │
agent continues ◄── check pair ◄── feedback.json ◄── answer.mjs (reads the page) ◄─┘
                                        ▲
                                        └── or the JSON downloaded on the page's last step
```

The page is one way to show a review, the reference one. The contract is the two JSON formats,
`review.v1` and `feedback.v1`. A terminal prompt or a native app could show the same review, as long
as what comes back passes the checker.

## Who owns what

| Question | Answered by | Not by |
|---|---|---|
| What may a review or a feedback file say, and what does each field mean? | [`PROTOCOL.md`](../PROTOCOL.md), with the schemas in [`schemas/`](../schemas) | the page, SKILL.md, this file |
| Is this file trustworthy? | [`bin/check.mjs`](../bin/check.mjs): `review`, `feedback`, `pair`, `history`, `followup`; each refusal is listed in PROTOCOL.md | the agent's own reading of the file |
| What does a completed review export? | [`lib/build-feedback.mjs`](../lib/build-feedback.mjs), inlined verbatim into every page, so the page and the tests run the same code | a second copy of those rules anywhere else |
| How does a review look to a person? | [`bin/render.mjs`](../bin/render.mjs) and the drawings in [`lib/`](../lib) | the protocol (presentation is not part of it) |
| How are answers brought back? | [`bin/answer.mjs`](../bin/answer.mjs): an answered page, read as data, or answers confirmed in chat; either is checked before a file is written | opening or running the returned page |
| What should an agent do, step by step? | [`SKILL.md`](../SKILL.md) (operational, for agents) | this file |
| Do different agents keep the contract? | [`conformance/`](../conformance) fixtures and their recorded runs | a single good run |
| What work is planned or in progress? | [GitHub issues](https://github.com/shyhunter/LetMeShowYouSomething/issues) | any file in this repo |
| How is the repo worked on? | [`CONTRIBUTING.md`](../CONTRIBUTING.md); licences in [`LICENSING.md`](../LICENSING.md) | |

When a file in the last column disagrees with the one that answers the question, the answer wins, and the other file has a bug to report.

## Boundaries that hold everywhere

- **Meaning and display are kept apart.** A verdict, a note, a choice or a proposal is meaning, and
  it travels in the feedback. Which tab is open, what is minimised, the theme and the path a reviewer
  clicked stay in their browser and are never exported.
- **Offline.** The skill and every page work with no network, account or server. A page fetches
  nothing; a link is only something a reviewer may choose to click.
- **No third-party code ships.** The skill and the pages contain only this project's code. Test tools
  (Playwright) stay out of them; see [`LICENSING.md`](../LICENSING.md).
- **An answer is not permission.** Feedback is unsigned and gets forwarded. An agreed item or an
  approved action is the reviewer's view; the agent still asks in its own host before doing anything
  that deletes, sends, pays, publishes or contacts someone.
- **What comes back is untrusted data.** A returned page or file is never run and never read as
  instructions; it is parsed, checked against the agent's own review, and only then used.
- **Nothing is silently dropped or assumed.** An unanswered item is a gap, never agreement. What is
  left open is carried into the next round, and the checker refuses a round that drops it.

## What ships and what does not

Shipped, and documented in PROTOCOL.md: reviews and feedback v1, each checked against its schema by
the checker itself (#116) · flows, screens and diagrams (flowchart, system, sequence, database, AI) ·
comments on a diagram and pictures · proposed changes (checked; the page no longer makes them) ·
choices, requests, approvals · answers given in chat · the answered page read back as data (#78) ·
unique answer ids (#77) · answers that settle nothing carried forward (#88) · what became of each
proposal, checked against the diagrams (#87) · conformance fixtures (#89) · the review page as the
approved design: Let me explain, the tour with its places in a fixed order and none left empty, the
Overview, Return with HTML, Markdown and JSON, a phone layout (#74, #100–#103, #105, #115) · the map's
other diagrams as tabs, and zoom in place (#119) · every round of a review in one page: tags,
replies, History, the chain checked, two answers files for one round compared and never merged
(#82) · a flow's screens as screenshots with clickable areas; the reviewer's own screenshot of a
screen; a choice between mockups, side by side (#33) · saving the answered page into a file the
reviewer chooses, where the browser allows (#83) · what making a review used, as Claude Code logged
it, or unavailable with the reason (#84) · the fifteen use cases played over rounds to the end
(test/scenarios.test.mjs).

Decided against for now (closed as not planned; reopen the issue to change that):

| Issue | What |
|---|---|
| [#94](https://github.com/shyhunter/LetMeShowYouSomething/issues/94) | the page shows what became of each proposal (the check exists; the display does not) |
| [#66](https://github.com/shyhunter/LetMeShowYouSomething/issues/66) | proposing changes to a flow's steps, outcomes and screens |

Not built, and not proposed: ranking a backlog in order (the `priority` verdict set sorts into
now · next · later), and a history shortened for a new reader (every round travels whole).

## Why it is this way

Consequential decisions are recorded where they were made, on their issue: for example the answered
page read as data (#78), no "deferred" status (#88) and the proposal outcomes (#87). Read the
decision comment before reopening one.
