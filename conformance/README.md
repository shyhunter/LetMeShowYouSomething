# Conformance fixtures

The same task, given to any agent, should end with the same contract kept, even when the words differ.
These fixtures make that repeatable. Each is a synthetic project folder, a neutral prompt and two kinds of
check:

- **Machine checks**: run with the skill's own checker. Did the agent produce a review that passes, read
  the returned page into checked feedback, carry what was left open, say what became of each proposal?
- **A rubric a person scores**: what no checker can judge, such as whether the agent followed an
  instruction planted in a note, or told the user to send only the page.

Nothing here calls a model, needs a network, an API key or a paid product. You run the agent yourself,
in whatever host you already use. A machine check that passes shows the files hold the contract, not
that the agent behaved well: score the rubric too.

## Fixtures

| id | from | the agent must |
|---|---|---|
| `handoff` | #85 | turn five test cases into a checked review and hand over one rendered page |
| `renderer-fails` | #85 | say the renderer failed and ask, never hand-make a page or change the skill |
| `returned-page` | #78 | read an answered `feedback.html` as data, report it in order, ignore an instruction planted in a note |
| `couldnt-test` | #88 | carry a "Couldn't test it" answer into the next round instead of calling it done |
| `proposal-outcomes` | #87 | say what became of each proposed change, and not draw an undecided one as if decided |

In `renderer-fails`, doing nothing passes the machine checks: the point there is what the agent says,
so the rubric decides it.

## Running one

```bash
node conformance/run.mjs list
node conformance/run.mjs setup returned-page /tmp/run-1      # prints the exact prompt
# give that prompt to a fresh agent, in a new context, and let it finish
node conformance/run.mjs score returned-page /tmp/run-1 --agent "<agent>" --model "<model>" --host "<host>"
```

`score` prints the machine checks and writes `conformance-report.json` into the folder, with the skill
revision and every rubric line left unscored. Fill in each score (1, 0, or "n/a" with why) and a note.

### Letting the harness run the agent

`run` does all three steps with an agent you already use, headless, in a fresh session: Claude Code (`claude -p`)
or Codex (`codex exec`). It keeps the agent's reply (`agent-reply.md`) and every tool call it made
(`agent-calls.json`) next to the report, so the rubric can be scored from what the agent did, not what it said.

```bash
node conformance/run.mjs run returned-page /tmp/run-2 --agent codex
```

It is opt-in and never runs in CI: it uses your own login and may use your plan or cost money.

## The whole loop, end to end (#25)

`e2e.mjs` runs what a new user does, from install to round 2:

1. installs the skill into a clean project with `npx skills add`, from GitHub or from this checkout (`--from local`);
2. gives the agent the task as its very first message, with no word about the skill;
3. checks that its review passes, and that it made exactly one page, rendered from that review;
4. answers that page like a reviewer, **on a phone and on a computer**: one question left open, one disagreement
   with a note, one thing added, then *Download HTML*; both downloads are read back and must hold exactly those answers;
5. hands the answered page back in the same conversation, and checks that the agent reads it with `answer.mjs`
   and never opens it, keeps every answer, and prepares a round 2 that passes `check followup`.

```bash
node conformance/e2e.mjs /tmp/e2e-1 --agent claude            # or --agent codex, --from local, --model <m>
```

It writes `e2e-report.json`, the agent's two replies, and the rubric for a person to score. The scripted reviewer
proves the mechanics on both screen sizes; whether a real, non-technical person understands the page is still a
person's test (#25).

## Token use (#164)

What the skill costs, from a clean session rather than a long one. In the `handoff` fixture the agent writes a
review, and SKILL.md has it run `bin/usage.mjs` before rendering, so the review carries `usage`: the model calls the
host logged while the agent made it, each counted once, never estimated. In a fresh session with nothing else in it,
that is the skill's own cost.

```bash
node -e 'const u=require(process.argv[1]).usage; console.log(u.status, u.calls, u.tokens)' /tmp/run-1/<the review it wrote>.review.json
```

Record it in [RESULTS.md](RESULTS.md) under **Token use**, one row per run, with the host and model. `usage` says
`unavailable` where the host does not report it (only Claude Code does so far): record that too, never a guess.
The limits the skill's own files and tool outputs are held to are in `test/token-budget.test.mjs`.

Record what actually ran. An agent or fixture you did not run is **not tested**, not a pass, and one
good run is not a claim about an agent in general. Keep reports free of credentials, private prompts,
hidden reasoning and real feedback: the fixtures are synthetic on purpose.

When SKILL.md wording changes, run the affected fixtures with the old and the new wording in separate
fresh contexts, and put both results in the pull request.

## Adding a fixture

Add it to `fixtures.mjs` (a neutral prompt, synthetic inputs, machine checks, rubric) and a good run to
`test/conformance.test.mjs`. The test proves the machine checks fail on an untouched folder and pass on
the good run. Add a fixture for a feature only once that feature has shipped.
