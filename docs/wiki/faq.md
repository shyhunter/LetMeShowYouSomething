# FAQ

[← Wiki home](README.md)

**What is it, in one sentence?**
Your AI agent writes down what it needs you to judge, you answer on one offline page, and your answers go back to the
agent as a file it checks before it acts.

**Does the person answering need an AI account, an install or internet?**
No. The page is one HTML file that loads nothing from the network. Open it in any browser, on a computer or a phone.

**Does anything leave my browser?**
Not until you send a file yourself. Answers are kept in that browser as you go; downloading writes a file on your
device and sends nothing. Where you clicked is never recorded.

**Where are my answers kept while I work?**
In the browser's own storage for that page. Use Return → HTML or JSON to keep them as a file, or **Save to a file** in
Chrome or Edge on a computer.

**What should I send back?**
One file: the answered page (HTML) is easiest; the JSON works too. Send it the way you'd send any file.

**Can I skip a question?**
Yes. It stays open and the agent asks again; it is never taken as agreement.

**Does "Agree" let the agent go ahead and do it?**
No. A verdict is an opinion. Before deleting, sending, paying, publishing or contacting someone, the agent asks you in
its own tool, naming the exact action. For one exact action, the review uses an **approval**, answered Approve or
Decline, which still gets confirmed right before the agent acts.

**Can I trust an answered file someone forwarded to me?**
The checker proves it is complete and belongs to the review. It can't prove who answered: the files are unsigned. Trust
comes from how the file reached you.

**What if two people answer the same page?**
The agent compares the files. The same answers count once; different ones are never merged: the person who asked for
the review decides which counts, and the next round asks each difference again.

**Can I add something nobody asked about?**
Yes: on Return, **Something missing? Add it**. The agent must quote it word for word and say what it will do.

**Can I show instead of explain?**
Yes: **Add a picture** to any note (hidden details like a photo's location are removed), or **Mark it on the map** to
point at a box in the diagram.

**Which agents does it work with?**
Any agent that can write files and run Node. It has been run with Claude Code, Codex and Hermes. The file format is open
([PROTOCOL.md](../../PROTOCOL.md)), so any tool can write a review or read the answers.

**What does it cost?**
The skill is free and open source, with no paid version. Making a review uses your agent's model like any other task;
where the host reports it (Claude Code today), the page shows what it used, never an estimate.

**Does it work on a phone?**
Answering, yes: the page is made for phones and tablets too. On a phone's file preview, which runs no script, you see
the explanation and a note to open it in a browser app.

**Can the agent show my real app instead of drawings?**
Yes: a screen can be a screenshot of the running app, with the area to tap marked for each step.

**What about secrets and customer data?**
The checker refuses a review holding anything shaped like a key, token or password in a URL. It is a guardrail, not a
scanner for every kind of sensitive data: a review gets forwarded, so the agent keeps real customer data out of it.

**Why not a hosted form?**
A hosted form lives in someone's product and needs an account and a network. This is a file you own, any agent can
write, anyone can answer offline, and any agent can read back and check.

**Which languages?**
The page's own words are in English today. The questions are in whatever language the agent writes them.

**What is the licence?**
Apache-2.0 for the tools, MIT-0 for the code inside every page you send (so a page carries no obligation), and CC0-1.0
for the protocol. See [LICENSING.md](../../LICENSING.md).
