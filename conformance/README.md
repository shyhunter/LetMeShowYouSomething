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

Record what actually ran. An agent or fixture you did not run is **not tested**, not a pass, and one
good run is not a claim about an agent in general. Keep reports free of credentials, private prompts,
hidden reasoning and real feedback: the fixtures are synthetic on purpose.

When SKILL.md wording changes, run the affected fixtures with the old and the new wording in separate
fresh contexts, and put both results in the pull request.

## Adding a fixture

Add it to `fixtures.mjs` (a neutral prompt, synthetic inputs, machine checks, rubric) and a good run to
`test/conformance.test.mjs`. The test proves the machine checks fail on an untouched folder and pass on
the good run. Add a fixture for a feature only once that feature has shipped.
