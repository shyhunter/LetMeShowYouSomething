# LetMeShowYouSomething — the protocol

**v1 · draft**

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

## Flows

A review can walk someone through a user flow: an app idea, or a change to an existing app. It stays
a normal review: **each step is an item**, so verdicts, notes, unanswered items and gaps work as
everywhere else. Worked example: `examples/flow-booking.review.json`.

**Screens** live in `flow.screens`, drawn from wireframe blocks or one inline screenshot with
clickable `hotspots` (percent of the image; PNG, JPEG or WebP only, no SVG, no URL). `flow.start` is
where the reviewer begins. A screen with no way out must say `"end": true`.

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
| `screens are safe to show` | a non-inline or SVG image, a hotspot outside the image, an unknown block type or layer |
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
them). The parts of the process are not a chart: they are the sub-processes column beside it (D070). The user flow opens on a `start` and closes on a single `end`: every
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

The reviewer can comment on tables/relationships and propose a rename, removal or edge relabel.
Proposals are applied to a copy and checked by the same database rules. The generic add-box and
add-arrow payloads cannot carry columns and key mappings, so the page asks for those additions in
a comment and the checker refuses those operations. Follow-up reviews must answer these comments
and proposals as usual. Existing diagram kinds retain their editing controls.

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
is hidden and refused for agent flows; describe the desired insertion in a comment for the next
review. Other diagram kinds retain their controls. A terminal human handoff satisfies an agent
flow's ending requirement.

Reusable understanding reviews, all synthetic and fully offline:

| Start from | What it explains |
|---|---|
| `examples/retry-backoff.review.json` | At most four attempts, with 1/2/4-second waits and explicit success/failure |
| `examples/booking-race.review.json` | Two contenders, one atomic claim winner, and a clear next step for the other person |
| `examples/ai-tool-loop.review.json` | Five AI kinds, a two-call tool budget, explained endings and an estimated token chart |

Each has a generated HTML page and item links. Copy a review with a new id and adapt its assumptions;
these are drawings, not a retry engine, reservation implementation or live AI integration.

## No secrets

Reviews get emailed and forwarded. The checker refuses **any** review containing something shaped
like an access key, API token, private key, JWT or credentials in a URL. Use a placeholder such as
`<API_KEY>`. Inline image data is not scanned.

## Messages

Every checker error and warning says **what is wrong, what to do, and what leaving it would cause**,
in one line. A message that only names the problem is a bug.

## Comments on a diagram

The reviewer can answer in the agent's own picture, not only in words (#60). With **Comment** switched
on, a click on a box or an arrow of a drawn diagram (or Tab to it and Enter) opens a comment on that
part. The feedback carries each one:

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

The reviewer can also change the picture (#60). On a box: rename it, remove it, add a box after it,
or add an arrow to another box. On an arrow: relabel it or remove it. Each change travels as a
proposal, with the reviewer's words from the comment on the same part:

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

| check | refuses |
|---|---|
| `proposals well-formed` | a proposal without its own `proposal-N` id, without a known `op`, or without the part it is on in words |
| `proposals fit the diagram` | a change on a part that is not there, one that cannot be applied, or a result that breaks the diagram's own rules |
| `proposals answered` (`followup`) | a follow-up review with no item whose `answers` lists the proposal's id |

### Pictures

The reviewer can attach a picture (a screenshot, a photo of a sketch) to an item's note or to a
comment. The page redraws it at most 1600 px wide and saves it again as WebP (JPEG where the browser
cannot write WebP): hidden details such as a photo's location are gone, and the size stays small.

```json
"pictures": [{ "id": "picture-1", "on": "declined-card", "onTitle": "A declined card explains itself",
               "type": "image/webp", "width": 1280, "height": 640, "data": "UklGR…" }]
```

`on` is the item, added item or comment it belongs to; `onTitle` echoes it. `bin/pictures.mjs
<feedback.json>` writes them out as files to look at.

| check | refuses |
|---|---|
| `pictures are pictures` | a picture that is not really PNG, JPEG or WebP (judged by its own first bytes, not by its name), one attached to nothing in the file, one over 1 MB, more than 10, or more than 5 MB together |

## Answers given in chat

For one to four quick questions a page is too much, but a decision others will rely on still needs a
record (#53). The agent writes the questions as a small review, asks them in its chat, reads the
answers back one line per question, and the person confirms or corrects them. Only then does
`bin/answer.mjs <review.json> <answers.json>` write the feedback, with the same builder the page uses,
marked `"via": "chat"`. It passes the same checker. What the person did not answer is left out of the
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

**The next round drops nothing** (`followup`, #52). A follow-up review must carry everything the
reviewer left open: every gap, every item they added, every request. An earlier item is carried by an
item with the same id, or by one whose `affects` quotes it. An `example` request is answered by that
item's `examples`, and an `explain` request by a `summary` or `body` that says it differently. The next
review needs its own id. There is no status field: the files already hold the state, and a second copy
could disagree with them.

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
choose to click — light, dark and a few styles to pick (D080), sections that can be pinned (D079) and minimised to their title bar (#61), verdicts as real radio groups
inside real fieldsets so keyboard support is not bolted on. Answers autosave to `localStorage`;
**Export feedback.json** writes a file that passes `bin/check.mjs`.

It inlines `lib/build-feedback.mjs` **verbatim**, so the page and the test suite run one
implementation of the export shape — it cannot drift from what the checker expects without both
failing at once.

**A review with a `flow` gets a player**, with the list of steps inside it:

- the **diagram**, full width, with the **screen** under it, also full width (D068);
- the **screen**, drawn from its components by `lib/draw-components.mjs` (also inlined verbatim).
  Only elements a step points at are buttons; everything else is a still wireframe;
- **What I need you to decide** (or **What this explains**, when the brief asks no `question`), full width, then **your feedback** under it (D074): the filters,
  then the steps on the left — one row each, answered or open, with a count of both on top — and the
  open step on the right: its goal, every outcome side by side, the verdict, the note, and "Show me an
  example" / "Explain this" as checkboxes. The two share the row in three steps (◧ ◫ ◨), remembered
  in this browser. Tapping on the screen, in the chart or on a row opens a step there;
- **Add your own feedback**, full width under both, open to anything, related or not (D072), with
  what you added listed below it.

**Everything appears once** (D064). There is one list of steps, not four: each card carries its
journey, its status, its goal and every outcome, and the filters above it — search, verdict, gaps
only, journey, status, "only where something goes wrong" — are the only way the list narrows.
Every diagram is a tab in the diagram panel, never a second gallery further down. Selecting a step
in the chart marks it in the list, and the other way round.

**Nothing is hidden silently.** Every filter says "Showing N of M" and offers "Show all".

**The diagram, then the screen under it** (D068), each the full width of the page. Above the diagram, **tabs** — the user flow, every
written chart, and System design, which says what it is for rather than standing
empty until the system diagrams land. The focus tab opens first. Under them, **a chip per
sub-process**: press one to mark its boxes, what leads into them lightly, the rest dimmed but still
there; press it again to clear.

Either panel opens **full screen** (the screen panel as a third tab beside This screen / All screens) and closes with Esc (D073). The walk-through as a whole collapses. All of that arrangement is remembered in the reviewer's own browser
and never leaves it.

Under the two panels, a review with a `brief` shows **what the agent needs decided** (D071, D074): the
question first, then what it is explaining, its recommendation, precedents (each with its source, or
marked unverified), and the risks; the reviewer's feedback follows under it. Inside the diagram panel, **sub-processes are a column that switches off** (D066), grouped
into what is in the product, what is planned and what is only suggested, each saying how much of it
is judged. The screen panel shows one screen or, at a press, **every screen at once** (D067). What the
brief points at is ringed in the chart, and the screen panel says "look here". Every item offers **Show me an example** and **Explain this** as checkboxes — the questions that
travel back as `requests`.

Answers leave as **Export feedback.json** for the agent, and **Export feedback.html** for a person
(D076): the whole page — every chart, screen, step and the brief — with the answers written into it,
so whoever opens it sees everything, not a summary. The answers sit in the page's script as JSON with
`<` escaped; an exported copy keeps its own answers in the browser, apart from the original's. The
agent still reads the `.json` file; the HTML is never a second source of truth.

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
