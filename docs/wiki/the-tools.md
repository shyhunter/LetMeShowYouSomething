# The other tools

[← Wiki home](README.md)

Small commands around the review, each for one job. All are plain Node, no install.

## `init.mjs`: start a review right

```bash
node bin/init.mjs flow docs/booking.review.json --title "Online booking" --audience "The salon owner"
```

Writes the smallest valid review of a kind (`decision`, `plan`, `test`, `explain`, `flow`, `backlog`) with its own id,
today's date and answer words that fit. Every place that needs the agent's own words says `[[fill in: …]]`, and the
checker refuses a review that still has one.

*Value:* the agent starts from the right structure instead of reshaping an example, and can't hand over a half-written
review.

## `render.mjs`: make the page

```bash
node bin/render.mjs docs/booking.review.json docs/booking.html
node bin/render.mjs docs/booking-2.review.json docs/booking-2.html --earlier docs/booking.review.json docs/booking.feedback.json
```

One self-contained page. `--earlier` adds each round before (oldest first); nothing is written unless the whole chain
checks out. `--home <https address>` adds a home button, for pages published on a website only.

*Value:* one file the reviewer can open anywhere, and one continuing document across rounds.

## `answer.mjs`: read the answers safely

```bash
node bin/answer.mjs docs/booking.review.json returned.html docs/booking.feedback.json
```

Reads an answered page as data, without running or loading anything in it, checks it against the agent's own review,
and writes the feedback file only if `check pair` passes. It never overwrites a file. It also records answers given in
chat, for one to four quick questions, after the person confirmed them.

*Value:* a returned page is untrusted; this is the only safe way to read it, and a changed review is refused.

## `usage.mjs`: what making the review used

```bash
node bin/usage.mjs --claude-code --since 2026-09-26T10:40:24Z --into docs/booking.review.json
```

Counts the model calls the host logged since the agent started on the review, each once, and writes them into the
review; the page shows them as reported, never as a price. Outside Claude Code it writes "unavailable" and why.

*Value:* honest cost, never an estimate and never written by hand.

## `pictures.mjs`: look at the pictures

```bash
node bin/pictures.mjs docs/booking.feedback.json pictures/
```

Writes the pictures from an answers file out as image files.

*Value:* the agent looks at every picture before it reports, and says what each shows.
