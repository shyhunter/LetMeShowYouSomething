# The answers (`feedback.json`)

[← Wiki home](README.md)

What comes back from the page. The reviewer downloads the answered page (HTML) or the JSON; the agent turns an HTML
page into this file with `answer.mjs`, and checks it before acting.

**The value:** the answer is data, not a paragraph. Any agent, a script or a person a year later can read it, without
the page and without the original review.

## What it holds

| Part | What it is | The value |
|---|---|---|
| `responses` | One entry per question: its title echoed, the verdict, the note | Readable on its own; an unanswered question is written down as `unset`, never left out |
| `gaps` | Every answer that needs work, and every unanswered one | The agent starts with what is open, not with what went well |
| `summary` | Totals by verdict | Recomputed by the checker; a hand-edited file can't lie about its own numbers |
| `choices` | The option picked in each choose-one section, and whether it followed the recommendation | The agent says plainly when you overruled it, and doesn't argue again |
| `addedItems` | What the reviewer raised that nobody asked about | Often the most valuable part; the agent must quote it word for word |
| `requests` | "Show me an example" or "Explain it differently" on a question | Answered in the next round, where the reviewer asked |
| `comments` | Marks on a box or arrow of a diagram, with words | Feedback on the agent's own picture, not only in text |
| `pictures` | Screenshots or photos attached to a note or comment | Show, don't describe; hidden details (like a photo's location) are removed |
| `layerVerdicts` | An answer on one thing behind a step (a system part, a data change) | A developer can judge the details without a separate review |
| `respondent`, `respondedAt`, `via` | Who, when, and how it came back (page or chat) | Context for the report; never proof of identity |

## What an answer means, and what it doesn't

- **Unanswered is not agreement.** It is a gap, carried to the next round.
- **"Agree" is an opinion, never permission.** Before anything that deletes, sends, pays, publishes or contacts
  someone, the agent still asks you in its own tool, naming the exact action.
- **The file is unsigned.** It proves the answer fits the review, not who gave it.
- **Two copies with different answers** are never merged: the person who asked for the review decides which counts,
  and the next round asks each difference again.
