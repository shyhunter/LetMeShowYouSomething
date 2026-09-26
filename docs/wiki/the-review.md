# The review (`review.json`)

[← Wiki home](README.md)

The review is what the agent asks you. It is a JSON file the agent writes, checks and keeps; you never see it, only
the page made from it. Everything the page shows comes from here, so a review that is right makes a page that is
right.

## What it holds, and what each part brings

| Part | What it is | The value |
|---|---|---|
| `ask`, `afterwards`, `audience` | What the agent needs, what it will do with your answers, and who it is written for | You know what your answer changes before you start, so you put in real effort |
| `brief` | One explanation for the whole review: the question, the recommendation, examples with sources, the risks | Said once, not repeated on every item; an example without a source is shown as unverified |
| `items` | One thing to judge each | Nothing hides inside "looks good": each gets its own answer |
| `verdictSet` | The answer words for this review, each with a tone (positive, caution, negative, neutral) | A test is judged "works / doesn't work", a plan "agree / disagree": the right words for the job, never a bare yes/no |
| `sections` | Groups of items; a section can be `choose-one` with a `recommended` option | Pick one of several options, and see how often you overrule the agent |
| `approval` | An item that asks to approve **one exact action** (what, scope, risk, preview, expiry) | Kept apart from "agree", so an opinion is never read as permission |
| `kind: "challenge"` section | Statements where the agent says it may be wrong | You judge the agent's own doubts, not only its proposals |
| `affects` | An item that reopens, extends or contradicts an earlier decision, quoting it | Nothing already agreed is changed without you seeing it; the checker proves the quote |
| `diagrams` | Pictures the page draws: flowchart, system, sequence, database, and AI flows | You see where each question sits; boxes link to the questions about them |
| `flow` | Screens and steps: an app to click through | See the app before it is built, and judge every tap |
| `usage` | What making the review used, as the host reported it | Honest cost: measured, partial or "unavailable", never an estimate |

## The kinds of review

Start any of them with `init.mjs` (see [the other tools](the-tools.md)); each comes with answer words that fit.

| Kind | Answer words | Use it for |
|---|---|---|
| `decision` | Agree · Partly agree · Disagree · Revisit · Changed my mind | Options and a recommendation |
| `plan` | the same | A plan to approve step by step |
| `test` | Works · Partially works · Doesn't work · Couldn't test it | Acceptance testing |
| `explain` | Clear · Partly clear · Lost me · Seems wrong | Explaining how something works; you say what is still unclear |
| `flow` | Agree · Partly agree · Disagree · Revisit | An app idea or a change to an app, screen by screen |
| `backlog` | Now · Next · Later · Can't place it | Sorting what to do first |

## A flow: the app to click through

A flow is a review where **each step is one tap**:

- **Screens** (`flow.screens`) are drawn from 28 plain components (headers, cards, inputs, tables, dialogs …) or are a
  **screenshot** of the running app with a marked area for each tap. Value: you judge what people will actually see.
- **A step** says what is tapped (`from`, `on`), why (`goal`) and what happens (`outcomes`): where it leads, what the
  person can do next (`canNow`), and why something went wrong (`because`). Value: dead ends and unexplained failures
  show up before anything is built.
- **Parts** (`flow.parts`) split a long process into sub-processes. Value: you always know where you are
  ("Booking › Book a slot").
- **Status and basis**: every step is `exists`, `proposed` or `suggested`, with where the claim comes from (code with a
  file and line, a PRD, the conversation, an assumption). Value: you can tell what is there today from what the agent
  made up, and the checker proves every code reference.
- **Behind each outcome**, optional layers: what runs (`system`) and what data changes (`data`, before → after).
  Value: the developer on the review sees the consequences, without the others having to read them.

## Diagrams

Four kinds, each with its own rules, all drawn by the page itself (never Mermaid, so the page stays offline):

- **Flowchart**: what happens, in order, with lanes for who does what.
- **System**: what runs and what it talks to. Nothing floats: every box is on an arrow.
- **Sequence**: who calls whom, in order.
- **Database**: tables, their columns and key, example rows, and how they link.
- **AI flows** (flowchart or system): model calls, tool calls, retrieval, guardrails and hand-offs to a person, each
  ending explained.

The user flow is computed from the flow, so it can never disagree with the screens.

## What never goes in

No secrets (the checker refuses anything shaped like a key or token), no real customer data, no one else's private
notes. A review gets forwarded.
