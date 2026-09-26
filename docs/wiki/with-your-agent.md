# With your agent

[← Wiki home](README.md)

The skill is a folder: `SKILL.md` (instructions the agent follows), the tools in `bin/`, and the examples. Any agent
that can write files and run Node can use it. It has been run with **Claude Code**, **Codex** and **Hermes**.

## Install

```bash
npx skills add shyhunter/LetMeShowYouSomething -g
```

That installs it for every agent on your machine that reads skills (needs Node.js 22.20 or newer). Or copy the folder
into your agent's skills folder, for example `~/.claude/skills/letmeshowyousomething/` for Claude Code.

## Ask for it

Name the skill, or just describe what you need judged:

- `/letmeshowyousomething I want to create an app for my friend's hair salon that takes bookings online. Explain to me how it should look.`
- "Use the LetMeShowYouSomething skill. Write an acceptance review of the four flows I built for me to test."
- "Give me the options for where to store the answers, with your recommendation, as a page."

## What the agent does, step by step

1. **Decides if a page is worth it.** Five or more things to judge, something to look at, a reviewer outside the chat,
   or an answer that must be kept: a page. One to four quick questions: it asks in chat, with its recommendation.
2. **Writes the review and checks it.** It starts from `init.mjs` or the closest example, writes every question in plain
   words, draws the screens for an app idea, and fixes every ✗ from `check.mjs review`.
3. **Records what it used** with `usage.mjs`, then **renders the page**.
4. **Hands over one file: the HTML page.** Never the JSON, never a summary in chat. Then it waits.
5. **Reads what comes back** with `answer.mjs` and `check.mjs pair`. It never opens the returned page any other way.
6. **Reports in a fixed order:** gaps first (with a recommendation and a question for each), then your requests, then
   your choices (saying plainly if you overruled it), then what you added (quoted word for word), then everything else.
7. **Sends the next round** if anything is open, carrying every gap, added item, request and unsettled answer, and
   saying on each what it did with your answer. The page then shows every round.

And throughout: **a verdict is never permission.** Before anything irreversible, the agent asks you in its own tool.
