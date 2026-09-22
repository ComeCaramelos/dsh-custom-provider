// @comecaramelos/dsh-custom-provider — logic tests.
//
// The browser half installs itself through `window.__ModuleLoader__.load`, so
// each run stubs the loader, imports lib/client.js once (which registers the
// factory), and drives that factory with a stub `require` for the React
// externals. The toggle lives inside the page-owned `*_editor` DOM and the
// row status dot inside the page-owned row head, so the placement logic
// (`hasClassEnding` / `findEditorWithin` / `positionHost`, plus
// `findRowIdentityWithin` / `positionDot`) is exercised against a minimal
// fake DOM, while the view halves (`ToggleView`, the dot host) are exercised
// as pure tree builders.

import assert from "node:assert/strict";
import test from "node:test";

// ── loader + React stubs ───────────────────────────────────────────────────

let loadedSpec = null;
globalThis.window = {
    __ModuleLoader__: {
        load(spec) {
            loadedSpec = spec;
        }
    }
};

const reactStub = {
    useMemo: (fn) => fn(),
    useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
    useState: (initial) => [initial, () => {}],
    useRef: () => ({ current: null }),
    useEffect: (fn) => {
        fn();
    },
    useCallback: (fn) => fn
};
// A stub JSX factory that also EXPANDS function components (the real renderer
// would call `ToggleView` etc.), so tree-walking tests see the leaf DOM.
function renderNode(type, props) {
    if (typeof type === "function") return type(props);
    return { type, props };
}
const jsxStub = {
    Fragment: "Fragment",
    jsx: renderNode,
    jsxs: renderNode
};

function requireStub(id) {
    if (id === "react") return reactStub;
    if (id === "react/jsx-runtime") return jsxStub;
    throw new Error("unexpected require: " + id);
}

await import("../lib/client.js");
assert.ok(loadedSpec, "the client half registered with the module loader");
assert.equal(loadedSpec.id, "@comecaramelos/dsh-custom-provider");
const plugin = loadedSpec.factory(requireStub);

// ── minimal fake DOM (editor placement) ────────────────────────────────────

class FakeNode {
    constructor(className = "", attrs = {}) {
        this.className = className;
        this.children = [];
        this.parentElement = null;
        this.isConnected = false;
        if (attrs.tag) this.tag = attrs.tag;
        if (attrs.type) this.type = attrs.type;
    }
    get nextSibling() {
        const index = this.parentElement ? this.parentElement.children.indexOf(this) : -1;
        return index >= 0 ? (this.parentElement.children[index + 1] ?? null) : null;
    }
    get lastChild() {
        return this.children.length > 0 ? this.children[this.children.length - 1] : null;
    }
    appendChild(node) {
        this.children.push(node);
        node.parentElement = this;
        node.isConnected = this.isConnected;
    }
    insertBefore(node, ref) {
        const index = ref ? this.children.indexOf(ref) : -1;
        if (index < 0) this.children.push(node);
        else this.children.splice(index, 0, node);
        node.parentElement = this;
        node.isConnected = this.isConnected;
    }
    remove() {
        if (this.parentElement) {
            this.parentElement.children = this.parentElement.children.filter((child) => child !== this);
        }
        this.parentElement = null;
        this.isConnected = false;
    }
    querySelectorAll(selector = "[class]") {
        const out = [];
        const wantsPassword = selector.indexOf("input[type=\"password\"]") >= 0;
        const walk = (node) => {
            for (const child of node.children) {
                const matches = wantsPassword ? child.tag === "input" && child.type === "password" : !!child.className;
                if (matches) out.push(child);
                walk(child);
            }
        };
        walk(this);
        return out;
    }
    querySelector(selector) {
        const found = this.querySelectorAll(selector);
        return found.length > 0 ? found[0] : null;
    }
}

function fakeCard() {
    // li > (rowHead > rowIdentity > rowName + rowTag[, page dot]) + editor.
    const li = new FakeNode("zGbnIq_rowCard");
    li.isConnected = true;

    // The page's own row head: name + `custom` tag, and (for referenced
    // credentials only) the credential dot — where the plugin parks its dot.
    const rowHead = new FakeNode("zGbnIq_rowHead");
    const rowIdentity = new FakeNode("zGbnIq_rowIdentity");
    const rowName = new FakeNode("zGbnIq_rowName");
    const rowTag = new FakeNode("zGbnIq_rowTag");
    rowIdentity.children.push(rowName, rowTag);
    for (const child of rowIdentity.children) child.parentElement = rowIdentity;
    rowHead.children.push(rowIdentity);
    rowIdentity.parentElement = rowHead;

    const editor = new FakeNode("zGbnIq_editor");
    const header = new FakeNode("zGbnIq_editorHeader");
    const title = new FakeNode("zGbnIq_editorTitle");
    header.children.push(title);
    title.parentElement = header;

    const keyField = new FakeNode("zGbnIq_field");
    const keyLabel = new FakeNode("zGbnIq_fieldLabel");
    const keyInput = new FakeNode("zGbnIq_input", { tag: "input", type: "password" });
    keyField.children.push(keyLabel, keyInput);
    keyLabel.parentElement = keyField;
    keyInput.parentElement = keyField;

    const route = new FakeNode("zGbnIq_editorRoute");
    const actions = new FakeNode("zGbnIq_editorActions");
    // Realistic DOM order: row head first, then editor — header, key field,
    // other fields…, actions last.
    editor.children.push(header, keyField, route, actions);
    for (const child of editor.children) child.parentElement = editor;
    li.children.push(rowHead, editor);
    for (const child of li.children) child.parentElement = li;
    connect(li);
    return { li, rowHead, rowIdentity, rowName, rowTag, editor, header, keyField, keyInput, actions, route };
}

/** The page's own credential dot, as ModelsSection mounts it (green by
 * default, amber for a missing referenced credential). */
function fakeCredentialDot(amber) {
    return new FakeNode("zGbnIq_credentialDot zGbnIq_credentialDot" + (amber ? "Missing" : "Configured"));
}

/** A row is mounted when its `li` stands connected; make the whole fake
 * subtree report that. */
function connect(node) {
    node.isConnected = true;
    for (const child of node.children) connect(child);
}

// ── plugin surface ─────────────────────────────────────────────────────────

test("registers under the adapter namespace and consumes the settings scope and slots", () => {
    assert.equal(plugin.SETTINGS_NS, "llm-pi-ai");
    assert.deepEqual(plugin.inject, ["settingsScope", "slots"]);
    assert.equal(typeof plugin.apply, "function");
});

// ── pure read/write helpers ────────────────────────────────────────────────

test("profileHeaders reads the user layer only, never the resolved value", () => {
    const snapshot = {
        status: "ready",
        user: { providers: { "ollama-local": { headers: { Authorization: "Bearer none" } } } },
        value: { providers: { other: {} } }
    };
    assert.deepEqual(plugin.profileHeaders(snapshot, "ollama-local"), { Authorization: "Bearer none" });
    assert.equal(plugin.profileHeaders(snapshot, "other"), undefined);
    assert.equal(plugin.profileHeaders(snapshot, "missing"), undefined);
    assert.equal(plugin.profileHeaders({ status: "loading" }, "ollama-local"), undefined);
    assert.equal(plugin.profileHeaders({ status: "ready", user: { providers: { p: { headers: "nope" } } } }, "p"), undefined);
});

test("isNoKeyActive counts only the exact placeholder value", () => {
    const ours = { user: { providers: { r: { headers: { Authorization: "Bearer none" } } } } };
    const typed = { user: { providers: { r: { headers: { Authorization: "Bearer secret" } } } } };
    const other = { user: { providers: { r: { headers: { "X-Key": "1" } } } } };
    const none = { user: { providers: { r: {} } } };
    assert.equal(plugin.isNoKeyActive(ours, "r"), true);
    assert.equal(plugin.isNoKeyActive(typed, "r"), false);
    assert.equal(plugin.isNoKeyActive(other, "r"), false);
    assert.equal(plugin.isNoKeyActive(none, "r"), false);
    assert.equal(plugin.isNoKeyActive({ status: "ready" }, "r"), false);
});

test("mutations address the single header key so foreign headers survive", () => {
    assert.deepEqual(plugin.configureOps("ollama-local"), [{ op: "set", path: ["providers", "ollama-local", "headers", "Authorization"], value: "Bearer none" }]);
    assert.deepEqual(plugin.clearOps("ollama-local"), [{ op: "unset", path: ["providers", "ollama-local", "headers", "Authorization"] }]);
});

// ── no-conflict with pre-existing profile values ───────────────────────────
//
// The shape assertions above only prove our ops NAME the single key. These
// tests execute those ops against a document that already carries foreign
// values (other headers, a hand-typed `Authorization`, sibling profile
// fields) to prove nothing else moves. `applyOps` mirrors what the Host
// settings engine does with a `SettingsPathOpView`: descend/create the maps
// named by the path, then write or delete exactly the leaf it addresses.

function applyOps(doc, ops) {
    for (const op of ops) {
        var node = doc;
        const path = op.path;
        for (var i = 0; i < path.length - 1; i++) {
            var key = path[i];
            if (node[key] === undefined) node[key] = {};
            node = node[key];
        }
        var leaf = path[path.length - 1];
        if (op.op === "set") node[leaf] = op.value;
        else delete node[leaf];
    }
    return doc;
}

function profileDoc(headers) {
    return {
        providers: {
            "ollama-local": {
                displayName: "Ollama Local",
                api: "openai-completions",
                baseURL: "http://localhost:11434/v1",
                models: [{ id: "llama3" }]
            }
        }
    };
}

test("turning ON only adds the placeholder header, leaving every pre-existing value in place", () => {
    const doc = profileDoc();
    doc.providers["ollama-local"].headers = { "X-Custom": "keep me", "X-Trace": "2" };
    applyOps(doc, plugin.configureOps("ollama-local"));
    const profile = doc.providers["ollama-local"];
    assert.deepEqual(profile.headers, { "X-Custom": "keep me", "X-Trace": "2", Authorization: "Bearer none" });
    assert.equal(profile.displayName, "Ollama Local");
    assert.deepEqual(profile.models, [{ id: "llama3" }]);
    assert.equal("api" in profile, true);
});

test("turning ON on a route with no profile at all creates only the one header", () => {
    const doc = profileDoc();
    applyOps(doc, plugin.configureOps("ollama-local"));
    assert.deepEqual(doc.providers["ollama-local"].headers, { Authorization: "Bearer none" });
});

test("turning OFF drops the placeholder header alone, not the map nor the rest", () => {
    const doc = profileDoc();
    doc.providers["ollama-local"].headers = { "X-Custom": "keep me", Authorization: "Bearer none" };
    applyOps(doc, plugin.clearOps("ollama-local"));
    assert.deepEqual(doc.providers["ollama-local"].headers, { "X-Custom": "keep me" });
});

test("a hand-written `Authorization` disables the toggle with the reason shown", async () => {
    const typed = { status: "ready", writable: true, user: { providers: { "ollama-local": { headers: { Authorization: "Bearer real-key", "X-Custom": "keep me" } } } } };
    const mutations = [];
    const tree = plugin.NoApiKeyToggleCard({
        ...owner(),
        scope: fakeScope(typed, mutations)
    });
    const box = find(tree, (n) => n.props && n.props.type === "checkbox");
    assert.equal(box.props.checked, false, "not the toggle's value is not the toggle's state");
    assert.equal(box.props.disabled, true, "the control is off-limits while a custom header stands");
    const warning = find(tree, (n) => n.props && n.props.className === "ccp_warning");
    assert.ok(warning && /Authorization/.test(warning.props.children), "the reason is surfaced");
    assert.equal(find(tree, (n) => n.props && n.props.className === "ccp_hint"), undefined, "the plain hint gives way to the warning");
    box.props.onChange({ target: { checked: true } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(mutations.length, 0, "neither direction mutates over the user's own header");
    assert.equal(typed.user.providers["ollama-local"].headers.Authorization, "Bearer real-key");
});

test("an explicit ON is blocked while a custom `Authorization` stands", async () => {
    const typed = { status: "ready", writable: true, user: { providers: { "ollama-local": { headers: { Authorization: "Bearer typed" } } } } };
    const mutations = [];
    const tree = plugin.NoApiKeyToggleCard({ ...owner(), scope: fakeScope(typed, mutations) });
    const box = find(tree, (n) => n.props && n.props.type === "checkbox");
    box.props.onChange({ target: { checked: true } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(mutations.length, 0);
    assert.equal(typed.user.providers["ollama-local"].headers.Authorization, "Bearer typed");
});

test("the view renders disabled with the conflict warning", () => {
    const tree = plugin.ToggleView({ active: false, writable: true, conflict: true, failure: null, onToggle: () => {} });
    const box = find(tree, (n) => n.props && n.props.type === "checkbox");
    assert.equal(box.props.disabled, true);
    assert.equal(box.props.checked, false);
    assert.ok(find(tree, (n) => typeof n.props.children === "string" && n.props.children.includes("Authorization")));
    assert.equal(find(tree, (n) => typeof n.props.children === "string" && n.props.children.includes("Writes Authorization")), undefined, "no plain hint alongside the warning");
});

// ── gating ─────────────────────────────────────────────────────────────────

function entry(overrides = {}) {
    return {
        provider: "ollama-local",
        displayName: "Ollama Local",
        settingsNs: "llm-pi-ai",
        settingsPath: ["providers", "ollama-local"],
        active: true,
        declared: true,
        ...overrides
    };
}
const owner = (overrides = {}) => ({ provider: entry(overrides.provider || {}), configured: true, keyConfigured: false, ...overrides });

test("the toggle applies only to configured hand-declared rows without a key", () => {
    assert.equal(plugin.showToggle(owner()), true);
    assert.equal(plugin.showToggle(owner({ provider: { declared: false } })), false);
    assert.equal(plugin.showToggle(owner({ provider: {} })), false);
    assert.equal(plugin.showToggle({ ...owner(), configured: false }), false);
    assert.equal(plugin.showToggle({ ...owner(), keyConfigured: true }), false);
    assert.equal(plugin.showToggle({ provider: undefined, configured: true, keyConfigured: false }), false);
});

// ── editor DOM placement ───────────────────────────────────────────────────

test("class matching never mistakes an editorHeader/-Actions for the editor", () => {
    assert.equal(plugin.hasClassEnding({ className: "zGbnIq_editor" }, "_editor"), true);
    assert.equal(plugin.hasClassEnding({ className: "zGbnIq_editorHeader" }, "_editor"), false);
    assert.equal(plugin.hasClassEnding({ className: "zGbnIq_editorActions" }, "_editor"), false);
    assert.equal(plugin.hasClassEnding({ className: "zGbnIq_editorRoute" }, "_editor"), false);
    assert.equal(plugin.hasClassEnding({ className: "whatever_hash_editor" }, "_editor"), true);
    assert.equal(plugin.hasClassEnding({}, "_editor"), false);
});

test("findEditorWithin locates the editor by class suffix", () => {
    const { li, editor } = fakeCard();
    assert.equal(plugin.findEditorWithin(li), editor);
    assert.equal(plugin.findEditorWithin(new FakeNode("li")), null);
});

test("positionHost parks the host immediately after the API-key field", () => {
    const { li, editor, keyField } = fakeCard();
    const host = new FakeNode("ccp_editorHost");
    assert.equal(plugin.positionHost(host, li), editor);
    assert.equal(host.parentElement, editor);
    assert.equal(keyField.nextSibling, host, "the host follows the key block directly");
    assert.equal(editor.children[editor.children.indexOf(host) + 1].className, "zGbnIq_editorRoute", "the next mounted field follows");

    // Idempotent: calling again does not duplicate or move the host.
    plugin.positionHost(host, li);
    assert.equal(editor.children.filter((child) => child === host).length, 1);

    // Re-mount churn: React removes the host inside the editor → re-park.
    host.remove();
    assert.equal(host.isConnected, false);
    assert.equal(plugin.positionHost(host, li), editor);
    assert.equal(host.parentElement, editor);
    assert.equal(keyField.nextSibling, host);

    // Closing the editor detaches the host.
    li.children = [];
    editor.parentElement = null;
    host.parentElement = editor;
    editor.children.push(host);
    host.isConnected = true;
    assert.equal(plugin.positionHost(host, li), null);
    assert.equal(host.isConnected, false);
});

test("positionHost falls back to the actions row while the key field is not mounted", () => {
    const { li, editor, actions } = fakeCard();
    editor.children = [editor.children[0], editor.children[2], actions];
    for (const child of editor.children) child.parentElement = editor;
    const host = new FakeNode("ccp_editorHost");
    assert.equal(plugin.positionHost(host, li), editor);
    assert.equal(editor.children[editor.children.indexOf(host) + 1], actions, "host sits right before actions");
});

test("findKeyFieldWithin locates the field that wraps the password input", () => {
    const { editor, keyField } = fakeCard();
    assert.equal(plugin.findKeyFieldWithin(editor), keyField);
    const bare = new FakeNode("zGbnIq_editor");
    bare.children.push(new FakeNode("zGbnIq_field"));
    bare.children[0].parentElement = bare;
    assert.equal(plugin.findKeyFieldWithin(bare), null, "a field without a key input is not the key field");
});

// ── component render ───────────────────────────────────────────────────────

function walk(node, visit) {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
        for (const child of node) walk(child, visit);
        return;
    }
    visit(node);
    if (node.props && node.props.children !== undefined) walk(node.props.children, visit);
    if (node.children) walk(node.children, visit);
}
function find(node, predicate) {
    let hit;
    walk(node, (candidate) => {
        if (!hit && predicate(candidate)) hit = candidate;
    });
    return hit;
}

function fakeScope(snapshot, mutations = []) {
    return {
        getSnapshot: () => snapshot,
        subscribe: () => () => {},
        mutate: (ops) => {
            mutations.push(ops);
            return Promise.resolve();
        }
    };
}
function readySnapshot(headers) {
    return { status: "ready", writable: true, user: { providers: headers ? { "ollama-local": { headers } } : {} }, revision: 7 };
}

test("the component renders its hidden anchor plus the toggle host", () => {
    const tree = plugin.NoApiKeyToggleCard({ ...owner(), scope: fakeScope(readySnapshot(undefined)) });
    assert.ok(find(tree, (n) => n.props && n.props.className === "ccp_anchor"), "anchor present");
    assert.ok(find(tree, (n) => n.props && n.props.className === "ccp_editorHost"), "toggle host present");
    const box = find(tree, (n) => n.props && n.props.type === "checkbox");
    assert.ok(box, "view rendered inside the host");
    assert.equal(box.props.checked, false);
    assert.equal(find(tree, (n) => n.props && n.props.className === "ccp_dot"), undefined, "nothing configured: no dot anywhere");
});

test("gated owner props render only the hidden anchor (no host, no control)", () => {
    const gated = { ...owner({ keyConfigured: true }), scope: fakeScope(readySnapshot(undefined)) };
    const tree = plugin.NoApiKeyToggleCard(gated);
    assert.ok(find(tree, (n) => n.props && n.props.className === "ccp_anchor"));
    assert.equal(find(tree, (n) => n.props && n.props.className === "ccp_editorHost"), undefined);
    assert.equal(find(tree, (n) => n.props && n.props.type === "checkbox"), undefined);
});

// ── ToggleView ─────────────────────────────────────────────────────────────

test("an inactive view shows one unchecked control and no status dot", () => {
    const tree = plugin.ToggleView({ active: false, writable: true, failure: null, onToggle: () => {} });
    const box = find(tree, (n) => n.props && n.props.type === "checkbox");
    assert.ok(box);
    assert.equal(box.props.checked, false);
    assert.equal(find(tree, (n) => n.props && n.props.className === "ccp_dot"), undefined);
    assert.equal(find(tree, (n) => n.props && n.props.className === "ccp_value"), undefined);
});

test("an active view adds the read-only header field but never the dot", () => {
    const tree = plugin.ToggleView({ active: true, writable: true, conflict: false, failure: null, onToggle: () => {} });
    const box = find(tree, (n) => n.props && n.props.type === "checkbox");
    assert.equal(box.props.checked, true);
    const value = find(tree, (n) => n.props && n.props.className === "ccp_value");
    assert.ok(value);
    assert.equal(value.props.disabled, true);
    assert.equal(value.props.value, "Authorization: Bearer none");
    assert.equal(find(tree, (n) => n.props && n.props.className === "ccp_dot"), undefined, "the dot is drawn in the header host, not here");
});

test("hasForeignAuthorization flags only a custom value under the header name", () => {
    assert.equal(plugin.hasForeignAuthorization({ user: { providers: { r: { headers: { Authorization: "Bearer other" } } } } }, "r"), true);
    assert.equal(plugin.hasForeignAuthorization({ user: { providers: { r: { headers: {} } } } }, "r"), false);
    assert.equal(plugin.hasForeignAuthorization({ user: { providers: { r: {} } } }, "r"), false);
    assert.equal(plugin.hasForeignAuthorization({ user: { providers: { r: { headers: { "X-Key": "1" } } } } }, "r"), false);
    assert.equal(
        plugin.hasForeignAuthorization({ user: { providers: { r: { headers: { Authorization: plugin.NO_KEY_VALUE } } } } }, "r"),
        false,
        "the placeholder is the toggle's own state, not a foreign value"
    );
});

test("toggling forwards the choice", () => {
    const calls = [];
    const tree = plugin.ToggleView({ active: false, writable: true, failure: null, onToggle: (checked) => calls.push(checked) });
    const box = find(tree, (n) => n.props && n.props.type === "checkbox");
    box.props.onChange({ target: { checked: true } });
    assert.deepEqual(calls, [true]);
});

test("read-only settings render the control disabled with a warning", () => {
    const tree = plugin.ToggleView({ active: false, writable: false, failure: null, onToggle: () => {} });
    const box = find(tree, (n) => n.props && n.props.type === "checkbox");
    assert.equal(box.props.disabled, true);
    assert.ok(find(tree, (n) => typeof n.props.children === "string" && n.props.children.includes("read-only")));
});

// ── slot registration through apply() ──────────────────────────────────────

test("apply claims the provider-card seat with the namespace-scoped scope", () => {
    const bindings = [];
    const registrations = [];
    let injectedSlot = null;
    const scope = { getSnapshot: () => ({ status: "ready", writable: true }), subscribe: () => () => {}, mutate: () => Promise.resolve() };
    const ctx = {
        settingsScope: {
            bind: (spec) => {
                bindings.push(spec);
                return scope;
            }
        },
        slots: {
            inject: (slotName, factory) => {
                injectedSlot = slotName;
                registrations.push(factory());
                return () => {};
            },
            register: (registration, component) => {
                registrations.push({ registration, component });
                return () => {};
            }
        },
        effect: (fn) => fn()
    };

    plugin.apply(ctx);
    assert.equal(injectedSlot, "settings.models.provider-card");
    assert.deepEqual(bindings, [{ namespace: "llm-pi-ai" }]);
    const claimed = registrations.find((r) => r.registration);
    assert.equal(claimed.registration.name, "settings.models.provider-card");
    assert.equal(claimed.registration.key, "llm-pi-ai");
    assert.equal(claimed.component, plugin.NoApiKeyToggleCard);
    assert.equal(claimed.registration.inject().scope, scope);
});

test("apply stays inert without the slots or settings-scope services", () => {
    let effectRan = false;
    const cleanup = plugin.apply({ effect: () => (effectRan = true) });
    assert.equal(effectRan, false);
    assert.equal(typeof cleanup, "function");
    assert.equal(typeof plugin.apply({}), "function");
});

// ── row status dot: pure condition (the resolved `value` layer) ─────────────

test("headerConfigured reads only the Authorization key, any casing, non-empty", () => {
    assert.equal(plugin.headerConfigured({ headers: { Authorization: "Bearer none" } }), true);
    assert.equal(plugin.headerConfigured({ headers: { AUTHORIZATION: "Basic zzz" } }), true);
    assert.equal(plugin.headerConfigured({ headers: { authorization: "   " } }), false, "whitespace stands for absent");
    assert.equal(plugin.headerConfigured({ headers: { Authorization: 42 } }), false, "only strings satisfy the check");
    assert.equal(plugin.headerConfigured({ headers: { "X-Key": "1" } }), false);
    assert.equal(plugin.headerConfigured({ headers: { "X-Authorization": "1" } }), false, "not the header name pi-ai reads");
    assert.equal(plugin.headerConfigured({ headers: "nope" }), false);
    assert.equal(plugin.headerConfigured({ headers: [] }), false);
    assert.equal(plugin.headerConfigured({}), false);
    assert.equal(plugin.headerConfigured(undefined), false);
});

test("resolvedProfile reads the wire (`value`) layer, never the user layer", () => {
    const snapshot = {
        status: "ready",
        user: { providers: { "ollama-local": { headers: { Authorization: "Bearer none" } } } },
        // A fake: the resolved document here names only the inherited route.
        // (A real Host folds user writes into `value` at resolution.)
        value: { providers: { "base-inherited": { headers: { Authorization: "Bearer real" } } } }
    };
    assert.deepEqual(plugin.resolvedProfile(snapshot, "base-inherited"), { headers: { Authorization: "Bearer real" } });
    assert.equal(plugin.resolvedProfile(snapshot, "ollama-local"), undefined, "the user layer is not the resolved document");
    assert.equal(plugin.resolvedProfile(undefined, "ollama-local"), undefined);
    assert.equal(plugin.resolvedProfile({ status: "ready" }, "ollama-local"), undefined);
    assert.equal(plugin.resolvedProfile({ status: "ready", value: {} }, "ollama-local"), undefined);
});

test("showDot gates on declared + a ready resolved wire state, nothing else", () => {
    const wire = (headers) => ({ status: "ready", value: { providers: { "ollama-local": { headers } } } });
    assert.equal(plugin.showDot(owner(), wire({ Authorization: "Bearer none" })), true, "the placeholder counts: the row authenticates by header");
    assert.equal(plugin.showDot(owner(), wire({ Authorization: "Bearer typed-by-hand" })), true, "any non-empty value counts (it can be real)");
    assert.equal(plugin.showDot(owner(), wire({ "X-Trace": "1" })), false);
    assert.equal(plugin.showDot(owner(), wire({})), false);
    assert.equal(plugin.showDot(owner(), { status: "loading" }), false);
    assert.equal(plugin.showDot(owner({ provider: { declared: false } }), wire({ Authorization: "Bearer none" })), false, "shipped cards tell their own story");
    assert.equal(plugin.showDot({ ...owner(), keyConfigured: true }, wire({ Authorization: "Bearer x" })), true, "the key fact is distinct (the DOM check is what avoids two indicators)");
    assert.equal(plugin.showDot({ provider: undefined, configured: true, keyConfigured: false }, wire({ Authorization: "x" })), false);
});

// ── row status dot: DOM placement ──────────────────────────────────────────

test("findRowIdentityWithin locates the identity block by class suffix", () => {
    const { li, rowIdentity } = fakeCard();
    assert.equal(plugin.findRowIdentityWithin(li), rowIdentity);
    assert.equal(plugin.findRowIdentityWithin(new FakeNode("zGbnIq_rowCard")), null);
});

test("positionDot parks the dot last inside the row identity", () => {
    const { li, rowIdentity } = fakeCard();
    const host = new FakeNode("ccp_dot");
    assert.equal(plugin.positionDot(host, li), rowIdentity);
    assert.equal(host.parentElement, rowIdentity);
    assert.equal(rowIdentity.children[rowIdentity.children.length - 1], host, "trails the name and the `custom` tag");

    // Idempotent against churn: re-parking does not duplicate.
    plugin.positionDot(host, li);
    assert.equal(rowIdentity.children.filter((child) => child === host).length, 1);

    // React re-maps the row: the churn replay re-parks.
    host.remove();
    assert.equal(plugin.positionDot(host, li), rowIdentity);
    assert.equal(host.parentElement, rowIdentity);

    // An identityless row (no head mounted) leaves the dot detached.
    li.children = [];
    assert.equal(plugin.positionDot(host, li), null);
    assert.equal(host.isConnected, false);
});

test("the page's own credential dot (green or amber) retires the plugin dot", () => {
    for (const amber of [false, true]) {
        const { li, rowIdentity } = fakeCard();
        const host = new FakeNode("ccp_dot");
        assert.equal(plugin.positionDot(host, li), rowIdentity, "parked while the row shows no indicator");
        rowIdentity.appendChild(fakeCredentialDot(amber));
        assert.equal(plugin.positionDot(host, li), null, "the churn replay finds the page's own dot");
        assert.equal(host.parentElement, null, "ours is retired — never two indicators");
    }
});

test("the row head itself never reads as a page credential dot", () => {
    const { rowIdentity } = fakeCard();
    assert.equal(plugin.hasCredentialDotWithin(rowIdentity), false);
    const host = new FakeNode("ccp_dot");
    rowIdentity.appendChild(host);
    assert.equal(plugin.hasCredentialDotWithin(rowIdentity), false, "our own host is not the page's indicator");
});

// ── row status dot: the seat view ──────────────────────────────────────────

function wireSnapshot(headers) {
    return {
        status: "ready",
        writable: true,
        user: { providers: {} },
        value: { providers: { "ollama-local": headers ? { headers } : {} } },
        revision: 9
    };
}

test("the seat renders the dot host when the wire carries an Authorization header", () => {
    const tree = plugin.NoApiKeyToggleCard({ ...owner(), scope: fakeScope(wireSnapshot({ authorization: "Bearer typed" })) });
    const dot = find(tree, (n) => n.props && n.props.className === "ccp_dot");
    assert.ok(dot, "the dot host is rendered (the churn observer parks it into the row head)");
    assert.equal(dot.props.role, "img", "informational only — no interaction");
    assert.equal(dot.props["aria-label"], "Authorization header configured");
    const box = find(tree, (n) => n.props && n.props.type === "checkbox");
    assert.equal(box.props.checked, false, "the typed header is not this toggle's own state");
});

test("the dot also stands on rows the toggle does not claim", () => {
    const wire = wireSnapshot({ Authorization: "Bearer real" });
    const withKey = plugin.NoApiKeyToggleCard({ ...owner({ keyConfigured: true }), scope: fakeScope(wire) });
    assert.ok(find(withKey, (n) => n.props && n.props.className === "ccp_dot"), "the header fact is told regardless of the key fact");
    assert.equal(find(withKey, (n) => n.props && n.props.type === "checkbox"), undefined, "no toggle over a configured credential");
    const shipped = plugin.NoApiKeyToggleCard({ ...owner({ provider: { declared: false } }), scope: fakeScope(wire) });
    assert.equal(find(shipped, (n) => n.props && n.props.className === "ccp_dot"), undefined, "shipped adapters own their row");
    const loading = plugin.NoApiKeyToggleCard({ ...owner(), scope: fakeScope({ status: "loading" }) });
    assert.equal(find(loading, (n) => n.props && n.props.className === "ccp_dot"), undefined, "nothing is claimed while the state is still loading");
});

test("an unconfigured resolved profile renders no dot host", () => {
    const tree = plugin.NoApiKeyToggleCard({ ...owner(), scope: fakeScope(readySnapshot({ "X-Custom": "keep" })) });
    assert.equal(find(tree, (n) => n.props && n.props.className === "ccp_dot"), undefined);
});
