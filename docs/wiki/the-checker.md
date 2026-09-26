# The checker (`check.mjs`)

[← Wiki home](README.md)

`check.mjs` proves that a review, or an answer to it, is well-formed, complete and honest. It has no dependencies on
purpose: a checker that needs an install is one fewer people run. Every error says what is wrong, what to do, and what
leaving it would cause, in one line. Exit code 0 only when nothing is wrong; warnings never fail a run.

**The value:** the agent never shows you a broken review, and never acts on an answer that doesn't add up.

## The modes

| Mode | Run it on | What it proves |
|---|---|---|
| `review` | a review | The shape matches the schema; every id is unique; the flow reaches every screen and has no dead ends; diagrams make sense; every code reference exists (with `--root`); no secrets; nothing left to fill in |
| `feedback` | an answers file | Every answer uses the review's words; the totals and gaps are true; no two answers share an id |
| `pair` | a review and its answers | The answers belong to this review: every question is there, titles match, choices and approvals echo what was asked |
| `history` | a review and earlier answers | Every earlier decision the review quotes (`affects`) is quoted correctly |
| `followup` | the next review, the review, its answers | The next round carries everything left open: every gap, added item, request and unsettled answer, and answers every comment |
| `rounds` | a round and all the rounds before it | The whole chain: each round a checked pair, each linked to the one before, nothing dropped |
| `copies` | a review and several answer files | Whether two people's answers agree; differences are named, never merged |

Add `--format json` to any mode to get the result as data (each problem with a stable `code`), for tools and CI.

## A few of the rules, and why

- **Unanswered is written down.** A missing answer would look the same as "never reached them".
- **Derived fields must be true.** The summary is what people read instead of the data.
- **The reviewer can always add an item.** The things nobody knew to ask are usually the valuable ones.
- **An approval must still be valid** when it is used, and must be word for word what was asked.
- **Pictures are what they say they are,** judged by their own bytes, with size limits.
- **Examples need a source,** or the page marks them unverified: agents invent convincing examples.

## What it does not prove

Who answered, or that they may decide. The files are unsigned; trust comes from how the file travels (your repo, your
email, your ticket system).
