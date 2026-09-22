# AGENTS.md — @comecaramelos/dsh-custom-provider

## What this is

A pure-browser DSH plugin (**TypeScript**, `src/*.ts` compiled into `lib/`)
that adds a "No API key required" toggle to saved hand-declared provider cards
in Settings → Models, and lights a row status dot on any hand-declared row
whose profile authenticates through a non-empty `Authorization` header. The
whole feature is web-plane; the host half is inert.

## Layout

```
package.json       # dsh bundle patch + dsh.client (platform: web) manifest; `npm test` = build + node --test
cordis.patch.yml   # profile row: registers `custom-provider` so the bundle loads (config {} is inert)
tsconfig.json          # host half: strict, NodeNext, declarations → lib/index.js + .d.ts
tsconfig.client.json   # browser half: ESNext + DOM, loose strictness → lib/client.js
src/index.ts       # inert host half (no services, no settings section)
src/client.ts      # the whole feature: slot registration + toggle component + row status dot
src/browser.d.ts   # ambient `window.__ModuleLoader__` typing for the bundle
test/*.test.mjs    # pure-logic tests through a stubbed module loader and React
docs/development-plan.md  # verified API notes (the source of truth for the contracts below)
docs/authorization-dot-plan.md  # the row status dot: verified plan, complements the above
```

`lib/` is **generated** (git-ignored): `npm run build` regenerates it, and the
link-based smoke check needs it present. Never hand-edit a file under `lib/`.

## Contracts the code depends on (verified against the installed tree)

- **Slot seat.** `settings.models.provider-card` is declared by
  `@deepseek-ai/dsh-client-ui-settings-models` (`src/client/slot-contract.ts`);
  `ModelsSection` dispatches it on every card that renders a directory row,
  keyed by `entryKey = row.entry.settingsNs`, with owner props exactly
  `{ provider, configured, keyConfigured }`. The hand-declared *draft* card
  dispatches nothing until saved — that is why the toggle only exists on saved
  rows. The footer seat exists too; this plugin does not use it.
- **Editor hosting.** The seat lands above the row head, outside the
  `*_editor` container that `ProviderEditor` mounts while the card is open —
  and the toggle must live inside that editor. The editor owns no slot and
  takes no children, so the component renders at the seat as a hidden
  anchor (`div.ccp_anchor`, `display: none`) plus TWO hosts DOM-moved
  **out** of it: the toggle view host (`div.ccp_editorHost`) parked
  immediately AFTER the API-key `*_field` (the field that wraps the password
  input — never the whole `headers` or the action row) **inside** the open
  `*_editor`, and the status-dot host (`span.ccp_dot`) parked inside the
  row's identity block (see *Row status dot* below). Re-parked via the same
  `MutationObserver` subscribed to the card's `li` subtree.
  No portal: the web runner's `react` external does not expose
  `createPortal`, and moving React-owned DOM is safe because React updates
  its nodes by reference. The DOM movement is idempotent (`positionHost`,
  `positionDot`) so churn between open/close/re-mount can be replayed.
  While no editor is open the toggle is not visible anywhere (the dot, living
  in the row head, is not editor-bound).
- **Namespace.** Hand-declared routes live in settings namespace `llm-pi-ai`,
  path `["providers", "<route>"]`. Shipped adapters share this namespace, so
  the extension must gate on `provider.declared === true` — otherwise it would
  decorate cards of the shipped surface.
- **Scope API.** Registration injects a Host `settingsScope` bound to
  `llm-pi-ai`: `getSnapshot()` → `{ status, value, user, revision, writable }`,
  `subscribe(listener)`, `mutate(ops)`. The **toggle**'s state reads come from
  the **user** layer (`snap.user.providers[route].headers`) because presence
  there is what marks the field configured by this card. The **row dot** reads
  the resolved **`value`** layer (`resolvedProfile` → `value.providers[route]
  .headers`) instead: what matters is what rides the wire, so a header folded
  in from the base layer counts. `mutate` fences with the namespace revision
  itself.
- **Writes.** Both directions are single-key path ops so hand-maintained
  foreign headers survive:
  ON `set ["providers", route, "headers", "Authorization"] = "Bearer none"`;
  OFF `unset ["providers", route, "headers", "Authorization"]`. Do not widen
  these to the whole `headers` object: it would erase unrelated user headers.
  `set`/`unset` are `SettingsPathOpView`. Addressing the single key is also
  what makes the Host write the value in the readable nested block form —
  `headers:\n  Authorization: Bearer none` — rather than replacing the map.
- **The bug being fixed.** `pi-ai`'s openai-completions path throws
  `No API key for provider: <route>` when `options.apiKey` is empty and no
  non-empty `authorization` header exists; profile headers apply last and
  override the derived `Bearer <key>`. `Authorization` is not a reserved
  Harness header, so the Host keeps it.
- **Row status dot.** `ModelsSection` renders its row dot only for rows whose
  `row.credential` is defined (profiles that reference an `apiKeyEnv`); a
  header-only profile gets no page indicator by design. The component's second
  host (`span.ccp_dot`, `role="img"`) lives inside the page's `div.rowHead >
  span.rowIdentity` — located by the un-hashed suffixes `rowIdentity` (and it
  is retired whenever the identity block is not mounted, or carries the page's
  own `credentialDot*` span, green or amber: never two indicators). The rule
  (`showDot`): `declared` route + `ready` snapshot + a NON-EMPTY string under
  any-case `authorization` in the RESOLVED profile. The dot is pure
  observation: no write, and the header's value is never read out or
  displayed. No separate registration: the dot host rides the same component,
  and the same `MutationObserver` re-parks it on churn.

## Invariants

1. **Never reference hashed page CSS class names** (`zGbnIq_*` churn every
   build). Styles are the plugin's own `ccp_*` classes injected via a
   `style[data-plugin-css=...]` tag.
2. **Bundle purity**: no value imports from sibling packages — only types are
   documented here; cross-plugin collaboration runs through the Host services
   (`settingsScope`, `slots`).
3. **The toggle's** gating: `keyConfigured === true` or `configured === false`
   or `!declared` → render no toggle (the credential flow, or nothing, is
   correct there). The row dot is NOT gated this way — it stands on any
   declared row whose resolved profile carries a non-empty `Authorization`,
   regardless of the key facts.
4. The plugin disables the page's password input via the MutationObserver
   when the toggle is active, so React re-mounts don't re-enable it.
5. Host half stays inert: the toggle reads/writes the adapter's namespace;
   installing a plugin-owned settings section would fork state.
6. A profile `Authorization` holding any other value than `Bearer none` is
   the user's own configuration: the **toggle** renders OFF and **disabled**
   with the reason (`hasForeignAuthorization`), and writes nothing in either
   direction (also guarded in `onToggle`). The row **dot** still lights for
   that header (it reports the wire fact) — but never displays or reads the
   value out: it can be a real credential.
7. **`lib/` is output, not source.** Only `src/*.ts` is edited; the two
   tsconfigs map one source file per half, and the emitted bundle must stay a
   self-registering `window.__ModuleLoader__.load({ id, factory })` call with
   no static imports (the loader supplies `react`/`react/jsx-runtime`).
8. **Local structural types only.** The Host contracts (`ScopeSnapshot`,
   `SettingsPathOp`, the seat owner props) are declared inside the factory in
   `src/client.ts` — no type imports from host packages, and no DOM typing for
   the page-owned nodes (they are matched by class *suffix*, so a structural
   DOM type would claim more than the contract allows).
9. **The row dot never writes.** It is pure observation (the only writer of
   `Authorization` is the editor toggle, or the user). If the page already
   draws its own `credentialDot*` in the identity block, the plugin host is
   retired — and if the identity block is not mounted (the row was removed,
   or churn is mid-map) the host stays detached, never re-parked by force.

## Testing

`npm test` runs `npm run build && node --test` — the tests import the emitted
`lib/client.js`, so a build is always part of the run (edit `src/client.ts`,
never the output). Tests import that bundle
with a stubbed `window.__ModuleLoader__` and stubbed `react`/`react/jsx-runtime`
requires, then exercise the pure surface (`profileHeaders`, `isNoKeyActive`,
`configureOps`, `clearOps`, `showToggle`, and the dot trio `resolvedProfile`,
`headerConfigured`, `showDot`), the component tree, the `apply()`
slot claim, and the DOM placement (`hasClassEnding`, `findEditorWithin`,
`positionHost`, plus the row-head pair `findRowIdentityWithin` /
`positionDot`) against a fake DOM whose row head reproduces the page's
`rowIdentity` (and, when a case calls for it, a parked page `credentialDot`
span to prove the no-double-indicator rule). One family proves
**no-conflict with pre-existing values**: the ops are replayed against a
profile document that already carries foreign `headers` entries, so ON is
proven to add only the `Authorization` key and OFF to drop only that key.

- Indentation is spaces (`.editorconfig`); do not copy the tab style of
  sibling plugin repos.
- End-to-end host behavior is exercised manually against a real DSH host;
  see *Smoke check* below.

## Smoke check

Run against a real DSH host with the profile under test:

1. Build the bundle if `lib/` is missing (`npm install && npm run build`), then
   link this checkout: `dsh plugin --profile plugin-dev add
   link:<this-checkout>`.
2. In Settings → Models create a hand-declared `openai-completions` route,
   save without a key.
3. Expect: row without dot (no credential, no header); the closed card
   renders nothing visible (the toggle lives inside the open editor). Click
   **Edit**: the expanded `*_editor` shows the toggle immediately after the
   API-key field, and the password input is disabled. Toggle on → profile
   `providers.<route>.headers.Authorization === "Bearer none"`, **and the row
   now shows the plugin dot inside the row identity** (visible without opening
   the editor). Toggle off → key absent again, input re-enabled, dot retired.
4. With a typed `Authorization` of another value the **toggle** renders off
   and **disabled**, with the reason shown; neither direction writes. The
   **dot** still lights for that header (it reports the wire fact) — but
   shows no value.
5. With a profile that references an `apiKeyEnv` credential already
   configured (the page draws its own green dot), expect **no** plugin dot on
   the row: the page indicator stands alone — never two indicators.
