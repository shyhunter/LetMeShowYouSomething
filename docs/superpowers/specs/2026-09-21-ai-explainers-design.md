# AI elements and how-it-works explainers — #70 / #32 part 4

## Goal and approach

Explain AI-assisted processes using the existing offline diagrams, review items, comments,
proposals, and feedback loop. Extend the current diagram system rather than introduce a second
renderer or an AI execution system. The user has approved this direction; the detailed contract
below is proposed for review before implementation.

The six acceptance items in #70 are the scope. Database diagrams (#69) are already merged.
Flow editing (#66), screenshots (#33), visual redesign, launch, and publishing changes are not
part of this feature. The user alone merges PRs.

## 1. AI boxes and explicit agent-flow context

Add five node kinds: `model-call`, `tool-call`, `retrieval`, `guardrail`, and `human-handoff`.
Allow them in `flowchart` and `system` diagrams, not as database tables or sequence participants.
Each requires a trimmed, nonblank label of at most 160 characters. Draw a visible kind caption
and an appropriate original icon/outline, so meaning does not depend on colour or a legend.
Reuse existing lanes, arrows, node ids, item links through `step`, selection, and keyboard access.

A flowchart describing an agent carries `agent: true` at diagram level. This flag is allowed
only on flowcharts; omission leaves ordinary flowcharts unchanged. A flowchart containing any
of the five AI kinds must carry the flag. An explicitly marked agent flow may also use ordinary
process, decision, retry, timer, start, and end boxes. System diagrams containing AI boxes remain
architecture drawings and do not acquire start/stop semantics.

The marker remains on the diagram after proposals remove AI boxes, so removing a box cannot
silently turn off the stopping rules. Do not infer agent context from arbitrary label text.

## 2. Stops must explain why and what happens next

Within an agent flow, `end`, `end-failed`, `exit`, and `human-handoff` nodes require a closed
`stop` object with two required fields:

```json
{"reason": "The retry limit was reached.", "next": "A person reviews the failed request."}
```

Each field is trimmed, nonblank text of 1–300 characters. Other node kinds may not carry `stop`;
ordinary diagrams may not carry it without agent context. These are explanations, never executable
instructions. Render both fields in full, with visible Why/Next labels, not just a hover tooltip.

- An end/end-failed/exit node has no outgoing control-flow edge.
- A human hand-off always explains why control passes to a person and what that person can do.
  It may end this diagram or continue along an explicitly drawn path after the person acts.
- Every non-annotation terminal node must be an explained end or human hand-off. A model call,
  tool call, retrieval, or ordinary process cannot silently become a terminal box.
- Every reachable non-annotation node must have a graph path to a terminal stop. This rejects
  closed loops with no depicted exit; it does not claim to prove runtime termination.
- Existing start, reachability, decision-branch and endpoint checks still apply. An agent flow
  whose terminal stop is a human hand-off may use that hand-off to satisfy the ending requirement.
- Notes, groups, connectors, and off-page annotations retain their existing annotation treatment;
  they do not count as terminal stops or as evidence of an exit path.

No new branching restriction is imposed on a guardrail beyond existing graph rules: an explainer
can show one selected outcome or use an ordinary decision to show accepted and refused paths.

## 3. Token figures: arithmetic, not live measurement

Allow optional `tokenUsage` on flowchart/system diagrams. It is a closed object:

```json
{
  "basis": "estimated",
  "total": 1400,
  "parts": [
    {"id": "input", "label": "Input tokens", "tokens": 1000},
    {"id": "output", "label": "Output tokens", "tokens": 400}
  ]
}
```

- `basis` is required and is exactly `estimated` or `reported`. Both are author-supplied.
  The page must not call a reported count independently verified or measured by this tool.
- `parts` has 1–30 entries. Each has an id using the existing id grammar, a trimmed nonblank
  label of at most 80 characters, and `tokens`. Part ids are unique within this breakdown.
- All counts, including total, are nonnegative safe integers at most 1,000,000,000.
  The sum of the parts must equal total exactly. Zero is allowed and must render without division
  by zero. Fractions, negatives, numeric strings, unknown fields, missing basis, and mismatches
  are refused with a specific explanation and corrective action.
- Parts are a disjoint breakdown of the same total. Do not list a subtotal alongside the
  components already included in it. Document that the checker verifies shape and arithmetic,
  not the provenance, completeness, billing interpretation, or actual model use of these numbers.
- Draw a compact horizontal bar chart below the diagram, with a visible Estimated/Reported
  tokens heading, each label and exact count, and the total. The chart also exposes readable
  text for assistive technology. It uses the existing theme and no charting dependency.
- The chart is an explanatory summary, not a new editable feedback target. The worked review
  includes a normal item for judging the token assumptions; existing own-feedback/comments
  remain available. No feedback protocol changes are needed for token parts.

No tokenizers, provider SDKs, usage collection, pricing, API keys, live calls, or telemetry.

## 4. Ready-made explainers

Ship three self-contained, reusable review JSON files and their generated HTML pages, linked
from a short catalogue in PROTOCOL.md:

1. `retry-backoff.review.json`: a temporary failure, increasing example waits (1, 2, 4 seconds),
   a finite retry limit, success, and an explicit failure outcome. These are illustrative choices,
   not universal retry guidance; no automatic retrying takes place.
2. `booking-race.review.json`: two fictional people request the same last slot; an atomic
   claim/reservation permits one winner and gives the other a clear unavailable/choose-another
   outcome. This is a drawing of a proposed process, not a database implementation.
3. `ai-tool-loop.review.json`: a model call, retrieval, guardrail, tool call and bounded loop,
   normal completion and an explained human hand-off. Include synthetic estimated token figures
   whose parts add up, and item links for the important boxes and token assumptions.

Each review asks what is still unclear using the understanding verdict set. All identities,
rows, tool names, prompts, outcomes and counts are invented examples. Distinguish the explanatory
templates from claims about a real product. The JSON files are directly reusable as starting
points; do not add a template engine or another executable format.

Keep SKILL.md unchanged unless implementation proves its existing direction to read PROTOCOL.md
insufficient. Any needed SKILL.md edit would require the repository's old/new fresh-agent test.

## 5. Integration and compatibility

- Keep new semantic checks in a focused Apache-2.0 module called by `diagramFaults`, including
  when validating the reviewer's proposed copy. Update the closed CC0 schemas and PROTOCOL.md
  in the same PR. Bound agent flow size to 80 nodes and 160 edges; bound each stop and token field
  as above. Apply these new limits only to marked agent flows, preserving existing examples.
- Keep drawing helpers pure and MIT-0. Reuse the existing layout, adding content-aware heights
  where stop explanations need room; do not truncate the reason or next action. Escape all new
  text at the HTML/SVG boundary and wrap long unbroken strings and wide glyphs safely.
- Existing rename, remove, add-process, add-edge and relabel proposals remain available when
  their resulting diagram passes all rules. Adding a generic process does not create an AI box
  or an explained stop. Removing the sole stop, creating a silent dead end, or closing the only
  exit from a loop is refused by checking the copied graph. Stop metadata and token figures are
  changed by the author in a later review, not by a new structural proposal type in #70.
- Comments and feedback exports keep original node/edge targets. Follow-up reviews answer
  outstanding comments/proposals as usual. No changes to the agent's original diagram occur
  when showing the reviewer's proposed version.
- Extend example validation/regeneration in CI and CONTRIBUTING.md. No runtime dependencies,
  network fetching, private local material, or deployment changes.

## 6. Verification and handoff

Add a named refusal test for each new rule and prove it fails with that guard disabled. Cover
missing/blank stop details, silent dead ends, terminal outgoing edges, no-exit loops, malformed
AI context, wrong diagram kinds, token bounds/shape/duplicate ids/sums, and invalid proposal sets.
Keep valid zero totals, estimated/reported figures, connected loops with exits, and both terminal
and continuing human hand-offs as acceptance cases.

Test visible AI captions, full stop details, token chart arithmetic/text, selection, keyboard
operation, touch targets, comments, exported feedback and follow-up round trips. Include hostile
text in every new surface, long labels, wide glyphs and small-screen geometry. Run the complete
unit suite, all three Playwright browser engines at all three sizes, both real-Chrome suites,
strict schema validation and deterministic example regeneration. Inspect the example pages and
obtain independent implementation review before publishing the PR.

Update #70's checkboxes only after each acceptance item is verified. The PR may close #70 and
#32 together once all catalogue acceptance criteria are met, because parts 1–3 are already merged.
Do not mark #32 part 4 merged before the user merges. Tell the user when the PR is ready; never
merge it on their behalf.
