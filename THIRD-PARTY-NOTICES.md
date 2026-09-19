# Third-party notices

What this project uses from others, and where it ends up. In short: **the skill and every page it
makes contain no third-party code.** Everything below is used to test, build or install it, and is
never copied into a page you send.

## In the skill and in generated pages

Nothing. The checker, the renderer and everything inlined into a review page are this project's own
code (see [LICENSING.md](LICENSING.md)). The logo is our own drawing.

The page styles name some fonts (for example Georgia, Monaco, Archivo, Bricolage Grotesque,
JetBrains Mono). No font files are included: a page uses a font only if it is already installed on
the reader's computer, and falls back to the system's own fonts otherwise.

## For testing only

Declared in [`package.json`](package.json) as a development dependency. The skill does not need it,
and installing the skill does not install it.

| Package | Version | Licence | Copyright |
|---|---|---|---|
| `@playwright/test` | 1.63.0 | Apache-2.0 | Microsoft Corporation |
| `playwright` | 1.63.0 | Apache-2.0 | Microsoft Corporation |
| `playwright-core` | 1.63.0 | Apache-2.0 | Microsoft Corporation |

Playwright downloads builds of Chromium, Firefox and WebKit to run the tests. Those browsers come
under their own licences, are stored outside this repository, and are never redistributed by it.
The versions are pinned in [`package-lock.json`](package-lock.json).

## For checks and the website (GitHub Actions)

The workflows in [`.github/workflows/`](.github/workflows) run these actions on GitHub's servers. They
are referenced by commit, not copied into this repository.

| Action | Licence |
|---|---|
| `actions/checkout` | MIT |
| `actions/setup-node` | MIT |
| `actions/upload-pages-artifact` | MIT |
| `actions/deploy-pages` | MIT |

## To install the skill

`npx skills add shyhunter/LetMeShowYouSomething` uses the [`skills`](https://github.com/vercel-labs/skills)
installer, which is MIT-licensed (checked 2026-09-19). It is not part of this repository; you can also
copy the folder by hand.
