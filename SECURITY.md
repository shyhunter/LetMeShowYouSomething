<!-- SPDX-License-Identifier: Apache-2.0 -->
# Security

## Reporting a problem

Please report security problems privately, not in a public issue:
**[Report a vulnerability](https://github.com/shyhunter/LetMeShowYouSomething/security/advisories/new)**
(the repository's Security tab → "Report a vulnerability").

Say what you found, how to reproduce it, and what someone could do with it. You will get an answer
as soon as possible; this is a project maintained in spare time, so there is no fixed response time.

## What is in scope

- **The rendered page.** Everything in a review file is untrusted: a review that makes the page run
  script, load something from the network, or leak an answer is a vulnerability.
- **The exported files.** An answer that breaks out of the exported page, or a feedback file that
  passes the checker while its summary or gaps are false.
- **The checker and the renderer** (`bin/`), when given hostile input.

The page is designed to fetch nothing and to keep answers in the reviewer's own browser. Anything
that breaks either promise is in scope.

## What this project does not handle

No accounts, no server, no stored credentials: there are no secrets here to leak. The reviewer's
answers stay on their device until they choose to export and send them.
