# LetMeShowYouSomething — the protocol

**v1 · draft**

This file is the authority on what a review and a feedback file may say and what each field means.
Where another file (SKILL.md, the page, a comment) disagrees, this one wins and the other has a bug.
Which file owns everything else: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

Two files. An agent shows a human a set of things to judge (`review`), and the human's judgement
comes back as data any agent can act on (`feedback`).

```
agent ──► review.json ──► [ any renderer ] ──► human
                                                 │
agent ◄── feedback.json ◄──────────────────────┘
```

The renderer is deliberately not specified. An HTML form is the obvious one; a terminal prompt, a
native app, a Google Form exporter or a printed sheet someone types up are all legitimate. **The
protocol is the contract, not the presentation** — that is the whole point of writing it down
separately.

## Why a protocol and not just a tool

Diagram skills render one way and stop. Hosted-page platforms can collect input, but the result
lives inside one vendor's product. Neither defines *what a judgement is*, so every form invents its
own shape and no two agree.

A stable file format that any agent can emit and any agent can read is a smaller idea than a
product, and a more durable one. It is also the only thing that makes "model independent" true in
practice rather than in principle: a `feedback.json` produced by a form one agent built can be acted
on by a different agent, a script, or a person, next year.

## The five invariants

Everything below is enforced by `bin/check.mjs`. A rule with no mechanism behind it is a
preference, not an invariant.

### 1. Feedback is readable without the review

Every response echoes the **title** of the item it answers, its section label, and the verdict set
it was judged with. A reader holding only `feedback.json` — a different agent, a colleague, a script
six months later — can act on it without the original.

This is the invariant that makes the format portable, and the one most likely to be dropped for
being redundant. It is not redundant. It is the difference between data and a pointer.

### 2. Unanswered is written down, never omitted

An item the reviewer did not touch appears in `responses` with `verdict: "unset"`. It is never left
out.

*"They read it and had no opinion"* and *"this never reached them"* must not look the same to an
agent deciding what to do next. Omission destroys that distinction silently, which is the worst way
to lose information.

### 3. The reviewer can always add an item

`allowAddedItems` defaults to true, and added items carry an `added-` prefix so they can never be
confused with what the agent asked about.

The items you did not know to ask about are usually the valuable ones. In the worked example, the
reviewer-added currency bug is more serious than anything on the original list — and no agent would
have thought to ask.

### 4. Derived fields must be true

`summary` and `gaps` are conveniences, and the checker recomputes both and fails on a mismatch. A
hand-edited file cannot lie about its own totals.

A summary nobody verifies is worse than no summary, because it is the part people read instead of
the data.

### 5. Gaps are first-class

`gaps` lists every response whose verdict has tone `negative` or is unset. The unmet items are the
headline, not something found by scrolling.

`tone` is semantic — `positive` / `caution` / `negative` / `neutral` — never a colour. A renderer
maps tone to its own palette, which is what lets one verdict set work in dark mode, light mode,
print, and a terminal.

## Verdict sets

The vocabulary is declared per review, not baked into the protocol, because a UAT pass and a design
review are not judged with the same words. Verdicts stay **graded**, never a bare yes/no. Presets
that carry their weight:

| id | options | for |
|---|---|---|
| `test` | works · partially works · doesn't work · couldn't test it | acceptance testing |
| `usecase` | built · partial · future | use-case inventories |
| `decision` | agree · partly agree · disagree · revisit · changed my mind | plans, options, decisions |
| `generic` | good · no · unsure | anything else |
| `hypothesis` | plausible · incorrect · missing | incident causes an agent proposed |
| `challenge` | valid concern · not relevant · already handled | where the agent says it may be wrong |
| `generated` | keep · fix · drop | stories, tests, copy an agent drafted |
| `priority` | now · next · later | backlog triage |

**Challenges — where the agent says it may be wrong.** A review has one verdict set, so challenges
inside a review are written as **statements** and judged with that same set: *"This plan underestimates
the cost of sync"* → agree · partly agree · disagree. "Already handled" goes in the note. Put them in
their own section so they read as the agent's self-critique, not as proposals. Never make a challenge
section mandatory — an agent forced to produce doubts will pad them. The `challenge` preset above is
for a review that consists only of challenges.

`unset` is reserved and may never be an option — it means the reviewer did not answer, which is not
a judgement.

**A verdict is an opinion, never permission.** "Agree" says the reviewer thinks an item is right. It
does not authorise anything irreversible or outside the conversation: deleting, sending, paying,
publishing, contacting someone. A feedback file is unsigned and gets forwarded, so it proves nothing
about who answered. Before such an action the agent asks in its own host, naming the exact action and
what it affects (#48). To ask for one exact action, use an approval (below).

## Approvals

An item with `approval` asks to approve **one exact action**, kept apart from agreement (#54). It is
answered **approve** or **decline**, never with the review's verdict set, so "agree" can never be
read as permission.

```json
{ "id": "drop-db", "sectionId": "approve", "title": "Drop the old staging database",
  "approval": { "action": "Drop the database checkout_v1_staging", "scope": "One staging database, no production data",
                "risk": "high", "preview": "DROP DATABASE checkout_v1_staging;", "expiresAt": "2026-10-03T08:00:00Z" } }
```

- `action` is what will be done, `scope` what it touches, `risk` is `low`, `medium` or `high`,
  `preview` shows it as it will be (the command, the message, the diff), and `expiresAt` is when a
  yes stops counting.
- An approval stands in a section of its own: never an option to choose, never a doubt.
- The answer echoes the approval word for word. The checker refuses a file whose approval differs
  from the one asked, an approval given after it expired, and one used after it expired. A decline
  stays a valid no. An unanswered approval is a gap; approve and decline are not.
- **An approval is the reviewer's intent, not proof of authority.** The file is unsigned and gets
  forwarded. The agent still asks in its own host right before it acts, quoting the action.

| check | refuses |
|---|---|
| `approvals well-formed` | an approval without action, scope or risk, without a UTC end, ending before the review was written, or inside a choice or doubts section |
| `verdicts in vocabulary` | an approval answered with anything but approve, decline or unset |
| `approvals echo the review` | an answer whose approval differs from the one asked, or an approval answered as a verdict |
| `approvals still valid` | an approval given after `expiresAt`, or checked after it |

## Asking well

Optional fields that tell the reviewer what is going on before they read a single item:

| field | where | what it says |
|---|---|---|
| `ask` | review | What the agent needs from the reviewer, in a sentence or two. |
| `afterwards` | review | What the agent will do with the answers. People put in real effort when they know what their answer changes. |
| `audience` | review | Who it is written for, so the agent writes once at the right level instead of several versions that can contradict each other. |
| `summary` | item | A plain-language line shown first; `body` becomes the detail behind it. |

**Field keys with a shared meaning.** `fields` are free-form, but these keys mean the same thing in
every review, so any agent reading feedback can rely on them:

| key | meaning | suggested tone |
|---|---|---|
| `assumes` | what must be true for this item to hold | neutral |
| `risk` | what could go wrong | caution |
| `depends_on` | what this needs first | neutral |
| `would_change_my_mind` | the evidence that would make the agent recommend otherwise | neutral |

Uncertainty is written in words the reviewer can check, never as a confidence percentage.

**One explanation, not one per item.** A review may carry a `brief` — everything the agent wants
said before the reviewer starts judging — and a `focus`, the chart that opens first (`user-flow`,
`parts`, or a diagram id):

```jsonc
"focus": "user-flow",
"brief": {
  "explains": "Cancelling frees the slot but the money stays with us as store credit.",
  "highlights": { "nodes": ["step:confirm"], "screens": ["cancelled"] },
  "recommendation": "Keep store credit, and say so before the person confirms.",
  "examples": [{ "name": "Class passes at gyms", "what": "…", "source": "https://…" }],
  "risks": ["Customers may read credit as a refund and ask for the money back."]
}
```

The checker refuses a `focus` that resolves to nothing, an example with no `name` or `what`, and a
highlight that names a screen or node that does not exist. An example **without a `source` is a
warning**: it is shown to the reviewer as unverified, because agents invent convincing examples.

**The reviewer can ask back.** Any item can carry a request for an `example` or an `explain`; those
come back in the feedback as `requests`, checked against the review's items in `pair` mode:

```jsonc
"requests": [{ "itemId": "book", "title": "Taps Book 10:00", "kind": "example", "note": "Show me one." }]
```

An item with a request is **not settled**, whatever its verdict says. The agent answers the requests
straight after the gaps, before anything else it planned to do.

**What an example is.** A request for an `example` asks: *who has already solved this, how, and what
does it look like?*, adapted to this item, and seen the way that product's own users see it: the
screen, the words, the steps. Not how it was built or tested. The answer is one to three real precedents, each with a
`name`, `what` they did, what people see there (`shows`) and a `source`. It goes where the reviewer
will read it: in the item's `examples` in the follow-up review, shown like the brief's examples. An
example without a source is shown as unverified; an invented one is never acceptable. A generic
instruction ("use a test code") is not an example.

```jsonc
"examples": [{ "name": "…", "what": "…", "shows": "…", "source": "https://…" }]
```

## Choosing one

A section with `mode: "choose-one"` asks the reviewer to pick exactly one of its items. It may carry
`recommended: { itemId, why }` — one of its own items, with the reason.

Every item can still be judged on its own, so "I pick B, but I partly agree with A's risk" is
expressible. The pick comes back in `choices`: one entry per choose-one section, **chosen or not**
(`itemId: null`), with the chosen option's title echoed and `followedRecommendation` derived. Across
many files, that is how often reviewers overrule the agent.

**Options that look different** (#33): in a review with a flow, an option may be a step whose one
outcome leads to its own screen, drawn or a screenshot. The pick then shows every option's screen side
by side, each with its own button. Worked example: `examples/results-layout.review.json`.

## Decisions have memory

An item can declare what it does to an earlier decision:

```json
"affects": [{
  "decision": { "review": "offline-first-2026-09", "itemId": "no-network",
                "title": "The review page makes zero network requests", "verdict": "agree" },
  "effect": "contradicts",
  "why": "Every save would need the network."
}]
```

`effect` is one of `reopens` · `extends` · `contradicts` · `depends-on`. The quote carries the title
and verdict so the reader does not need the earlier file — and **only** those: never the earlier
reviewer's note, which may not be meant for this reviewer. `affects` is echoed into the feedback
response, so an answer is never read without knowing it changed something already agreed.

Agents misremember. Give the checker the earlier feedback and it proves the quote:

```bash
node bin/check.mjs history examples/decision-review.example.json examples/earlier-decisions.feedback.json
```

A misquoted title or verdict is an error. A quoted review with no earlier file given is a warning:
not wrong, just not verified.

### Every round in one page (#82)

A follow-up review can carry the rounds before it, so the reviewer reads one continuing document
instead of an unrelated new review. On each carried item, the agent says in **`reply`** what it did with
the reviewer's earlier answer, in its own words; `reply` answers something the reviewer said, so it is
refused on a new question. The renderer takes each earlier round as its review and its feedback,
oldest first, and writes nothing unless the whole chain checks out:

```bash
node bin/render.mjs examples/checkout-round2.review.json out.html --earlier examples/review.example.json examples/checkout-uat.feedback.json
node bin/check.mjs rounds examples/checkout-round2.review.json examples/review.example.json examples/checkout-uat.feedback.json
```

Each round after the first names the one before in **`continues`** (its id), so a missing, reordered
or wrong round is refused. `check rounds` checks every earlier round as a pair, every next round
with `followup` and `history` against the one before, the `continues` links, that no two rounds
share an id, and that every `reply` answers something. A **flow** review that continues another may
carry only the steps still open: on its own, a screen it no longer reaches is a warning, and `check
rounds` requires every screen to be reached by a step of this round or a round before. The map then
keeps the steps settled earlier, marked answered. In the same way a diagram may keep a box whose `step`
is a part answered in a round before (a warning on its own; `check rounds` refuses one no round asked),
and the page marks it answered.

**Two answers files for one round** (the page went to two people, or was answered twice) are compared
with `check copies <review> <feedback>...`: the same answers are one answer, counted once; different
answers are refused (`copies agree`), each difference named with who answered what. They are never
merged, and the agent never picks one: the person who asked for the review names the answer of
record, which is the one the next round continues, and the next round asks each difference again. A
round given twice to the renderer is refused, so history is never doubled. The
page carries the rounds in one line of its script, `const HISTORY = {…};`, a closed envelope
([`schemas/history.v1.schema.json`](schemas/history.v1.schema.json)): `{ protocol, schemaVersion,
rounds: [{ review, feedback }] }`, each snapshot the review.v1 and feedback.v1 exactly as they were,
escaped like `REVIEW` and `SEED` (#78). At most 20 rounds and 16 MB; more is refused, never cut.

What became of each question is derived from those files, never invented: **New** (not in the round
before), **You added** (the reviewer raised it), **Still open** (left unanswered), **Changed after your
note** (answered, and the question changed since), **Asked again** (answered, the same question again).
A positive answer the next round no longer carries is **settled**. Each question shows what the
reviewer said and the agent's reply; **History** lists every round with its answers, notes and
replies; Let me explain opens with "Since last time"; the Markdown report carries it all. Earlier
answers are shown, never counted as answers to this round. The history is unsigned: it says what
the files say, not who answered or when.

## Flows

A review can walk someone through a user flow: an app idea, or a change to an existing app. It stays
a normal review: **each step is an item**, so verdicts, notes, unanswered items and gaps work as
everywhere else. Worked example: `examples/flow-booking.review.json`.

**Screens** live in `flow.screens`, drawn from wireframe blocks or one inline screenshot with
clickable `hotspots` (percent of the image; PNG, JPEG or WebP only, no SVG, no URL). `flow.start` is
where the reviewer begins. A screen with no way out must say `"end": true`. Each hotspot is where a step
starts (the step's `on`): the page draws it on the screenshot, visible without hover and at least 44 px
on a touch screen, and tapping it opens that step. Worked example: `examples/password-reset.review.json`.

**A step** is an item with a `step`. Its **title is the cause** ("Taps Book 10:00") and its `goal`
is the reason ("to secure the Saturday slot"). `from` and `on` say which screen and which button,
input or hotspot. Each **outcome** has an `effect`, a destination `to`, and when there are several a
`label` the reviewer picks. **Nothing is computed**: branches are shown, never run. An outcome that
does not end the flow says `because` (why it happened) and `canNow` (what the person can do next).

**Parts.** A long process can be split into nested parts (sub-processes) in `flow.parts`, each
with an `id`, a `title` and an optional `parent`. When parts exist, every step names its `part`, and
the reviewer always sees where they are: *Booking › Book a slot*.

**Screen components.** Screens are drawn from 28 generic component types. Anything interactive
has an `id`, and a step's `on` may point at any id on its screen, including ids inside a component
(a card's action, a dialog's button). Components are our own drawings: nothing is copied from any
design system.

| group | types | the checker refuses |
|---|---|---|
| basics | `heading` `text` `input` `button` `list` | an empty list |
| getting around | `header` `tab-bar` `tabs` `side-menu` `breadcrumb` | a tab bar outside 2–5 items; an active tab or menu item that isn't one of its items; a breadcrumb under 2 levels |
| giving input | `checkbox` `radio-group` `switch` `select` `date-time` `search` `stepper` `slider` | a choice with too few options; a selection that isn't an option; a date-time not in UTC (`2026-10-03T08:00:00Z`), a date not `YYYY-MM-DD`, a time not `HH:MM`; a value outside min–max |
| showing things | `card` `chip` `image` `table` `avatar` | a table row that doesn't fill every column |
| telling the person what happened | `dialog` `toast` `banner` `empty-state` `progress` | a dialog with no way out; progress outside 0–100 |

Ids are unique per screen, nested ones included. **Warnings:** a caution or negative `banner`
without `canNow`, and an `empty-state` without an `action`: both leave the person without a next
step. `image` is a placeholder with `alt` and `caption`, never a real picture; `avatar` shows
initials, never a photo.

**What is there and what is missing.** Parts and steps may carry a `status`: `exists` (in the
product today), `proposed` (designed, not built; the default) or `suggested` (nobody asked for it;
the agent thinks it is missing). A `basis` says where the claim comes from: `code` with a `ref` the
checker proves, `prd` or `docs` with a `ref`, or `conversation` or `assumption` with a `note`.
Anything marked `exists` needs a basis, and a `suggested` step can't point at existing code.

**Behind each outcome**, optional layers show what happens:

| layer | entry | example |
|---|---|---|
| `system` | `kind` component · external · guard, `name`, `status`, `ref` | `guard` "Slot still has capacity" · exists · `src/booking.mjs:4` |
| `data` | `entity`, `change` insert · update · delete, `fields` before → after, `status`, `ref` | `bookings` insert: status — → confirmed |

Every entry has a short `id`, unique within its step. `status` is `proposed` (the agent's design) or
`exists` (what the code does today); **`exists` needs a `ref`**. `flow.layers.default` says which
layers a reviewer sees first; the fallback is `ui` and `flow`, and every layer can always be turned on.

**Feedback** keeps one required verdict per step. A reviewer may also judge a single layer entry;
that arrives in `layerVerdicts` with the id `<stepId>/<entryId>` and the entry's text echoed. A
negative one is a gap. **Nothing about how the reviewer clicked through is recorded or exported.**

The checker proves a flow before anyone sees it:

| check | refuses |
|---|---|
| `flow resolves` | a start, step or destination that points at nothing; a step without outcomes; several outcomes without labels |
| `flow has no orphans or dead ends` | a screen nobody can reach, or one with no way out that is not marked `end` |
| `claims have a basis` | `exists` without a basis; a `code`, `prd` or `docs` basis without a ref; a `conversation` or `assumption` basis without a note |
| `suggestions stay suggestions` | a `suggested` step with an entry marked `exists` |
| `flow parts resolve` | a repeated part id, a missing parent, parts nesting in a loop, an empty part, a step without a part or with an unknown one |
| `screens are safe to show` | a non-inline or SVG image, a hotspot not inside the image or with no image, an unknown block type or layer |
| `every area leads to a step` | a hotspot no step starts from (a warning in a round that `continues` another) |
| `components are consistent` | a repeated id on a screen, or any component rule in the table above |
| `layer entries honest` | an entry without an id, a repeated id, `exists` without a `ref`, a `ref` that is not `path:line` |
| `references resolve` (with `--root`) | a `ref` to a missing file or a line past its end, or one that leaves the project folder |
| `flow explains itself` (warning) | a step without `goal`, an outcome that leaves the person without `canNow` |
| `layer verdicts echo the review` (pair) | a layer verdict whose text differs from the entry it claims to judge |

## Diagrams

A review can carry **flow charts** in `diagrams`. Every page draws them, not only a flow page: on a
list page the chart sits above the list, and a box with `step` naming an item opens that item (#47).
A picture is always drawn this way. A section `diagram` of kind `mermaid` is refused by the checker
(`pictures are drawn`): the page loads nothing, so Mermaid would reach the reviewer as source text. One more is computed for every flow and never
written by hand, so it can't disagree with it: **the user flow** (screens, and the steps between
them). The parts of the process are not a chart: they become the parts of the tour's progress bar (D070). The user flow opens on a `start` and closes on a single `end`: every
screen marked `end`, and every screen no step leaves, leads into it, so a reader can see where each
journey stops. The end stands alone in the last column, as the start does in the first (D077).

Four kinds of chart, each with its own boxes and its own rules (#32):

- **`flowchart`** — what happens, in order. It needs a start and an end, every box must be reachable,
  and a decision needs at least two labelled ways out.
- **`database`** — tables with their columns, key and example rows, connected by column-specific
  many-to-one relationships. See the database contract below (#69, part 3).
- **`sequence`** — who calls whom, in the order the messages are written. Participants stand in a
  row with their lifelines; each edge is one message, drawn one row further down, and a `return` is
  the answer to an earlier call. Every message must say what it is, and every participant must take
  part in one. Its boxes: `client`, `service`, `component`, `queue`, `data-store`, `external`, `note`.
- **`system`** — what runs and what it talks to. It has no start and no end. Its rule instead:
  **nothing floats** — every box is on at least one arrow — and a check (`guard`) sits on a path,
  with something reaching it and something leaving it. Its boxes are `client` (what a person uses),
  `service`, `component`, `guard`, `queue`, `data-store`, `external` (someone else's system), plus
  `note`, `group`, `connector` and `off-page`. A flow-chart box in a system diagram is refused, and
  the other way round.

A written chart has `lanes` (who does what), `nodes` and `edges`:

- **Node kinds** — start and end: `start` `end` `end-failed` `entry` `exit` · steps: `process`
  `user-action` `system-action` `manual` `subflow` · screens and output: `screen` `input` `output`
  `document` `notification` · decisions: `decision` `parallel-start` `parallel-join` `merge`
  `event-choice` · time: `wait` `timer` `deadline` `schedule` · errors: `error` `retry` `compensate`
  `escalate` `cancel` · messages: `send` `receive` `signal` `callback` · data: `data` `data-store` ·
  structure: `group` `connector` `off-page` `note` `loop`.
- **Edge kinds** — `sequence` (default) · `conditional` (with a label) · `default` · `message`
  (between lanes) · `async` (sent now, handled later: a queue, an event) · `return` (the answer to a call, in a
  sequence) · `association` (a note to what it explains).
- **Icons** — our own: `envelope` `phone` `lock` `clock` `warning` `person` `database` `cloud` `gear`
  `card` `calendar` `bell` `document` `search` `check` `cross` `chat` `cart` `key` `globe`.
- **Links** — a node's `step` or `part` ties it to the flow: selecting either highlights the other.
  A node may show a screen `component` inside it.

**Layout is automatic:** columns by distance from the start, one row band per lane, loops routed
underneath, and arrows only in the space between boxes. If a chart comes out awkward, pin a node with
`col` (and `row` within its lane).

| check | refuses |
|---|---|
| `diagrams resolve` | a repeated id; an arrow, lane, step, part or subflow that points at nothing; an unknown kind or icon |
| `diagrams make sense` | no start or no end; a box nobody can reach; arrows into a start or out of an end; a decision with fewer than two ways out or an unlabelled one; a parallel start or join with too few paths; a message inside one lane |
| `diagram pins don't collide` | two pinned boxes in the same place |
| `pictures are drawn` | a section `diagram` (Mermaid), which the offline page can only show as text |

### Database diagram contract (#69 / #32 part 3)

Start from `examples/database-booking.review.json`. A database diagram uses the same `id`, `title`,
`nodes` and `edges` as the other diagrams; it does not take lanes, pins, icons or flow boxes.
Tables are stacked in reading order, with scrollable relationships beside them, so phone text and
targets keep their size. No connection to a database is made.

- Each table node has `id`, `kind: "table"`, `label`, `columns`, optional `step`, and optional
  `sampleRows`. A table may stand alone. `step` links to a review item (a step item in flow mode).
- Each column has `id`, `label` (the name), `type` (plain words), and a boolean `key`. Exactly one
  declared column has `key: true`; the page marks it **Key**. Composite keys are not supported.
- Each edge has `from`, `fromColumn`, `to`, `toColumn`, `cardinality: "many-to-one"` and an optional
  `label`. The `from` column is the child/many side; `toColumn` must be the parent table's key.
  The child column may also be a key. These are declared relationships, not inferred constraints;
  nullability, uniqueness, SQL types and referential integrity of sample values are not inferred.
  The page draws **Many** and **One** at the corresponding ends without needing a legend.
- Repeated mappings `(from, fromColumn, to, toColumn, cardinality)` are refused. Different column
  mappings between the same tables are allowed. Comments and proposals use the edge's original
  zero-based `nth` position to distinguish them; an ambiguous target without `nth` is refused.
- Each sample row supplies exactly the declared column ids, once each, with scalar JSON values
  (text, finite number, boolean, null). A missing cell is written as null. Every row is drawn under
  **Example data** and **Example row** labels. Use invented data only. A plain-word `type` is a
  description, not a runtime type expression or executable SQL.

Limits: 1–30 tables per diagram, 1–30 columns per table, 0–10 sample rows per table, 0–160 edges,
500 characters per string cell. Labels and types must be trimmed and nonblank; table/title labels
allow 160 characters, column names/types and edge labels 80. Ids use the existing id grammar.
The schema fixes the closed shape; `diagrams resolve` refuses duplicate ids, unknown columns/tables,
missing/multiple keys, a parent endpoint that is not a key, malformed rows, and these size limits.

The reviewer can mark a table on the map and say what about it (a comment). Proposed changes, from
files made by earlier pages or agents, are applied to a copy and checked by the same database
rules; the generic add-box and add-arrow payloads cannot carry columns and key mappings, so the
checker refuses those operations. Follow-up reviews answer comments and proposals as usual.

### AI elements and explainers (#70 / #32 part 4)

Flowchart and system diagrams can use `model-call`, `tool-call`, `retrieval`, `guardrail` and
`human-handoff`. Each has a trimmed, nonblank `label` (at most 160 characters), an original icon
and a visible kind caption. Their `step` links, comments and proposals work like other boxes.
Sequence and database diagrams do not accept these kinds.

An AI flowchart must declare `agent: true`; only flowcharts accept this flag, and false is not a
second mode. It remains on proposed copies even if all AI boxes are removed. Marked graphs allow
at most 80 nodes and 160 edges. Existing start, reachability and labelled-decision rules still apply.

Every `end`, `end-failed`, `exit` and `human-handoff` in an agent flow has a closed
`stop: {"reason": "Why it stops", "next": "What happens next"}` object. Both strings are trimmed,
nonblank and at most 300 characters; the page draws them in full as **Why** and **Next**.
Other nodes and unmarked diagrams cannot carry stop metadata. Ends/exits have no outgoing control
arrows. A human handoff can stop or continue, but always explains why control passes to a person.
Every non-annotation terminal is one of these stops. Every reachable control node must have a path
to a terminal stop: a closed loop, association or annotation is not an exit. This checks the drawn
explanation, not runtime termination; guardrails add no new branching semantics.

Optional `tokenUsage` on flowchart/system diagrams is a small horizontal bar chart:

```json
{"basis": "estimated", "total": 1400, "parts": [
  {"id": "input", "label": "Input tokens", "tokens": 1000},
  {"id": "output", "label": "Output tokens", "tokens": 400}
]}
```

`basis` is `estimated` or `reported`. Both are author-supplied, not verified provider measurements
or billing. There are 1–30 disjoint parts, with unique protocol ids and trimmed nonblank labels
of at most 80 characters. Counts and total are integers from 0 to 1,000,000,000; zero is valid.
The checker requires exact addition. All objects are closed: no extra fields, numeric strings,
fractions or duplicated subtotals. Arithmetic does not prove completeness or provenance. The chart
shows its basis, complete labels, exact counts and total; use an ordinary review item to ask about
the assumptions. The summary itself is not a new editable feedback target.

Agent rename/removal/add-arrow/edge-relabel proposals use the existing format and are rechecked
against the same rules. The generic add-box operation would create an unexplained terminal, so it
is refused for agent flows; a desired insertion is described in a comment for the next review. A terminal human handoff satisfies an agent
flow's ending requirement.

Reusable understanding reviews, all synthetic and fully offline:

| Start from | What it explains |
|---|---|
| `examples/retry-backoff.review.json` | At most four attempts, with 1/2/4-second waits and explicit success/failure |
| `examples/booking-race.review.json` | Two contenders, one atomic claim winner, and a clear next step for the other person |
| `examples/ai-tool-loop.review.json` | Five AI kinds, a two-call tool budget, explained endings and an estimated token chart |

Each has a generated HTML page and item links. Copy a review with a new id and adapt its assumptions;
these are drawings, not a retry engine, reservation implementation or live AI integration.

## What making it used

A review may say what making it used (#84): `usage`, written by `bin/usage.mjs`, never by hand. In
Claude Code it reads the log of the conversation that ran it: of the session's logs (found by
`CLAUDE_CODE_SESSION_ID`), the main one or one sub-agent's, the one that holds this very command. A
sub-agent sees the main conversation's session id, so the id alone would count the wrong calls; if no
log or more than one holds the command, it is unavailable. It adds up what the model API reported for
each call since `source.since`, each call once, by its finished entry (a call can be logged while it
streams): `input`,
`output`, `cacheRead` and `cacheWrite` tokens, kept apart. It copies numbers and model names, never a
prompt or an answer. `status` is `measured`, or `partial` with the `reason` (work handed to sub-agents,
unreadable lines, a call counted two ways), or `unavailable` with the `reason` (no session log, nothing
in it to count). A zero is only a zero the log reports; nothing is ever estimated, and no price is
shown: the page says "Cost: not measured". The numbers are what the host reported, not an audited or
verified bill, and the page says that too. The checker refuses numbers on an unavailable record, a
partial one without its reason, any other method, and a count that ends before it starts or in the
future (`usage is honest`).

## No secrets

Reviews get emailed and forwarded. The checker refuses **any** review containing something shaped
like an access key, API token, private key, JWT or credentials in a URL. Use a placeholder such as
`<API_KEY>`. Inline image data is not scanned for secrets; what a picture shows is checked by no tool, so use
sample data. What it hides is handled: each screenshot is read by its own bytes and refused if it is
not the type it says, over 2 MB or over 4096 px on a side; EXIF, XMP, IPTC, comments and text chunks
are named in a warning (`pictures carry hidden details`) and left out of the page by `render.mjs`.

## Messages

Every checker error and warning says **what is wrong, what to do, and what leaving it would cause**,
in one line. A message that only names the problem is a bug.

## Comments on a diagram

The reviewer can answer in the agent's own picture, not only in words (#60). After a critical answer,
**Mark it on the map**, then a tap on a box (or Tab to it and Enter), opens a comment on that part:
"What about this part?". Comments on arrows come from files made by earlier pages and read the
same. The feedback carries each one:

```json
"comments": [{ "id": "comment-1", "diagram": "checkout-path", "node": "pay",
               "label": "Takes the payment", "note": "Say which card is charged." },
             { "id": "comment-2", "diagram": "checkout-path", "edge": { "from": "result", "to": "declined" },
               "label": "What happens? → Says why the card was declined (declined)", "note": "Keep the cart." }]
```

`label` says what the comment is on, in words, so the file reads without the review. When the same
two boxes are joined more than once — a sequence asks the same service twice — the edge carries
`nth`, its place in the diagram's own list of arrows, so the comment lands on that message and no
other. `diagram` is a
diagram id, or `user-flow` for the chart computed from a flow. An empty comment is left out.

| check | refuses |
|---|---|
| `comments well-formed` | a comment without its own `comment-N` id, without exactly one `node` or `edge`, or without a label or words |
| `comments resolve` | a comment on a diagram, box or arrow the review does not have, or whose label is not that part's |
| `comments answered` (`followup`) | a follow-up review with no item whose `answers` lists the comment's id |

### Proposed changes

A change to the picture (#60) travels as a proposal: on a box, rename it, remove it, add a box after
it, or add an arrow to another box; on an arrow, relabel it or remove it. The page of #74 no longer
offers these; files from earlier pages and agents still carry them, with the reviewer's words from
the comment on the same part:

```json
"proposals": [{ "id": "proposal-1", "diagram": "checkout-path", "op": "rename", "node": "pay",
                "label": "Takes the payment", "text": "Charges the card", "why": "Say what is charged." }]
```

`op` is one of `rename`, `remove-node`, `add-node`, `add-edge`, `remove-edge`, `relabel-edge`. The
checker applies every proposal to a **copy** of the diagram and judges the result with the same rules
as any diagram, so a set of changes that would leave a box unreachable, a start with arrows in, or a
decision with one way out is refused rather than drawn. The page shows the same copy under **Show my
changes**. The agent's own diagram is never altered by the file; the next round draws the change, or
says why not.

**What became of a proposal** (#87). The item in the next review that answers a proposal can say what
it shows, instead of just listing the id:

```json
"answers": [{ "review": "checkout-uat-2026-09", "id": "proposal-2", "outcome": "not-drawn",
              "why": "The amount is already on the button." }]
```

`outcome` is one of `drawn`, `drawn-differently`, `not-drawn` or `question`, and `why` is required
unless it is `drawn` (for a question, `why` is the question). The outcome says what the next review
shows, never that the agent agreed, built or may do anything. `review` names the review the
proposal came from, so an id is never matched on its own. A plain id (`"proposal-2"`) is still valid
and says only that the item answers it. The reviewer disagrees the usual way, by answering that item:
a disagreement is a gap and is carried (#88). The earlier outcome is never rewritten.

| check | refuses |
|---|---|
| `proposals well-formed` | a proposal without its own `proposal-N` id, without a known `op`, or without the part it is on in words |
| `proposals fit the diagram` | a change on a part that is not there, one that cannot be applied, or a result that breaks the diagram's own rules |
| `proposals answered` (`followup`) | a follow-up review with no item whose `answers` lists the proposal's id |
| `answers well-formed` (`review`) | an `answers` entry that is no comment or proposal id, or an outcome that is not one of the four, is said of a comment, names no review, or has no `why` when not drawn |
| `proposal outcomes true` (`followup`) | `drawn` when the next diagram lacks the change, `not-drawn` when it has it, an outcome naming another review or an unknown proposal, or two different outcomes for one proposal |

### Pictures

The reviewer can attach a picture (a screenshot, a photo of a sketch) to an item's note or to a
comment. The page redraws it at most 1600 px wide and saves it again as WebP (JPEG where the browser
cannot write WebP): hidden details such as a photo's location are gone, and the size stays small.

```json
"pictures": [{ "id": "picture-1", "on": "declined-card", "onTitle": "A declined card explains itself",
               "type": "image/webp", "width": 1280, "height": 640, "data": "UklGR…" }]
```

`on` is the item, added item or comment it belongs to; `onTitle` echoes it. `bin/pictures.mjs
<feedback.json>` writes them out as files to look at. On a flow step the reviewer can also use their own
screenshot for the screen (#33): that picture carries `screen`, the screen it shows, and replaces the
one before it. Use it as that screen's `image` in the next round, with its hotspots.

| check | refuses |
|---|---|
| `pictures are pictures` | a picture that is not really PNG, JPEG or WebP (judged by its own first bytes, not by its name), one attached to nothing in the file, a `screen` the review does not have, one over 1 MB, more than 10, or more than 5 MB together |

## Answers given in chat

For one to four quick questions a page is too much, but a decision others will rely on still needs a
record (#53). The agent writes the questions as a small review, asks them in its chat, reads the
answers back one line per question, and the person confirms or corrects them. Only then does
`bin/answer.mjs <review.json> <answers.json>` write the feedback, with the same builder the page uses,
marked `"via": "chat"`. It checks the result with `check pair` and writes nothing that fails. What the person did not answer is left out of the
answers file and arrives as `unset`, a gap: never agreement.

## Checking

```bash
node bin/check.mjs review   examples/review.example.json
node bin/check.mjs feedback examples/feedback.example.json examples/review.example.json
node bin/check.mjs pair     examples/review.example.json examples/feedback.example.json
node bin/check.mjs history  <review.json> <earlier-feedback.json>...
node bin/check.mjs followup <next-review.json> <review.json> <feedback.json>
node bin/check.mjs review   examples/flow-booking.review.json --root .   # a flow, with every file:line proven
```

**The schema first** (`matches the schema`). Every review and every answers file is held to
`schemas/review.v1.schema.json` or `schemas/feedback.v1.schema.json` by the checker itself, with no
dependency: a field the protocol does not have, a missing one, a value of the wrong kind or out of
its list is refused, each named with where it is. A field the page does not know would otherwise be
ignored in silence, and what the agent meant would never reach the reviewer.

**The next round drops nothing** (`followup`, #52). A follow-up review must carry everything the
reviewer left open: every gap, every item they added, every request, and every answer that settles
nothing — a verdict whose tone is `caution` or `neutral`, such as "Partially works", "Couldn't test it"
or "Revisit" (#88, `open answers carried`; the tones come from the agent's own review). An earlier
item is carried by an item with the same id, or by one whose `affects` quotes it.

**Putting something off** (#88) needs no status of its own. The reviewer leaves the item unanswered
and says why in its note: it stays `unset`, a gap, with their reason, and is carried like any gap. A
review's own vocabulary can offer the same thing ("Revisit", "Couldn't test it"), and those answers
are carried too. Neither is ever agreement or permission. An `example` request is answered by that
item's `examples`, and an `explain` request by a `summary` or `body` that says it differently. The next
review needs its own id. There is no status field: the files already hold the state, and a second copy
could disagree with them.

**One id, one answer** (#77). Inside one feedback file, every response, added item and comment has its
own id. An added item carried into the next round keeps its `added-` id as a review item, so the page
gives a new added item or comment the first free number: it counts the review's items, the added
items, the comments and the ids a proposed change still points at. The checker's `answer ids unique`
refuses a file where two answers share an id, in `feedback`, `pair`, `followup` and `history` (for
each earlier file). A gap, a picture or a later review names what it means by id alone, so such a
file could mean either answer. Pages made before #77 could write one. To recover:

1. Keep the original review, the returned file and, if you have it, the page's saved copy. Change none of them.
2. List each shared id with its titles, in every place it occurs: responses, added items, comments, gaps, pictures.
3. Ask the reviewer which answer each gap and picture belongs to. Never take the first match.
4. In a copy, give one answer a new id and update every reference to it. If the reviewer cannot say, stop.
5. Run the checker on the copy. A pass shows the file is consistent, not that the association is what they meant.

The checker prints every check it ran; the number depends on what the files use (a review with a
choose-one section gets its choices checked). Exit `0` only at zero errors; warnings never fail a
run. The checker has no dependencies on purpose — a protocol checker
that needs an install is a protocol fewer people run.

Use it with any standard JSON Schema validator: the schemas pin the **shape**, the checker pins what
a schema cannot express — unique ids, verdicts drawn from the declared set, complete coverage,
honest derived fields.

## The reference renderer

```bash
node bin/render.mjs examples/review.example.json out.html
```

One self-contained page that fetches nothing — a URL appears only as a source the reviewer may
choose to click — light or dark as the system is, answers as real radio groups so keyboard support
is not bolted on. Answers autosave to `localStorage`, and the last step, **Return**, downloads a file
that passes `bin/check.mjs`.

It inlines `lib/build-feedback.mjs` **verbatim**, so the page and the test suite run one
implementation of the export shape — it cannot drift from what the checker expects without both
failing at once.

The page is the approved design of #74, the same for every kind of review: a flow, a list, a choice,
doubts, an approval, an explanation, or a diagram.

**Let me explain** comes first, on its own screen (#105): short numbered cards, each with a symbol and
one sentence (what the agent needs decided or explains, its recommendation, what it will ask,
precedents, the risks, how to answer, what happens next), the rest of each behind "More", never
dropped, and one action: **Start**. After Start it folds to one bar that opens it again. The cards are written into the page itself, so a phone's file preview, which runs no script, still
shows them, with a note that answering needs a browser; an answered page there also shows every
question, answer and note as plain text.

**The tour**, one question at a time, then **Return**. **Back** and **Next** are always visible with
"Step N of M"; an unanswered question can be skipped ("Skip for now") and stays open. A **progress
bar** runs from Let me explain to Return through coloured parts: the review's sections, a flow's
journeys, or one part; each fills as it is answered, and a tap jumps there. A choose-one section is
one question, its options the answers.

**Every question has the same layout.** On the left: the part and position ("Book a slot · 2 of 3"),
the question, a status (in the app, planned, a suggestion, your call, a risk), why it is asked, what
was decided earlier (`affects`), and the answer as big tiles, each with a symbol, in the review's own
words and tones (approve or decline for an approval). After an answer come the note ("What should be
different?" after a critical answer, "Anything to add?" otherwise), **Add a picture**, **Mark it on the
map**, and asking back with **Show me an example** and **Explain it differently**, which travel back as
`requests` and are read when the file reaches the agent. On the right, **four places, always in this
order**, each with a number, a symbol and a − button that folds it to its title:

1. **Map**: the diagram the question is on (every kind: flowchart, system, sequence, database, AI),
   its box marked "you are here", answered steps marked "answered". The review's other diagrams are
   tabs beside it, to look at in place; the next question opens on its own diagram again. It zooms
   in place (−, +, Fit), as well as in the expanded view.
2. **Prototype**: a flow step's screen as the app will show it, in a phone frame: the app bar, the
   body drawn by `lib/draw-components.mjs` (inlined verbatim), the buttons at the bottom with the main
   one first, a dialog as a bottom sheet, and the part the step taps marked. An approval shows a dry
   run: its exact action, preview, scope and risk.
3. **What should happen**: ✓ / ✗ / ⓘ rows — a step's outcomes (with why, what the person can do now,
   and where it leads), an approval's action, scope and risk, an item's fields, precedents with their
   source or marked unverified, a choice's options.
4. **How I'd build it**: what runs and what changes under each outcome, with status and reference;
   an approval's preview and how long a yes counts; a file reference; a choice's option cards, each
   with what it assumes and risks, the recommended one marked.

A place with nothing for this question keeps its spot and says so. **Prototype only** folds the other
three; **Show all** opens them again. **Expand** opens the map (with zoom), every screen in order (the
current one marked) and every other diagram of the review. On a phone the tour fits one screen: the
places are tabs (Map, Screen, Should happen, Build), and the note and "Why I ask" open as sheets.

**Overview** is the one switch away from the tour: the same review on one page, every question
answerable in place, each with "Show the prototype and what should happen", the whole map, and Return
at the end. Where you are and which view stay in memory or in the reviewer's own browser, and never
leave it.

**Return** lists every question with its answer or "Stays open", takes **Something missing? Add it**
(D072), and holds the downloads. Each can be previewed and copied first, and each holds everything:
**HTML**, this page with the answers written into it (D076), so whoever opens it sees everything, not a
summary; **MD**, a readable report (every answer, note, request, mark and picture count, what is still
open, what was added, what needs attention); **JSON**, the feedback file for the agent. An answered
page keeps its own answers in the browser, apart from the original's. Downloading sends nothing: the
reviewer returns the file themselves. A partial review is allowed; nothing unanswered is ever treated
as agreement. Storage-failure warnings stay visible.

**Save to a file** (#83), where the browser allows it (Chrome and Edge on a computer; elsewhere the page
says so and offers Download, never switching on its own). The reviewer chooses one file; the page asks
for no more than that file and keeps the choice in the open tab only, never in the answers or the
export. Before it replaces anything, the file must be empty or a page of this same review; a file that
holds other answers, or changed since this page last saved it, is replaced only when the reviewer says
so, or saved as a new file. The browser writes the new file whole before it replaces the old one, so a
failed or cancelled save leaves the file and the answers as they were; "Saved" is shown only after the
write has finished. Kept in the browser, saved to a file and sent back are three different things, and
the page says which one happened. On the agent's side nothing is replaced either: `render.mjs` writes
only the path it is given, and `answer.mjs` refuses to overwrite an existing file.

**Reading an answered page** (#78). The page holds the review and the answers each on one line of its
script, as JSON: `const REVIEW = {…};` and `const SEED = {…};` (the answers as the page keeps them, plus
`exportedAt`). Both are written with `<`, U+2028 and U+2029 escaped, so neither can close the script
or end its line early. `bin/answer.mjs <review.json> <answered.html> [feedback.json]` reads exactly one
of each line with `JSON.parse` and never runs, loads or fetches anything in the page. It refuses
when the embedded review is not the agent's own review exactly (a changed review would put answers on
changed questions), when the page has no answers, or when a line is missing, repeated or not JSON. The
answers then go through the same builder as the page's own export (`respondedAt` = `exportedAt`,
`"via": "page"`), and `check pair` must pass before the file is written; an existing file is never
overwritten. Input over 32 MB is refused. The `.json` export and the page give the same feedback. The
file is unsigned either way: a matching review proves nothing about who answered. Pages exported
before #78 read the same way, unless a note held U+2028 or U+2029; those are refused, never guessed.

Where the reviewer clicks lives in memory only. A reload starts at the beginning, and nothing about
the path taken is saved or exported. It works with the keyboard alone, and every tap target is at
least 44 px.

Browser checks for both pages are in `checks/browser/`. They are a local check, run with an
installed Chrome, and skip without it:

```bash
node checks/browser/list-page.check.mjs
node checks/browser/flow-page.check.mjs
```

Pictures are drawn by the page's own code, never by Mermaid: a CDN script would break "offline", and
inlining Mermaid would add roughly 2 MB to every page. A section `diagram` stays in the v1 schema so
old files still parse, but the checker refuses it (#47).

## Extending it

- **Adding an optional field** is a v1 change. Both schemas set `additionalProperties: false`, so
  add it to the schema in the same commit or files carrying it will fail validation.
- **Removing or repurposing a field**, or changing what an existing value means, is v2. Bump
  `schemaVersion`, keep a reader for v1, and ship a migration — do not silently reinterpret.
- **A new renderer** needs no permission and no change here. That is the point.
- **`tone` stays semantic.** The moment it carries a hex value, one renderer's palette becomes
  everyone's problem.

## Status

Draft. The schemas, the checker and the worked examples are real and run; nothing has been published
under a URL yet, so treat `$id` as intent rather than a resolvable address.
