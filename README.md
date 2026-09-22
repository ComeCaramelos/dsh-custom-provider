# @comecaramelos/dsh-custom-provider

DSH plugin that adds a **"No API key required"** toggle to saved hand-declared
provider cards in **Settings → Models**, and lights a **green status dot** on
hand-declared rows whose profile authenticates through a non-empty
`Authorization` header (the toggle's placeholder or one you wrote yourself).

## Problem

A hand-declared custom provider (`api=openai-completions`) saved without any
key **fails when you send a request, not when you connect**: the `pi-ai`
adapter aborts with `No API key for provider: <route>` whenever the profile
carries no key and no non-empty `authorization` header. Until then the row
even renders **without any status dot** — the dot only appears for profiles
that reference an `apiKeyEnv` credential — so the card looks ready while every
request dies.

## Solution

On every saved hand-declared provider, inside the opened provider editor, a
**"No API key required"** checkbox that writes into the provider profile's
user layer:

```js
providers.<route>.headers.Authorization = "Bearer none"
```

That satisfies the adapter's check (profile headers apply last and override
the derived `Bearer <key>`, and a header with no valid key behind it counts as
"no credential"), so keyless **local / self-hosted endpoints and gateways that
ignore authentication** start working. Turning it off clears just that header
and restores the stock flow.

While active, the editor shows the configured `Authorization: Bearer none`
header in a read-only field.

> [!NOTE]
> This is a *local/placeholder* remedy. An endpoint that genuinely requires
> authentication will still reject the placeholder with a 401 — set a real key
> (or credential reference) in that case.

## Row status dot

The Models page draws its row dot only for profiles that **reference** a
credential (`apiKeyEnv`, or a derived `<ROUTE>_API_KEY`); a profile whose only
state is an `Authorization` header — written by this plugin, inherited, or
typed by hand — shows nothing, however healthy its requests. This plugin
supplies the missing signal: a `ccp_dot` green dot parked in the row head,
right where the page would put its own credential indicator.

The dot is pure observation — it never writes, never reads the header's value
back (it may be a real credential), and reports what the adapter actually
**sends** (the resolved profile, base layer included). It stands regardless of
the page's key dot — a configured key and a working header are distinct facts
— but when the page is already drawing its own credential dot on the row, the
plugin dot is omitted: never two indicators.

## What it deliberately does not do

- **Not on the create/draft card.** The hand-declared *add provider* draft has
  no profile yet, and its card never dispatches the extension slot before it
  is saved, so the toggle lives on saved rows only — save first, then toggle.
- **Not on shipped providers.** Cards the adapter ships itself own their
  credential flow; the toggle only claims rows flagged as hand-declared
  (`declared: true`).
- **Toggle silent while a key is configured.** A row with a confirmed API-key
  credential keeps the credential flow — the checkbox is never rendered on
  top of it. (The row status dot still reports an own-header configuration;
  it is not the credential indicator the page already draws.)
- **Never wipes your headers.** Both directions write/clear the single
  `Authorization` key inside the profile's `headers`, so any other header you
  maintain by hand survives.
- **Disabled over a hand-written `Authorization`.** If the profile already
  sets `Authorization` to any value other than the placeholder, that header
  is your own configuration — the toggle stays **off and disabled**, with a
  message explaining why, and neither direction touches it until you clear
  the header yourself.

## Installation

```bash
dsh plugin add @comecaramelos/dsh-custom-provider
```

For development, link this checkout into your `plugin-dev` profile (after
building the bundle once):

```bash
npm install
npm run build
dsh plugin --profile plugin-dev add link:/path/to/dsh-custom-provider
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

## Architecture

Pure browser plugin (TypeScript, `src/*.ts` compiled into `lib/` — `lib/` is
build output, edit `src/`) — see
[`docs/development-plan.md`](docs/development-plan.md) for the verified API
notes:

- Registers once into the Models page's `settings.models.provider-card` slot
  (`dsh-client-ui-settings-models`), keyed to the `llm-pi-ai` family via
  `entryKey = settingsNs`, through `ctx.slots.inject`.
- The slot lands on the row head, outside the editable `*_editor` element,
  so the component keeps a hidden anchor at the seat and DOM-moves **two**
  hosts out of it: the toggle view into the open editor (parked immediately
  after the API-key field, the `*_field` that wraps the password input), and
  the status dot into the row's identity block (the `*_rowIdentity` that
  holds name, tag, and the page's own credential dot). A `MutationObserver`
  re-parks both on every subtree churn. (The page's `react` bundle exposes no
  portal, and moving our own subtree is stable.) With the card closed the
  editor is not mounted, so the toggle draws nothing; the dot lives in the row
  head and stays put whether or not the editor is open.
- Reads and writes the adapter namespace through the Host `settingsScope`
  service — never through page internals or cross-plugin imports.
- Styling is injected as its own `data-plugin-css` tag; it never references
  the hashed class names of the Models page stylesheet.
- `src/index.ts` is an inert host stub (its bundle output is
  `lib/index.js`); the whole feature is web-plane.

## Development

```bash
npm install          # typescript devDependency
npm run build        # src/*.ts → lib/ (host + browser halves)
npm test             # builds, then node --test (pure logic through stubbed loader + React)
npm run dev          # tsc --watch
```

The tests drive the **emitted** `lib/client.js` through a stubbed module
loader, so the shipped artifact is what is verified.

See [`AGENTS.md`](AGENTS.md) for the codebase map.

## License

MIT
