# The page (`render.mjs`)

[← Wiki home](README.md)

`render.mjs` turns a checked review into **one HTML file**. That file is the only thing the reviewer gets. It loads
nothing from the network, needs no account and no install, and works in any modern browser, light or dark, on a
computer or a phone.

**The value:** the person who decides doesn't need an AI account, the tools you use, or even internet. Email it, put
it in a ticket, send it to a client.

## The parts of the page

### Let me explain

The first screen: short numbered cards (what needs deciding, the recommendation, what will be asked, examples, the
risks, how to answer, what happens next) and one button, **Start**. Everything longer sits behind "More", never
dropped.

*Value:* the reviewer knows what they are judging and why before the first question. The cards are written into the
page, so even a phone's file preview, which runs no script, shows them.

### The tour

One question at a time, with **Back**, **Next** and "Step N of M". A question can be skipped; it stays open.

- **The progress bar** runs from Let me explain to Return through the review's parts, each filling as it is answered.
  *Value:* you always see how far you are and what is still open.
- **The answer** as big tiles in the review's own words and tones. After an answer: a note ("What should be
  different?"), **Add a picture**, **Mark it on the map**, and asking back with **Show me an example** or **Explain it
  differently**. *Value:* you can say why, show it, point at it, or ask before you decide.
- **Four places on the right, always in this order:**
  1. **Map**: the diagram, with "you are here"; other diagrams as tabs; zoom in place.
  2. **Prototype**: the screen as the app will show it, the tapped part marked.
  3. **What should happen**: each outcome, with why and what the person can do next.
  4. **How I'd build it**: what runs and what changes, with status and code reference.

  *Value:* the same layout on every question, so you never hunt for things. A place with nothing to show is left out.
  **Prototype only** folds the rest; **Expand** shows the whole map and every screen. On a phone the places are tabs.

### Overview

The whole review on one page, every question answerable in place. For a flow it is a **storyboard**: one shaded band
per question with what the agent suggests on the left, the step in the flow in the middle, and the piece of the screen
you tap on the right. Diagram tabs re-key the rows (a database tab shows what each step stores). It ends with
**Checked before you see it**, taken from the checker's own results.

*Value:* see how everything fits together, answer in any order, and trust what was already checked.

### Return

Every question with its answer or "Stays open", **Something missing? Add it**, and the downloads:

- **HTML**: the page with your answers written into it. Easy to forward; whoever opens it sees everything.
- **MD**: a readable report.
- **JSON**: the feedback file for the agent.

Each can be previewed first. **Save to a file** (Chrome and Edge on a computer) keeps saving into one file you choose.

*Value:* nothing leaves your browser until you send a file yourself, and an unanswered question is never taken as a
yes.

### Later rounds

When the agent sends round 2, the page carries every earlier round:

- each question says what became of it: **New**, **You added**, **Still open**, **Changed after your note**, **Asked
  again**; settled answers are listed apart;
- **History** shows every round, with your answers and the agent's replies;
- **Before and after**, for a flow: what changed since your answers, side by side.

*Value:* one continuing document instead of a pile of unrelated forms, and you see that your notes were acted on.

## Promises the page keeps

- **Offline and self-contained:** fonts, icons, pictures and code are inside the file.
- **Your answers stay with you:** kept in that browser as you go; nothing is sent. Where you clicked is never recorded.
- **Keyboard and touch:** real radio buttons, every target at least 44 px on a touch screen, no sideways scrolling.
- **The same code as the checker:** the page builds its answers with the very file the tests use, so its export always
  passes.
