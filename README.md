# @comecaramelos/dsh-custom-provider

DSH plugin that adds a **"No API key required"** toggle to saved hand-declared
provider cards in **Settings → Models**, and lights a **green status dot** on
hand-declared rows whose profile authenticates through a non-empty
`Authorization` header (the toggle's placeholder or one you wrote yourself).

## Installation

```bash
dsh plugin add @comecaramelos/dsh-custom-provider
```

For development, link this checkout into your `web` profile (after
building the bundle once). The checkout is mounted from the source tree, never
from a published npm copy — if the same package is installed system-wide, keep
the link in the `web` profile and make sure it wins (see the guidance
in `~/.dsh/profiles/web/README.md`):

```bash
npm install
npm run build
dsh plugin --profile web add link:/path/to/dsh-custom-provider
```

## Usage

1. Open **Settings → Models** and save your custom provider (the create form
   itself has no toggle).
2. Open the saved provider's card so its editor expands — the toggle lives
   inside that editor (it is invisible while the card is closed).
3. Tick **No API key required** for endpoints that ignore authentication.
4. The row lights a green dot whenever its profile authenticates through a
   non-empty `Authorization` header — via the toggle, by inheritance, or one
   you typed yourself. The dot never touches the profile and never shows on
   top of the page's own credential dot (never two indicators).

## Development

```bash
npm install          # typescript + esbuild devDependencies
npm run build        # src/**/*.ts → lib/ (host: tsc; browser: tsc typecheck + esbuild bundle)
npm test             # builds, then node --test (pure logic through stubbed loader + React)
npm run dev          # tsc --watch
```

The tests drive the **emitted** `lib/client.js` through a stubbed module
loader, so the shipped artifact is what is verified.

---

[`CONTRIBUTING`](CONTRIBUTING.md) | [`LICENSE`](LICENSE.md)
