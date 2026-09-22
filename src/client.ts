// Browser half of @comecaramelos/dsh-custom-provider.
//
// A "No API key required" toggle mounted INSIDE every open, hand-declared
// provider editor of the Settings → Models section.
//
// The Models page registers two seats (`dsh-client-ui-settings-models`
// `src/client/slot-contract.ts`); `ModelsSection` dispatches
// `settings.models.provider-card` on every card that renders a directory row
// — keyed by `entryKey = settingsNs`, owner props exactly
// { provider, configured, keyConfigured }. The seat lands directly under the
// row head, OUTSIDE the `*_editor` container that `ProviderEditor` mounts
// while the card is open — and the plugin must live inside that editor. There
// is no seat inside `ProviderEditor` and it accepts no children, so the
// component keeps its live DOM hidden at the seat (an anchor marking which
// card it is) and positions the toggle host (`div.ccp_editorHost`) INSIDE the
// open editor: parked immediately AFTER the API-key field — the `*_field` that
// wraps a password `input`, falling back to just before the `*_editorActions`
// row if the key field is not mounted. A MutationObserver re-parks it on
// every subtree churn. The editor and its hashed class names belong to the
// page and re-mount freely (the page's own DOM is never re-styled), while the
// observer pattern is the one already proven for injected DOM by
// `dsh-hover-information`. While no editor is open the component draws
// nothing.
//
// The same seat component also carries the ROW STATUS DOT. The Models page
// draws its row dot only from a NAMED credential (`row.credential` — the
// page resolves one from `apiKeyEnv` or a derived `<ROUTE>_API_KEY`), so a
// hand-declared route whose only state is a non-empty `Authorization` header
// — the profile's own, a base-layer inheritance, or this plugin's
// placeholder — rides the wire correctly and still shows NO dot. The page,
// by design, reserves the dot to referenced credentials. This component
// supplies the missing signal: a `span.ccp_dot` parked inside the row-head
// identity block (`*_rowIdentity`, the span that holds the row name and the
// `custom` tag), as its last child — exactly where the page would have put
// its own dot. The condition is deliberately narrower than the toggle's and
// reads a different layer: the route must be hand-declared (`declared`), and
// the RESOLVED (`value`) profile — what actually rides the wire, user writes
// folded in, base layer included — must carry a non-empty `Authorization`
// under any casing. `keyConfigured` decides nothing (the key fact and the
// header fact are distinct), and no write is involved: this half is pure
// observation. When the row already shows the page's own credential dot
// (configured OR missing — either is "this row has a named credential and
// already speaks for itself"), ours is omitted: never two indicators. The
// churn observer re-parks the dot on every row re-map and retires it when
// the condition or the page dot shows up.
//
// Why the toggle exists: a hand-declared route (api=openai-completions) that
// is saved without a credential fails at request time, not at connection
// time — `@earendil-works/pi-ai` throws `No API key for provider: <route>` in
// openai-completions.js whenever `options.apiKey` is empty and `options`
// carries no non-empty `authorization` header. A profile header is the one
// fact that satisfies that check: profile headers apply last and override
// the derived `Bearer <key>`, and a profile that names no `apiKeyEnv` renders
// no status dot on the row — so today the card looks ready while every
// request dies. Writing `Authorization: Bearer none` into the profile's user
// layer makes those requests pass for gateways and self-hosted endpoints that
// ignore authentication. An endpoint that actually demands a key is not
// served by this toggle: the placeholder credential simply gets a 401 back.
//
// Writes ride the adapter namespace through the Host `settingsScope` service
// — there are no page operations visible to registrants
// (createModelsOperations is page-internal) and bundle purity forbids value
// imports from the Models package. Both directions are per-key path
// operations:
//   ON   set   ["providers", <route>, "headers", "Authorization"] = "Bearer none"
//   OFF  unset ["providers", <route>, "headers", "Authorization"]
// The per-key `unset` is deliberate: clearing the whole `headers` object
// would wipe any other header the user maintains by hand, and a set of the
// whole object would too. The scope fences every mutation with the namespace
// revision itself.
//
// Only cards with `provider.declared === true` ever render the toggle — the
// shipped adapters share this same `llm-pi-ai` namespace and own their own
// credential flow — never while `keyConfigured` (the credential flow is the
// correct one then) and never on a dormant row. The hand-declared draft card
// dispatches the slot nothing until it is saved, so the toggle never appears
// in the create form.
//
// Styling never references the Models page's hashed CSS-module class names
// (they churn every rebuild); classes are matched only by their stable
// un-hashed SUFFIX (`*_editor`, `*_field`, `*_editorActions`), and the view
// brings its own `ccp_*` styles through a `data-plugin-css` tag.
//
// The types below are local and structural on purpose: the scope snapshot and
// the path ops are described by their Host contracts, and the page-owned DOM
// is only ever matched by its stable class suffix — a structural DOM type
// would claim more than this half is allowed to depend on.
window.__ModuleLoader__.load({
    id: "@comecaramelos/dsh-custom-provider",
    factory: function (require) {
        var module = { exports: {} as Record<string, any> };
        var exports = module.exports;
        Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

        var react = require("react");
        var reactJsx = require("react/jsx-runtime");
        var Fragment = reactJsx.Fragment;

        // Shell toggle primitive when the surface resolves it; the component
        // falls back to a plain checkbox only when it does not.
        var Switch: any = null;
        try {
            var primitives = require("@deepseek-ai/dsh-client-ui-primitives");
            Switch = (primitives && primitives.Switch) || null;
        } catch (error) {
            Switch = null;
        }

        /** One `SettingsPathOpView` mutation, addressed to a single path. */
        type SettingsPathOp = { op: "set"; path: string[]; value?: string } | { op: "unset"; path: string[] };

        /** The hand-written request headers of one profile. */
        interface ProfileHeaderMap {
            [name: string]: string;
        }

        /** The user layer of the namespace document (the layer that marks a header configured). */
        interface UserLayer {
            providers?: Record<string, { headers?: unknown } | undefined> | undefined;
        }

        /** The Host scope snapshot: `user` is the layer read, `value` rides the adapter base profiles. */
        interface ScopeSnapshot {
            status?: string;
            value?: unknown;
            user?: UserLayer | undefined;
            revision?: number | undefined;
            writable?: boolean | undefined;
        }

        /** The `value`-layer profile of one route: what rides the wire, not what was stored. */
        interface ResolvedProfile {
            headers?: unknown;
        }

        /** The Host `settingsScope` service bound to one namespace. */
        interface SettingsScope {
            getSnapshot(): ScopeSnapshot | undefined;
            subscribe(listener: () => void): () => void;
            mutate(ops: SettingsPathOp[]): Promise<unknown>;
        }

        /** The owner props the `settings.models.provider-card` seat dispatches with. */
        interface ProviderOwner {
            provider?: { provider?: string | undefined; declared?: boolean | undefined } | undefined;
            configured?: boolean | undefined;
            keyConfigured?: boolean | undefined;
        }

        /** Props of the toggle view rendered inside the editor host. */
        interface ToggleViewProps {
            active?: boolean | undefined;
            writable?: boolean | undefined;
            conflict?: boolean | undefined;
            failure?: string | null | undefined;
            onToggle: (checked: boolean) => void;
        }

        /** Props of the seat component: the owner props plus the bound scope. */
        interface NoApiKeyToggleCardProps extends ProviderOwner {
            scope: SettingsScope;
        }

        /** Browser services consumed by this half (`slots` is wrapped in by the web runner). */
        var inject: string[] = ["settingsScope", "slots"];

        /** The pi-ai adapter's settings namespace — the family this card claims. */
        var SETTINGS_NS = "llm-pi-ai";
        /** Header pi-ai accepts in place of a key, and the placeholder value written. */
        var NO_KEY_HEADER = "Authorization";
        var NO_KEY_VALUE = "Bearer none";
        /** Page-local editor classes, matched by their un-hashed suffix. */
        var EDITOR_CLASS_END = "_editor";
        var EDITOR_ACTIONS_CLASS_END = "_editorActions";
        /** The key-input field: a `*_field` block that wraps the password box. */
        var EDITOR_FIELD_CLASS_END = "_field";
        /** Page-local row classes, matched by their un-hashed suffix. */
        var ROW_IDENTITY_CLASS_END = "rowIdentity";
        /**
         * The page's own credential indicator (its `credentialDotConfigured`
         * / `credentialDotMissing` states ride on this base class, which only
         * the dots themselves carry).
         */
        var CREDENTIAL_DOT_CLASS_END = "credentialDot";

        var COPY: Record<string, string> = {
            label: "No API key required",
            configured: "No-API-key request header configured",
            hint: 'Disables API key input and sets up the profile so keyless endpoints pass key check.',
            conflict: 'A custom Authorization header is already set on this provider. Clear it in the profile settings to use this toggle.',
            readOnly: "Settings are read-only in this deployment.",
            failed: "The settings write was rejected; the profile was left unchanged.",
            dotAuthorizationConfigured: "Authorization header configured"
        };

        var CSS =
            ".ccp_editorHost{display:flex;flex-direction:column;gap:2px}" +
            ".ccp_dot{display:inline-block;flex:none;width:8px;height:8px;border-radius:50%;background:var(--dsw-alias-state-success-primary)}" +
            ".ccp_anchor{display:none}" +
            ".ccp_line{align-items:center;gap:8px;display:flex}" +
            ".ccp_value{color:var(--dsw-alias-label-secondary);border:0;background:0 0;padding:0;font-size:12px}" +
            ".ccp_hint{color:var(--dsw-alias-label-tertiary);margin:0;font-size:12px;line-height:1.5}" +
            ".ccp_warning{color:var(--dsw-alias-label-error);margin:0;font-size:12px}";
        var CSS_TAG = "@comecaramelos/dsh-custom-provider/NoApiKeyToggle.module.css";
        var cssInstalled = false;
        function ensureCss(doc: Document): void {
            if (cssInstalled) return;
            if (doc.querySelector('style[data-plugin-css="' + CSS_TAG + '"]') !== null) {
                cssInstalled = true;
                return;
            }
            var tag = doc.createElement("style");
            tag.dataset.plugin = "@comecaramelos/dsh-custom-provider";
            tag.dataset.pluginCss = CSS_TAG;
            tag.textContent = CSS;
            doc.head.appendChild(tag);
            cssInstalled = true;
        }

        function noop(): void {}

        // ── pure read/write surface (the test module) ─────────────────────────

        /**
         * The hand-written request headers of one route's user-layer profile.
         * Presence in the user layer is what marks the header configured; the
         * resolved `value` would ride the adapter's base profiles and could
         * show a header the user never stored.
         * @param snapshot - the namespace scope snapshot.
         * @param route - the provider route id.
         * @returns the header map, or undefined when the route names none.
         */
        function profileHeaders(snapshot: ScopeSnapshot | undefined, route: string): ProfileHeaderMap | undefined {
            var user = snapshot && snapshot.user;
            var profile = user && user.providers && user.providers[route];
            var headers = profile && profile.headers;
            if (!headers || typeof headers !== "object" || Array.isArray(headers)) return undefined;
            return headers as ProfileHeaderMap;
        }

        /**
         * Whether the no-key placeholder header stands on this route. Only the
         * exact value counts; an `Authorization` the user typed themselves is
         * not this toggle's state.
         */
        function isNoKeyActive(snapshot: ScopeSnapshot | undefined, route: string): boolean {
            var headers = profileHeaders(snapshot, route);
            return !!headers && headers[NO_KEY_HEADER] === NO_KEY_VALUE;
        }

        /**
         * Whether the route carries an `Authorization` header with some other
         * value. That header already wins the `authorization` check and is the
         * user's own configuration — this toggle neither claims nor overwrites
         * it, so the view must stay off and disabled with the reason shown.
         * The value itself is never read out (it can be a real key).
         */
        function hasForeignAuthorization(snapshot: ScopeSnapshot | undefined, route: string): boolean {
            var headers = profileHeaders(snapshot, route);
            return !!headers && Object.prototype.hasOwnProperty.call(headers, NO_KEY_HEADER) && headers[NO_KEY_HEADER] !== NO_KEY_VALUE;
        }

        /**
         * The profile of one route in the RESOLVED (`value`) layer: the
         * document that actually rides the wire — user writes folded in,
         * composed over the base layer. The toggle reads the `user` layer for
         * its own state; the row dot reads this layer, because what matters
         * is what the adapter SENDS (a header inherited from `base` counts).
         * @param snapshot - the namespace scope snapshot.
         * @param route - the provider route id.
         * @returns the profile, or `undefined` when the route names none.
         */
        function resolvedProfile(snapshot: ScopeSnapshot | undefined, route: string): ResolvedProfile | undefined {
            var value = snapshot && snapshot.value;
            if (!value || typeof value !== "object") return undefined;
            var providers = (value as { providers?: unknown }).providers;
            if (!providers || typeof providers !== "object") return undefined;
            var profile = (providers as Record<string, unknown>)[route];
            return profile && typeof profile === "object" ? (profile as ResolvedProfile) : undefined;
        }

        /**
         * Whether a resolved profile carries a NON-EMPTY `Authorization`
         * header, spelled in any casing. This is exactly what pi-ai's key
         * check accepts on the wire (`getClientApiKey` in
         * `openai-completions.js`), so it is the single fact the row dot
         * reports. The value itself is never read out — it can be a real
         * credential.
         */
        function headerConfigured(profile: ResolvedProfile | undefined): boolean {
            var headers = profile && profile.headers;
            if (!headers || typeof headers !== "object" || Array.isArray(headers)) return false;
            var names = Object.keys(headers as Record<string, unknown>);
            for (var i = 0; i < names.length; i++) {
                if (names[i].toLowerCase() === "authorization") {
                    var value = (headers as Record<string, unknown>)[names[i]];
                    return typeof value === "string" && value.trim().length > 0;
                }
            }
            return false;
        }

        /**
         * Whether the row earns the plugin's own dot. The gate is narrower
         * than the toggle's and shallower than it looks: a hand-declared
         * route (never decorate shipped adapters) whose RESOLVED profile
         * authenticates by header. `keyConfigured` decides nothing — the
         * referenced-key fact and the own-header fact are distinct, and a
         * key-configured row still lights it only when the page shows no dot
         * of its own (the DOM check in `positionDot` never parks two). Pure
         * observation: nothing here writes.
         */
        function showDot(owner: ProviderOwner | undefined, snapshot: ScopeSnapshot | undefined): boolean {
            var provider = owner && owner.provider;
            if (!(provider && provider.declared === true && typeof provider.provider === "string" && provider.provider.length > 0)) {
                return false;
            }
            if (!(snapshot && snapshot.status === "ready")) return false;
            return headerConfigured(resolvedProfile(snapshot, provider.provider));
        }

        /** One whole-map `unset` would erase headers the user keeps by hand, so writes address the single key. */
        function noKeyPath(route: string): string[] {
            return ["providers", route, "headers", NO_KEY_HEADER];
        }

        /** Ops that turn the route keyless: a per-key set creates the headers map as needed. */
        function configureOps(route: string): SettingsPathOp[] {
            return [{ op: "set", path: noKeyPath(route), value: NO_KEY_VALUE }];
        }

        /** Ops that restore the stock flow: clears this header only, keeping any other. */
        function clearOps(route: string): SettingsPathOp[] {
            return [{ op: "unset", path: noKeyPath(route) }];
        }

        /**
         * Whether the seat's owner props call for the toggle: a hand-declared
         * route (the shipped adapters own their credential flow), with a
         * profile that resolves, and no confirmed credential — a row that can
         * already authenticate should keep that path, not be forced through
         * headers.
         */
        function showToggle(owner: ProviderOwner | undefined): boolean {
            var provider = owner && owner.provider;
            return !!(provider && provider.declared === true && owner!.configured === true && owner!.keyConfigured === false);
        }

        /**
         * Whether `element`'s class list carries a hashed page-local class
         * whose name ENDS with `suffix` — so matching `_editor` never matches
         * the `*_editorActions` children. Only the suffix
         * is stable across rebuilds; the hash prefix is ignored.
         */
        function hasClassEnding(element: any, suffix: string): boolean {
            var cls = (element && element.className) || "";
            if (typeof cls !== "string" || cls.indexOf(suffix) < 0) return false;
            var tokens = cls.split(/\s+/);
            for (var i = 0; i < tokens.length; i++) {
                if (tokens[i].length > suffix.length && tokens[i].slice(-suffix.length) === suffix) return true;
            }
            return false;
        }

        /**
         * The mounted editor container inside `root`, located by class suffix
         * rather than by hashed name; `null` while no editor stands open.
         */
        function findEditorWithin(root: any): any {
            if (!root || typeof root.querySelectorAll !== "function") return null;
            var nodes = root.querySelectorAll("[class]");
            for (var i = 0; i < nodes.length; i++) {
                if (hasClassEnding(nodes[i], EDITOR_CLASS_END)) return nodes[i];
            }
            return null;
        }

        /** The editor's own action row (`*_editorActions`) when mounted inside `editor`. */
        function findActionsWithin(editor: any): any {
            if (!editor || typeof editor.querySelectorAll !== "function") return null;
            var nodes = editor.querySelectorAll("[class]");
            for (var i = 0; i < nodes.length; i++) {
                if (hasClassEnding(nodes[i], EDITOR_ACTIONS_CLASS_END)) return nodes[i];
            }
            return null;
        }

        /**
         * The editor's API-key field: a `*_field` block that wraps a password
         * input (the page's key input renders as `type: "password"`; route or
         * URL fields never do). `null` while the key block is not mounted.
         */
        function findKeyFieldWithin(editor: any): any {
            if (!editor || typeof editor.querySelectorAll !== "function") return null;
            var fields = editor.querySelectorAll("[class]");
            for (var i = 0; i < fields.length; i++) {
                if (!hasClassEnding(fields[i], EDITOR_FIELD_CLASS_END)) continue;
                if (fields[i].querySelectorAll("input[type=\"password\"]").length > 0) return fields[i];
            }
            return null;
        }

        /**
         * Find the page's password input inside the editor and mark it
         * disabled — so the user cannot type while the no-key header is set.
         * Called from the MutationObserver so it survives React re-renders.
         * @param editor - the editor container.
         * @param active - whether the toggle is on (true = disable, false = re-enable).
         */
        function disablePasswordInput(editor: any, active: boolean | undefined): void {
            if (!editor || typeof editor.querySelectorAll !== "function") return;
            var inputs = editor.querySelectorAll("input[type=\"password\"]");
            for (var i = 0; i < inputs.length; i++) {
                inputs[i].disabled = active === true;
            }
        }

        /**
         * Park `host` directly AFTER the editor's API-key field — the toggle
         * then reads as a continuation of the credential block. With the key
         * field absent (still mounting) it falls back to the action row, or to
         * the editor's end. Idempotent against the page's re-renders, so the
         * churn observer can replay it; detached when no editor stands.
         * @param host - this card's toggle host element.
         * @param card - the row's `li` subtree.
         * @param active - whether the no-key header is set (disables the password input).
         * @returns the element it was parked in, or `null` when left detached.
         */
        function positionHost(host: any, card: any, active?: boolean): any {
            var editor = findEditorWithin(card);
            if (!editor) {
                if (host.isConnected) host.remove();
                return null;
            }
            var keyField = findKeyFieldWithin(editor);
            if (keyField && keyField.parentElement) {
                var parent = keyField.parentElement;
                // Already parked directly behind the key block? Then stand
                // still — comparing against the key field's OWN next sibling
                // would re-target the host onto itself.
                if (host.parentElement !== parent || keyField.nextSibling !== host) {
                    parent.insertBefore(host, keyField.nextSibling || null);
                }
                disablePasswordInput(editor, active);
                return parent;
            }
            var actions = findActionsWithin(editor);
            if (actions) {
                if (host.parentElement !== editor || host.nextSibling !== actions) editor.insertBefore(host, actions);
            } else if (host.parentElement !== editor) {
                editor.appendChild(host);
            }
            disablePasswordInput(editor, active);
            return editor;
        }

        // ── the row-head status dot placement ─────────────────────────────

        /**
         * The row-identity block (`*_rowIdentity`) inside `root` (the row's
         * `li`): the page's own head span that holds `rowName`, the `custom`
         * `rowTag` and, for referenced credentials, the credential dot.
         * `null` when the row head is not mounted.
         */
        function findRowIdentityWithin(root: any): any {
            if (!root || typeof root.querySelectorAll !== "function") return null;
            var nodes = root.querySelectorAll("[class]");
            for (var i = 0; i < nodes.length; i++) {
                if (hasClassEnding(nodes[i], ROW_IDENTITY_CLASS_END)) return nodes[i];
            }
            return null;
        }

        /**
         * Whether the row head already draws the page's own credential dot.
         * The dot spans carry the base `credentialDot` class and a state
         * token (`…Configured` green, `…Missing` amber); matching the base
         * catches either. A row that already speaks through a referenced
         * credential has its own indicator — parking ours beside it would
         * double the signal, so any dot (green OR amber) suppresses ours.
         */
        function hasCredentialDotWithin(identity: any): boolean {
            if (!identity || typeof identity.querySelectorAll !== "function") return false;
            var nodes = identity.querySelectorAll("[class]");
            for (var i = 0; i < nodes.length; i++) {
                if (hasClassEnding(nodes[i], CREDENTIAL_DOT_CLASS_END)) return true;
            }
            return false;
        }

        /**
         * Park `host` inside the row-identity block as its last child — the
         * very spot where the page draws its own credential dot, right after
         * the name and the `custom` tag. Detached when no identity is
         * mounted or when the page's own dot stands (also caught here, so a
         * churn replay retires ours the moment the page starts showing its
         * indicator). Idempotent against the page's re-maps.
         * @param host - this card's dot host element.
         * @param card - the row's `li` subtree.
         * @returns the block it was parked in, or `null` when left detached.
         */
        function positionDot(host: any, card: any): any {
            var identity = findRowIdentityWithin(card);
            if (!identity) {
                if (host.isConnected) host.remove();
                return null;
            }
            if (hasCredentialDotWithin(identity)) {
                if (host.isConnected) host.remove();
                return null;
            }
            if (host.parentElement !== identity) identity.appendChild(host);
            return identity;
        }

        // ── the view rendered inside the editor host ──────────────────────────

        /**
         * The toggle's DOM (the body half): the control and, while configured,
         * a read-only view of the header it writes. Stateless on
         * purpose: the card component owns the snapshot, the failure draft,
         * and the write calls.
         */
        function ToggleView(props: ToggleViewProps): any {
            var active = props.active === true;
            var conflict = props.conflict === true;
            var disabled = props.writable !== true || conflict;
            var control = Switch ? (
                (0, reactJsx.jsx)(Switch, {
                    checked: active,
                    disabled: disabled,
                    label: COPY.label,
                    onChange: function (checked: boolean) {
                        props.onToggle(checked === true);
                    }
                })
            ) : (
                (0, reactJsx.jsxs)("label", {
                    children: [
                        (0, reactJsx.jsx)("input", {
                            type: "checkbox",
                            checked: active,
                            disabled: disabled,
                            "aria-label": COPY.label,
                            onChange: function (event: any) {
                                props.onToggle(!!(event && event.target && event.target.checked));
                            }
                        }),
                        (0, reactJsx.jsx)("span", { children: COPY.label })
                    ]
                })
            );
            var failure = props.failure || null;
            return (0, reactJsx.jsxs)(Fragment, {
                children: [
                    (0, reactJsx.jsxs)("div", {
                        className: "ccp_line",
                        children: [
                            control,
                            active ? (
                                (0, reactJsx.jsx)("input", {
                                    className: "ccp_value",
                                    value: NO_KEY_HEADER + ": " + NO_KEY_VALUE,
                                    disabled: true,
                                    readOnly: true,
                                    tabIndex: -1,
                                    "aria-label": COPY.configured
                                })
                            ) : null
                        ]
                    }),
                    props.writable ? null : (0, reactJsx.jsx)("p", { className: "ccp_warning", children: COPY.readOnly }),
                    failure
                        ? (0, reactJsx.jsx)("p", { className: "ccp_warning", children: failure })
                        : conflict
                          ? (0, reactJsx.jsx)("p", { className: "ccp_warning", children: COPY.conflict })
                          : (0, reactJsx.jsx)("p", { className: "ccp_hint", children: COPY.hint })
                ]
            });
        }

        // ── the seat component ────────────────────────────────────────────────

        /**
         * One provider-card seat occurrence. It renders inside a hidden
         * anchor — which marks "which card this is" — two hosts: the
         * toggle view (`div.ccp_editorHost`, DOM-moved into the open
         * `*_editor` right after the API-key field) and the row status dot
         * (`span.ccp_dot`, DOM-moved into the row-head identity block
         * (`*_rowIdentity`), the very spot where the page parks its own
         * credential dot — ours only when that page dot is absent). The host
         * DOM lives in React's tree but is DOM-moved by the churn observer
         * below (the runner's `react` shim has no portal, and moving our own
         * subtree is safe: React updates nodes by reference wherever they
         * stand). Reads come from the scope snapshot (every pushed
         * `settings/document-updated` lands as a new snapshot and
         * re-renders): the toggle state and conflict guard read the `user`
         * layer, the dot reads the resolved `value` layer. Writes go through
         * the scope's fenced mutation queue — and only for the toggle; the
         * dot never writes.
         */
        function NoApiKeyToggleCard(props: NoApiKeyToggleCardProps): any {
            var scope = props.scope;

            var subscribe = (0, react.useMemo)(
                function (): (listener: () => void) => () => void {
                    return function (listener) {
                        return scope.subscribe(listener);
                    };
                },
                [scope]
            );
            var snapshot: ScopeSnapshot | undefined = (0, react.useSyncExternalStore)(
                subscribe,
                function (): ScopeSnapshot | undefined {
                    return scope.getSnapshot();
                },
                function (): ScopeSnapshot | undefined {
                    return scope.getSnapshot();
                }
            );
            var failurePair: [string | null, (value: string | null) => void] = react.useState(null);
            var failure = failurePair[0];
            var setFailure = failurePair[1];
            var anchorRef = react.useRef(null);
            var hostRef = react.useRef(null);
            var dotRef = react.useRef(null);

            var visible = showToggle(props);
            var dot = showDot(props, snapshot);
            var route = visible ? props.provider!.provider || "" : "";
            var ready = !!snapshot && snapshot.status === "ready";
            var active = visible && ready && isNoKeyActive(snapshot, route);
            var writable = ready && snapshot!.writable === true;
            var conflict = visible && ready && hasForeignAuthorization(snapshot, route);

            // Park both hosts where they belong and keep them there across
            // the page's own re-mounts: the editor host inside the open
            // `*_editor` card, the status dot inside the row identity. Every
            // subtree churn re-attaches (or retires) the same host nodes.
            react.useEffect(
                function (): () => void {
                    if ((!visible && !dot) || typeof MutationObserver !== "function" || typeof document === "undefined") return noop;
                    function cardOf(): any {
                        var anchor = anchorRef.current;
                        return anchor && anchor.isConnected && typeof anchor.closest === "function" ? anchor.closest("li") : null;
                    }
                    function position(): void {
                        var card = cardOf();
                        var host = hostRef.current;
                        if (host) positionHost(host, card, active);
                        var dotHost = dotRef.current;
                        if (dotHost) positionDot(dotHost, card);
                    }
                    position();
                    var observer = new MutationObserver(function () {
                        position();
                    });
                    var card = cardOf();
                    if (card) observer.observe(card, { childList: true, subtree: true });
                    return function () {
                        observer.disconnect();
                        var host = hostRef.current;
                        if (host && host.isConnected) host.remove();
                        var dotHost = dotRef.current;
                        if (dotHost && dotHost.isConnected) dotHost.remove();
                    };
                },
                [visible, active, dot]
            );

            function commit(ops: SettingsPathOp[]): void {
                Promise.resolve()
                    .then(function () {
                        return scope.mutate(ops);
                    })
                    .then(
                        function () {
                            setFailure(null);
                        },
                        function () {
                            setFailure(COPY.failed);
                        }
                    );
            }
            function onToggle(checked: boolean): void {
                if (conflict) return;
                if (checked === active) return;
                commit(checked ? configureOps(route) : clearOps(route));
            }

            return (0, reactJsx.jsx)("div", {
                ref: anchorRef,
                className: "ccp_anchor",
                "aria-hidden": "true",
                children: [
                    visible
                        ? (0, reactJsx.jsx)("div", {
                            ref: hostRef,
                            className: "ccp_editorHost",
                            children: (0, reactJsx.jsx)(ToggleView, { active: active, writable: writable, conflict: conflict, failure: failure, onToggle: onToggle })
                        })
                        : null,
                    dot
                        ? (0, reactJsx.jsx)("span", {
                            ref: dotRef,
                            className: "ccp_dot",
                            role: "img",
                            "aria-label": COPY.dotAuthorizationConfigured,
                            title: COPY.dotAuthorizationConfigured
                        })
                        : null
                ]
            });
        }

        /**
         * Mount: bind one scope over the adapter's namespace (binding never
         * touches the wire) and claim the provider-card seat through the
         * slot-injection ledger so the ledger order is the Host's problem, not
         * ours.
         */
        function apply(ctx: any): () => void {
            if (!ctx.settingsScope || !ctx.slots || typeof ctx.slots.inject !== "function") return noop;
            if (typeof document !== "undefined") ensureCss(document);
            return ctx.effect(function (): any {
                var scope: SettingsScope | undefined;
                try {
                    scope = ctx.settingsScope.bind({ namespace: SETTINGS_NS });
                } catch (error) {
                    return noop;
                }
                return ctx.slots.inject("settings.models.provider-card", function () {
                    return ctx.slots.register(
                        {
                            name: "settings.models.provider-card",
                            // Every card of this adapter family dispatches with
                            // entryKey = settingsNs; hand-declared routes live
                            // in this namespace, which is the family claimed.
                            key: SETTINGS_NS,
                            inject: function () {
                                return { scope: scope };
                            }
                        },
                        NoApiKeyToggleCard
                    );
                });
            }, "custom-provider: models card");
        }

        exports.apply = apply;
        exports.NoApiKeyToggleCard = NoApiKeyToggleCard;
        exports.ToggleView = ToggleView;
        exports.profileHeaders = profileHeaders;
        exports.isNoKeyActive = isNoKeyActive;
        exports.hasForeignAuthorization = hasForeignAuthorization;
        exports.resolvedProfile = resolvedProfile;
        exports.headerConfigured = headerConfigured;
        exports.showDot = showDot;
        exports.configureOps = configureOps;
        exports.clearOps = clearOps;
        exports.showToggle = showToggle;
        exports.noKeyPath = noKeyPath;
        exports.hasClassEnding = hasClassEnding;
        exports.findEditorWithin = findEditorWithin;
        exports.findActionsWithin = findActionsWithin;
        exports.findKeyFieldWithin = findKeyFieldWithin;
        exports.positionHost = positionHost;
        exports.findRowIdentityWithin = findRowIdentityWithin;
        exports.hasCredentialDotWithin = hasCredentialDotWithin;
        exports.positionDot = positionDot;
        exports.inject = inject;
        exports.SETTINGS_NS = SETTINGS_NS;
        exports.NO_KEY_HEADER = NO_KEY_HEADER;
        exports.NO_KEY_VALUE = NO_KEY_VALUE;
        return exports;
    }
});
