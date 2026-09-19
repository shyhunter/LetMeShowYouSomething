# What the agent says back

This is the last leg of the loop, for the booking flow example:

1. The agent wrote [`flow-booking.review.json`](flow-booking.review.json) and rendered it as [`flow-booking.html`](flow-booking.html).
2. A reviewer clicked through the page and pressed **Export feedback.json**:
   [`flow-booking.feedback.json`](flow-booking.feedback.json). *These are demonstration answers, given in a recorded
   browser session for this example.*
3. The agent checked the file before reading it:

   ```
   $ node bin/check.mjs pair examples/flow-booking.review.json examples/flow-booking.feedback.json --root .
   PASS — 42/42 checks, 1 warning(s)
   ```

   The warning is one of the agent's own examples with no source; the page already shows it as unverified.
4. Then it reported back, in the order [`SKILL.md`](../SKILL.md) asks for. What follows is that report, written by an
   agent following SKILL.md, word for word.

---

The reviewer answered 9 of the 11 steps and added one thing of their own. The review didn't record their name, so I'll
call them the reviewer. Four things are open.

## Gaps first

**1. Taps Join the waiting list for 10:00 — the reviewer disagrees.**
> "Thirty minutes to book is too short when the email arrives at night."

My recommendation: keep the 30 minutes during the venue's opening hours, and when a slot frees up at night, start the
clock at 8:00 the next morning. The next person still gets a fair chance, and nobody loses a slot while asleep. *For
the reviewer:* does that fix it, or should the window be longer at all times (say 2 hours)? I'll send it back as a
one-item follow-up review.

**2. Taps Ask a question — no answer yet, and the reviewer asked me to explain it.** The explanation is below under
*Requests*. The step stays open until they have read it and answered.

**3. Taps Send — no answer yet.** It is the second half of asking a question, so it depends on (2). My recommendation:
keep it as suggested and ask again together with (2), in the same follow-up.

**4. Something the reviewer added — see *What the reviewer added* below.** It has no verdict yet because it is new; I
have to answer it, not the other way round.

## Requests

**The reviewer asked me to explain "Taps Ask a question".** Here is what that step is and why it is in the flow.

Today customers who have a question before booking, such as "Is there parking nearby?", email the venue, and nothing
in the app handles it. This step is marked *suggested*: nobody asked for it; I added it because the flow had no way to
ask anything before booking. Tapping **Ask a question** opens a short form, *Ask the venue*. **Send** delivers it to
the venue by email, and the person sees "Question sent: the venue replies by email, usually within a day". Nothing
about the booking changes.

*The question for the reviewer:* should this be in the product (agree), left out for now (disagree), or done
differently, for example as the venue's phone number instead of a form (partly agree, with a note)?

## Choices

This review had no choose-one section, so there was no pick to report. The question I asked in the brief — *store
credit instead of money back when someone cancels more than 24 hours before?* — was answered in the cancellation step
below: store credit is accepted, with one change.

## What the reviewer added

> **Show the cancellation deadline on the booking**
> "People should see "free cancellation until Friday 10:00" before they try, not find out when it is too late."

I didn't ask about this, and it is right: today the 24-hour limit only appears when someone tries to cancel too late.
I'll add the deadline to the *Booked* screen, under the date, in the next round.

## Everything else

- **Confirms Cancel booking — partly agree.**
  > "Store credit is fine, but say "store credit" on the button itself, not only in the text above it."

  So the answer to my question is yes, store credit. I'll rename the button from *Cancel booking* to *Cancel for
  €20.00 store credit*, and the dialog text can stay as it is.
- **Agreed, built as shown:** Taps Book 10:00 · Taps Cancel booking · Taps Keep it · Taps Pick another time ·
  Taps Find a time · Taps Pick another day · Taps Show times.

## What happens next

As the review said: the seven agreed steps are built as shown. The cancellation button gets the new label, and the
*Booked* screen gets the deadline. The waiting list, *Ask a question* and *Send* go back to the reviewer as one short
follow-up review, with the explanation above.
