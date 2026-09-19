# Licensing

Three licences, chosen by where a file ends up. Each file says which one applies: code files in
an `SPDX-License-Identifier` line, everything else in `REUSE.toml`. Full texts are in `LICENSES/`.

| Part | Licence | What it means for you |
|---|---|---|
| Checker, renderer, skill instructions, tests | Apache-2.0 | Use it for anything, commercially too, with an explicit patent grant from every contributor. |
| Code copied into generated pages (`lib/build-feedback.mjs`, the page template), examples | MIT-0 | A review page you send to anyone carries no obligation, not even attribution. |
| The protocol (`PROTOCOL.md`) and its JSON schemas | CC0-1.0 | Implement the format in any tool, including a commercial one, with nothing to keep or credit. |

The open-source version stays free and complete. Features are never removed from it or moved into a
paid version.

The skill and every page it makes contain no third-party code. The tests use Playwright (Apache-2.0),
which is never shipped in a page; [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) lists it and the other tools
used to check, build and install the project. Nothing here requires a commercial licence, and nothing will.
