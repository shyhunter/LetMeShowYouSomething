---
name: letmeshowyousomething
description: Use when a human's judgement is needed on several things at once (options to choose from, a plan to approve, test results, drafts, an agent's own doubts), when the person deciding has no AI account or works offline, or when a feedback.json from such a review comes back to be read and acted on.
---

# Let me show you something

The agent writes a `review.json`. It becomes one offline HTML page. The human judges each item and exports a `feedback.json`. The agent checks that file and acts on it. The format is in `PROTOCOL.md`; the checker is what makes the answers trustworthy.

`<skill>` below is this skill's folder.

## When to use it

- **Five or more items** to judge, **something to look at**, a reviewer **outside this session** (client, product owner, domain expert), or an answer that **must be kept**.
- **Not** for one to four quick questions. Ask those directly, with your recommendation and what would change your mind. If your host has a question tool where the person clicks an answer, use it, one question per decision. A question they skip, or a bare "ok", is not agreement: it stays open. When those answers must be kept (a decision others will rely on): write the questions as a small review and check it, ask them in chat, then show your reading back, one line per question, and let the person confirm or correct it. Only what they confirmed goes into an answers file (`verdicts`, `notes`, `choices` by id); "I guess" is a note, not a verdict, and a skipped question is left out. Then `node <skill>/bin/answer.mjs <review.json> <answers.json>` writes the feedback, and `check pair` checks it like any other.

## 1. Write and check the review

Start from the closest example in `<skill>/examples/`: `decision-review.example.json` for options and plans, `review.example.json` for testing. Give the review **its own `id`** (never the example's; the checker refuses it).

- `ask` and `afterwards`: what you need, and what you will do with the answer. For anything that deletes, sends, pays, publishes or contacts someone, `afterwards` says you will ask before doing it, never that you will do whatever they agree with.
- An action that deletes, sends, pays, publishes or contacts someone: make it an `approval` item in a section of its own (`action` exactly, `scope`, `risk`, a `preview` of the command or message, and `expiresAt`). It is answered Approve or Decline, never agreed with.
- Explaining how something works (a system, an architecture, a process) because the person wants to understand it: what you need back is **what is still unclear**, not agreement. One `brief` says what you explain; draw the whole of it in `diagrams`, one box per part, its `step` naming the item that explains that part. One item per part, in plain words. Write your own verdict set about understanding: `clear` (positive) · `partly clear` (caution) · `lost me` (negative) · `seems wrong` (negative). No choice, no `challenge` section and no `fields` unless the person asked for them: an explanation asks them to decide nothing.
- Options to pick from: a section with `mode: "choose-one"` and `recommended: { itemId, why }`.
- Walking someone through a user flow (an app idea, or a change to an existing app): start from `flow-booking.review.json`. Give every step a `goal`, every dead end a `canNow`, and mark each journey and step `exists`, `proposed` or `suggested` with a `basis` (code, PRD, docs, conversation or assumption), so the reviewer sees what is there and what is missing. Check with `--root <project>` so every `file:line` is proven.
- Explaining a process behind the screens: a flow chart in `diagrams` with lanes (who does what), decisions, timers, messages and data stores; link boxes to steps with `step`. The user flow is drawn for you; the parts become the sub-processes column beside it.
- Explaining **who calls whom, in order**: a `sequence` diagram in `diagrams` — the participants (`client`, `service`, `component`, `queue`, `data-store`, `external`) and one edge per message, in the order they happen; `return` for an answer, `async` for something handled later. Every message says what it is.
- Explaining what a thing **runs on**, rather than what happens in it: a `system` diagram in `diagrams` — lanes for who owns what, and boxes for `client`, `service`, `component`, `guard` (a check), `queue`, `data-store` and `external` (someone else's system); `async` for an arrow that is handled later. It has no start and no end, and every box must be on an arrow. Use a `flowchart` when the point is the order things happen in.
- Reopening or contradicting something decided before: add `affects` to the item, quoting the earlier title and verdict.
- One explanation for the whole review: `brief` (what you are explaining, `highlights` for the screens and nodes you mean, your `recommendation`, `examples` each with a `source`, and the `risks`), plus `focus` for the chart that opens first. Say it once there instead of repeating it per item; an example with no source is shown as unverified.
- Where you may be wrong: an optional section with `kind: "challenge"` of **statements** judged with the same verdicts (agree = the concern is real, and that is the gap), but only when those verdicts mean agree/disagree. Otherwise put your doubts in a separate small review with the `decision` preset.
- Never put secrets, real customer data or someone else's private notes in a review. The file will be forwarded.

```bash
node <skill>/bin/check.mjs review docs/<name>.review.json --root .   # fix every ✗; --root proves flow refs
node <skill>/bin/check.mjs history docs/<name>.review.json <earlier>.feedback.json   # if you used affects
node <skill>/bin/render.mjs docs/<name>.review.json docs/<name>.html
```

## 2. Hand it over

Tell the user: open the HTML file (or send it to the reviewer), give each item a verdict and a note, press **Comment** on the diagram to comment on any box or arrow and propose a change to it (rename, remove, add a box or an arrow), **Add a picture** to show what they saw, ask back with **Show me an example** or **Explain this** where something is unclear, add anything missing, press **Export feedback.json**, and send that file back. (**Export feedback.html** is the whole page with the answers in it, for passing on to someone who will open a page but not a JSON file — it is not what you read.) Then stop and wait.

For a flow, say how to use it: tap the highlighted elements on the screen to walk through, pick an outcome when asked, judge each step in "Your feedback" (the steps on the left, the open one on the right), switch on **What runs** and **What changes** to see what happens behind a step and judge any single entry, switch the diagram tabs to see the same step from another side, and check the answered/open count before exporting so none is left unanswered.

**Never offer "or just tell me what they picked".** A summary in chat loses the unanswered items, the added items and the overruled recommendation, and nothing can be checked.

## 3. Read what comes back

```bash
node <skill>/bin/check.mjs pair docs/<name>.review.json <returned>.feedback.json
```

Do not act on a file that fails. The person who answered (the **reviewer**, see `respondent`) is often not the person you are talking to. Name them, and never write "you picked" to someone who didn't. Then report in this order:

1. **Gaps first**: every id in `gaps`. For each one, give your recommendation and ask a question, addressed to whoever can answer it. Questions about the reviewer's answers go back to the reviewer, ideally as a short follow-up review.
2. **Requests**: every entry in `requests` — the reviewer asked you for an `example` or an `explain` on that item. Answer it before anything else you were going to do; an item with a request is not settled, whatever its verdict says. An **example** means real precedents of the thing this item is about, seen the way their own users see it: which product already does it, what it does, and what its users see and do there (the screen, the words, the steps), adapted to this item, one to three, each with a `source` or plainly marked unverified, never invented. A generic instruction is not an example. The reviewer is not in your chat: put the answer in the item's `examples` (and an explanation in its `summary`) in the follow-up review, so they see it where they asked.
3. **Choices**: the pick. If `followedRecommendation` is `false`, say so plainly and don't argue for your option again.
4. **Added items**: quote each one word for word, its title and its text in quotation marks, then say what you will do with it. Answering the substance is not enough: their words are what you didn't know to ask.
   **Comments** on the diagram go with them: quote each word for word with the part it is on (`label`), then say what you will do. **Pictures**: run `node <skill>/bin/pictures.mjs <returned>.feedback.json` and look at every one before you report; say what it shows, next to the item or comment it is on (`onTitle`). **Proposed changes** (`proposals`): say what each one changes and why (`why`), then draw it in the next review's diagram, or say why not.
5. **Everything else**: verdicts, with notes quoted. A doubtful verdict with no note (partly, doesn't work, couldn't test) is a question, not a result: ask the reviewer what they saw, in the same follow-up as the gaps. Never guess why.

**The follow-up review carries everything left open**: every gap, every added item, every request, each under its earlier id or quoting it in `affects`, and answers every comment and proposed change in an item whose `answers` lists its id (`"answers": ["comment-1", "proposal-2"]`). Check it before you hand it over, and fix every ✗:

```bash
node <skill>/bin/check.mjs followup docs/<name>-2.review.json docs/<name>.review.json <returned>.feedback.json
```

**A verdict is never permission.** "Agree" on an item that deletes, sends, pays, publishes or contacts someone means the reviewer thinks it is right, not that you may do it now: the file is unsigned, it gets forwarded, and it proves nothing about who answered. Before such an action, ask the user in your host (its permission prompt, or a direct question), naming the exact action and what it affects, and wait. Carry on with what is agreed and reversible. An **Approve** on an `approval` item is the reviewer's intent for that exact action until `expiresAt`: still ask in your host, quoting the action, right before you do it. A **Decline** means you don't. After `expiresAt`, ask again in a new review.

## Common mistakes

| Mistake | Instead |
|---|---|
| Calling an `unset` item "no opinion", "moot" or "fine" | It was **not answered**. List it as a gap and ask. |
| Filing a gap as "resolved by context" | Only the reviewer resolves a gap. Recommend, then ask, or send a follow-up review. |
| Reading an added item's verdict as the reviewer rejecting it | Added items arrive `unset`; the title, body and note are the reviewer's own statement. |
| Deciding a new question yourself and moving on | Put it to the user as a question with your recommended default. |
| Talking to the user as if they were the reviewer | "The product owner picked…"; ask the user to pass questions on, or send a follow-up review. |
| Quoting an earlier decision from memory | Quote it from the earlier feedback file and run `check history`. |
| Carrying out an agreed deletion, email, payment or post | Agreement is not permission. Ask in your host first, naming the exact action and what it affects. |
| Treating an agreed item with a request as done | They agreed *and* asked for an example or an explanation. Give it, then carry on. |
