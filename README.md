# Let me show you something

Your AI agent writes down what it needs you to judge, you answer on one offline page, and your
answers go back to the agent as a file it checks before it acts.

```
agent ──► review.json ──► render ──► one HTML page ──► a person judges each item ──► Export
agent ◄── check (PASS) ◄── feedback.json ◄── the answered page, read as data ◄──────┘
```

It is an agent skill: one folder with instructions, a renderer and a checker. The format in
between (`review.v1` and `feedback.v1`) is written down as a [protocol](PROTOCOL.md), so any agent,
script or tool can write the question or read the answer.

## Why

Agents ask for your judgement all the time: which option, does this flow make sense, did these
tests pass, is this plan right. In chat, the answer is a paragraph. Items get skipped, "looks good"
covers ten things at once, and nothing can be checked afterwards.

Here the answer is data:

- **Every item gets a verdict.** One nobody answered is written down as unanswered, never left out,
  so the agent sees what is still open.
- **Gaps come first.** Whatever needs work, or has no answer yet, is listed before everything else.
- **The reviewer can add what nobody asked about**, and it goes back with the rest.
- **The checker recomputes the summary** and refuses a file that does not add up. The agent does
  not act on a failed file.
- **The reviewer needs nothing:** no AI account, no install, no internet. The page is one file that
  loads nothing from the network. Send it to a client, a product owner or a colleague.

## What it does not do

- **Quick questions.** One to four simple questions are faster in chat, with the agent's
  recommendation. The page is for several things at once, something to look at, or a reviewer outside
  the chat. When quick answers must be kept, the agent reads them back for you to confirm and records
  them as the same checked file (`bin/answer.mjs`).
- **Identity or approval rights.** The checker proves an answer is complete and fits its review. It
  does not prove who answered, or that they may approve. That comes from how the file travels:
  your repo, your email, your ticket system.
- **Data-loss prevention.** The checker refuses a review holding a well-known key or token format
  (AWS, GitHub, Slack, API keys, private keys, JWTs) or a password inside a URL. That is a
  guardrail, not a scanner for every kind of sensitive data. A review gets forwarded: keep
  customer data and private notes out of it.
- **Every agent, proven.** The format is open, so any agent or tool can use it. The skill itself needs
  an agent that can write files and run Node. So far it is tested with Claude Code and Codex.

## What it can ask

| Kind | You see | Example |
|---|---|---|
| Test results | Each case marked works, partially works, doesn't work or couldn't test, plus a note | [`review.example.json`](examples/review.example.json) → [try it](https://shyhunter.github.io/LetMeShowYouSomething/examples/checkout-uat.html) |
| A decision | The options, the agent's recommendation and why, and earlier decisions it would reopen | [`decision-review.example.json`](examples/decision-review.example.json) → [try it](https://shyhunter.github.io/LetMeShowYouSomething/examples/decision-review.html) |
| A user flow | The app's screens to click through, a diagram of the flow, and each step to judge | [`flow-booking.review.json`](examples/flow-booking.review.json) → [try it](https://shyhunter.github.io/LetMeShowYouSomething/examples/flow-booking.html) |

Open any of them in your browser, no install: the pages are the product, not screenshots of it.
All three are on the [project site](https://shyhunter.github.io/LetMeShowYouSomething/).

**[See the whole loop](https://shyhunter.github.io/LetMeShowYouSomething/loop.html):** a person answers the booking
review (a 30-second recording), the file the page exported, the checker's verdict, and what the agent says back, gaps
first. Every piece is real; the files are in [`examples/`](examples) ([the report](examples/flow-booking.report.md)).

The flow page draws the steps as a diagram with the sub-processes beside it. It also shows every
screen at once, connected like a prototype, so you can judge the whole journey and not only one
screen. You can pin the parts you want to keep in view, and pick a style (Macintosh 1984,
Cyberpunk, Newsletter, ShyHunter) in light or dark.

## Quick start

You need [Node.js](https://nodejs.org) (tested on Node 22). The skill has no dependencies and nothing
to install.

```bash
# 1. The agent writes a review and checks it
node bin/check.mjs review examples/review.example.json

# 2. It becomes one page
node bin/render.mjs examples/review.example.json review.html

# 3. The reviewer opens review.html, answers, and sends back the page (Export feedback.html)
#    or its feedback.json. The agent checks what came back before acting on it:
node bin/answer.mjs examples/review.example.json answered.html feedback.json   # a returned page
node bin/check.mjs pair examples/review.example.json examples/checkout-uat.feedback.json
```

For a flow, add `--root <project>` to step 1: every `file:line` the review cites is then checked
against your code.

## Use it as a skill

```bash
npx skills add shyhunter/LetMeShowYouSomething -g
```

That installs it for every agent on your machine that reads skills, through the
[skills](https://github.com/vercel-labs/skills) installer (it needs Node.js 22.20 or newer). Tested
with Claude Code and Codex. In Claude Code it lands in `~/.claude/skills/letmeshowyousomething/`. The installer also
supports many other agents; we have not tried each one.

Or copy this folder into your agent's skills folder yourself, for example
`~/.claude/skills/letmeshowyousomething/` for Claude Code.

[`SKILL.md`](SKILL.md) tells the agent when to use it, how to write a review, and how to report what
comes back: gaps first, then the reviewer's questions, then choices, then what the reviewer added.
It is plain files and Node, so it works the same with any agent that can run a command.

## The protocol

[`PROTOCOL.md`](PROTOCOL.md) is the contract; the JSON schemas are in [`schemas/`](schemas), and served at
the address their `$id` names, for example
[`schema/review.v1.json`](https://shyhunter.github.io/LetMeShowYouSomething/schema/review.v1.json). The
page in this repo is one way to show a review. A terminal prompt, a native app or a printed sheet
would be just as valid, as long as what comes back passes the checker.

Which file owns which part (the contract, the checks, the page, the agent's steps, the plans) is in
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Development

```bash
node --test test/protocol.test.mjs            # the protocol, the checker, the renderer
node checks/browser/flow-page.check.mjs       # the flow page in real Chrome (skips if Chrome is missing)
node checks/browser/list-page.check.mjs       # the test and decision pages in real Chrome

# The pages in Chromium, Firefox and WebKit, at desktop, tablet and phone size.
# Playwright is a test-only dependency; the skill itself does not need it.
npm ci && npx playwright install chromium firefox webkit
npx playwright test
```

Changing something here? [CONTRIBUTING.md](CONTRIBUTING.md) has the house rules: run the three test
suites, a new refusal comes with a test that proves it, and the example pages are generated.

## Licence

Free and complete, with no paid version. Three licences, depending on where a file ends up
(details in [LICENSING.md](LICENSING.md)):

- **Apache-2.0**: the checker, the renderer, the skill and the tests.
- **MIT-0**: the code copied into every page you send, and the examples. A page you send carries no
  obligation.
- **CC0-1.0**: the protocol and its schemas. Implement the format anywhere.
