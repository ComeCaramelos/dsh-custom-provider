// @comecaramelos/dsh-custom-provider — logic tests.
//
// The browser half installs itself through `window.__ModuleLoader__.load`, so
// each run stubs the loader, imports lib/client.js once (which registers the
// factory), and drives that factory with a stub `require` for the React
// externals. The toggle lives inside the page-owned `*_editor` DOM and the
// row status dot inside the page-owned row head, so the placement logic
// (`hasClassEnding` / `findEditorWithin` / `positionHost`, plus
// `findRowIdentityWithin` / `positionDot`) is exercised against a minimal
// fake DOM. Both hosts are DOM-MOVED — parked out of the anchor into their
// page position, retired back into it (never detached, never conditionally
// rendered) — so the placement calls are exercised against the fake row AND
// a fake anchor, while the view halves (`ToggleView`, the dot host) are
// exercised as pure tree builders.

import assert from "node:assert/strict";
import test from "node:test";

// ── loader + React stubs ───────────────────────────────────────────────────

let loadedSpec = null;
const windowClickListeners = [];
globalThis.window = {
    __ModuleLoader__: {
        load(spec) {
            loadedSpec = spec;
        }
    },
    addEventListener(name, handler) {
        if (name === "click") windowClickListeners.push(handler);
    },
    removeEventListener(name, handler) {
        if (name === "click") {
            const index = windowClickListeners.indexOf(handler);
            if (index >= 0) windowClickListeners.splice(index, 1);
        }
    }
};
function fireWindowClick(target) {
    for (const handler of [...windowClickListeners]) handler({ target });
}

// Minimal page surface: the observer effect bails when `document` is absent,
// and `apply` installs its stylesheet through `document.querySelector(
// 'style[data-plugin-css=…]')` / `createElement("style")` / `head.appendChild`.
// The sheet's identity lives next to the document, not in the node, so the
// component may assign `dataset` either way and the check still holds.
globalThis.document = {
    head: { appendChild() {} },
    _sheets: new Map(),
    querySelector(selector) {
        const m = /^style\[data-plugin-css="([^"]+)"\]$/.exec(selector);
        if (!m) return null;
        return this._sheets.get(m[1]) || null;
    },
    createElement() {
        const doc = this;
        const node = new FakeNode("", { tag: "style" });
        let identity;
        const tracker = {
            get plugin() {
                return node._plugin;
            },
            set plugin(value) {
                node._plugin = value;
            }
        };
        Object.defineProperty(tracker, "pluginCss", {
            get() {
                return identity;
            },
            set(value) {
                identity = value;
                if (value) doc._sheets.set(value, node);
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(node, "dataset", { get: () => tracker, configurable: true });
        return node;
    }
};
// MutationObserver stand-in: the component's churn observer records here; a
// test drives a churn replay with `flushMutations()`.
const mutationObservers = [];
globalThis.MutationObserver = class {
    constructor(cb) {
        this.cb = cb;
    }
    observe() {
        if (!mutationObservers.includes(this)) mutationObservers.push(this);
    }
    disconnect() {
        const index = mutationObservers.indexOf(this);
        if (index >= 0) mutationObservers.splice(index, 1);
    }
};
function flushMutations() {
    for (const observer of [...mutationObservers]) observer.cb([]);
}

// ── hook session ───────────────────────────────────────────────────────────
// Plain renders (every existing tree test) must stay stateless: without an
// active session every hook behaves like a one-shot stub. A session gives one
// component instance REAL state, stable refs and effects run at "commit" —
// what the DOM-move integration tests need (stage a choice, re-render, fire
// the page's click).
let hookSession = null;
function startHookSession() {
    hookSession = { cursor: 0, store: [], pending: [] };
}
function endHookSession() {
    hookSession = null;
}
function hookSlot(kind, initial) {
    if (!hookSession) return null;
    const store = hookSession.store;
    const index = hookSession.cursor++;
    if (!store[index]) store[index] = { kind, value: initial, current: initial };
    return store[index];
}
function commitEffects() {
    if (!hookSession) return;
    const session = hookSession;
    for (const effect of session.pending) {
        const entry = session.store[effect.index];
        const same =
            !!entry &&
            !!entry.deps &&
            !!effect.deps &&
            entry.deps.length === effect.deps.length &&
            effect.deps.every((value, position) => Object.is(value, entry.deps[position]));
        if (same) continue;
        if (entry && typeof entry.cleanup === "function") entry.cleanup();
        const cleanup = effect.fn();
        session.store[effect.index] = {
            kind: "effect",
            deps: effect.deps ? [...effect.deps] : undefined,
            cleanup: typeof cleanup === "function" ? cleanup : undefined
        };
    }
    session.pending.length = 0;
}
function endComponentInstance() {
    // Run the instance's effect cleanups (window/observer detach) between tests.
    if (!hookSession) return;
    for (const entry of hookSession.store) {
        if (entry && typeof entry.cleanup === "function") entry.cleanup();
    }
}

const reactStub = {
    useMemo: (fn) => fn(),
    useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
    useState: (initial) => {
        const slot = hookSession ? hookSlot("state", initial) : null;
        if (!slot) return [initial, () => {}];
        return [
            slot.value,
            (next) => {
                slot.value = typeof next === "function" ? next(slot.value) : next;
            }
        ];
    },
    useRef: (initial) => {
        const slot = hookSession ? hookSlot("ref", initial) : null;
        return slot || { current: initial };
    },
    useEffect: (fn, deps) => {
        if (!hookSession) {
            fn();
            return;
        }
        const index = hookSession.cursor++;
        hookSession.pending.push({ index, fn, deps });
    },
    useCallback: (fn) => fn
};
// A stub JSX factory that also EXPANDS function components (the real renderer
// would call `ToggleView` etc.), so tree-walking tests see the leaf DOM. When
// a hook session is active it also builds a backing fake-DOM node for every
// host element and wires its `ref`, so the DOM-move integration tests can
// park/retire real nodes and fire real clicks against them.
function renderNode(type, props) {
    if (typeof type === "function") return type(props);
    if (hookSession && !hookSession.frozen) {
        const dom = new FakeNode(props.className || "", { tag: String(type) });
        if (props.role) dom.role = props.role;
        if (props.checked !== undefined) dom.checked = !!props.checked;
        dom.isConnected = true;
        if (props.ref && typeof props.ref === "object") props.ref.current = dom;
        const renderedChildren = renderChildren(props.children);
        for (const childDom of renderedChildren) dom.appendChild(childDom);
        return { type, props, dom };
    }
    return { type, props };
}
function renderChildren(children) {
    const nodes = [];
    const push = (child) => {
        if (child === null || child === undefined || typeof child === "string" || typeof child === "number") return;
        if (Array.isArray(child)) {
            for (const nested of child) push(nested);
            return;
        }
        if (typeof child === "object" && child.dom) nodes.push(child.dom);
    };
    push(children);
    return nodes;
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
        if (attrs.role) this.role = attrs.role;
    }
    // Component DOM walks upward with `closest("li")` to find the row.
    closest(match) {
        let node = this;
        while (node) {
            if (match === "li" ? node.tag === "li" : String(node.className || "") === match) return node;
            node = node.parentElement;
        }
        return null;
    }
    get nextSibling() {
        const index = this.parentElement ? this.parentElement.children.indexOf(this) : -1;
        return index >= 0 ? (this.parentElement.children[index + 1] ?? null) : null;
    }
    get lastChild() {
        return this.children.length > 0 ? this.children[this.children.length - 1] : null;
    }
    appendChild(node) {
        if (!this.children.includes(node)) this.children.push(node);
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
        const wantsClass = selector.indexOf("[class]") >= 0;
        const wantsPassword = selector.indexOf("input[type=\"password\"]") >= 0;
        const walk = (node) => {
            for (const child of node.children) {
                let matches;
                if (wantsPassword) matches = child.tag === "input" && child.type === "password";
                else if (wantsClass) matches = String(child.className || "").length > 0;
                else matches = false;
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
    const li = new FakeNode("zGbnIq_rowCard", { tag: "li" });
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
    // The page's own footer inside the actions row: Cancel + Save/Apply.
    const commit = new FakeNode("zGbnIq_primaryButton");
    const cancel = new FakeNode("zGbnIq_secondaryButton");
    actions.children.push(cancel, commit);
    cancel.parentElement = actions;
    commit.parentElement = actions;
    // Realistic DOM order: row head first, then editor — header, key field,
    // other fields…, actions last.
    editor.children.push(header, keyField, route, actions);
    for (const child of editor.children) child.parentElement = editor;
    li.children.push(rowHead, editor);
    for (const child of li.children) child.parentElement = li;
    connect(li);
    return { li, rowHead, rowIdentity, rowName, rowTag, editor, header, keyField, keyInput, actions, commit, cancel, route };
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

test("a staged op is what the save moment has to land: ON sets, OFF clears, agreement stages nothing", () => {
    assert.deepEqual(plugin.stagedOps(true, false, "ollama-local"), plugin.configureOps("ollama-local"));
    assert.deepEqual(plugin.stagedOps(false, true, "ollama-local"), plugin.clearOps("ollama-local"));
    assert.equal(plugin.stagedOps(true, true, "ollama-local"), null, "agreeing with what is stored has nothing to save");
    assert.equal(plugin.stagedOps(false, false, "ollama-local"), null);
});

test("stageOf reads the stage: dirty claims the shown value, spent falls back to what is stored", () => {
    const staging = plugin.stageOf(plugin.configureOps("ollama-local"), false);
    assert.equal(staging.dirty, true, "staged ON over stored OFF says something");
    assert.equal(staging.draftActive, true, "the staged direction stands shown");
    const spent = plugin.stageOf(plugin.configureOps("ollama-local"), true);
    assert.equal(spent.dirty, false, "staged ON with stored ON no longer says anything");
    assert.equal(spent.draftActive, true);
    const off = plugin.stageOf(plugin.clearOps("ollama-local"), true);
    assert.equal(off.dirty, true, "staged OFF over stored ON says something");
    assert.equal(off.draftActive, false);
    const agree = plugin.stageOf(plugin.clearOps("ollama-local"), false);
    assert.equal(agree.dirty, false, "staged OFF with stored OFF already agrees");
    assert.equal(agree.draftActive, false);
    const nothing = plugin.stageOf(null, true);
    assert.equal(nothing.dirty, false);
    assert.equal(nothing.draftActive, true, "nothing staged: what is stored stands shown");
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

test("clicking the control stages the choice: it writes NOTHING, wherever the profile stands", async () => {
    const ready = { status: "ready", writable: true, revision: 7, user: { providers: { "ollama-local": {} } } };
    const mutations = [];
    const tree = plugin.NoApiKeyToggleCard({ ...owner(), scope: fakeScope(ready, mutations) });
    const box = find(tree, (n) => n.props && n.props.type === "checkbox");
    assert.equal(box.props.checked, false);
    box.props.onChange({ target: { checked: true } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(mutations.length, 0, "a click stages; the write belongs to the card's own save moment");
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
    const anchor = new FakeNode("ccp_anchor");
    anchor.isConnected = true;
    const host = new FakeNode("ccp_editorHost");
    assert.equal(plugin.positionHost(host, li, anchor, true), editor);
    assert.equal(host.parentElement, editor);
    assert.equal(keyField.nextSibling, host, "the host follows the key block directly");
    assert.equal(editor.children[editor.children.indexOf(host) + 1].className, "zGbnIq_editorRoute", "the next mounted field follows");

    // Idempotent: calling again does not duplicate or move the host.
    plugin.positionHost(host, li, anchor, true);
    assert.equal(editor.children.filter((child) => child === host).length, 1);

    // Re-mount churn: React removes the host inside the editor → re-park.
    host.remove();
    assert.equal(host.isConnected, false);
    assert.equal(plugin.positionHost(host, li, anchor, true), editor);
    assert.equal(host.parentElement, editor);
    assert.equal(keyField.nextSibling, host);

    // Closing the editor retires the host back INTO its anchor — a DOM move,
    // never a detach: it keeps standing where React believes it lives.
    assert.equal(plugin.positionHost(host, li, anchor, false), anchor);
    assert.equal(host.parentElement, anchor);
    assert.equal(host.isConnected, true);

    // A churn mid-close (host still parked while the editor vanishes): the
    // replay retires instead of leaving the host stranded in dead DOM.
    plugin.positionHost(host, li, anchor, true);
    li.children = [];
    editor.parentElement = null;
    assert.equal(plugin.positionHost(host, li, anchor, true), anchor);
    assert.equal(host.parentElement, anchor);
    assert.equal(host.isConnected, true);
});

test("positionHost falls back to the actions row while the key field is not mounted", () => {
    const { li, editor, actions } = fakeCard();
    editor.children = [editor.children[0], editor.children[2], actions];
    for (const child of editor.children) child.parentElement = editor;
    const anchor = new FakeNode("ccp_anchor");
    anchor.isConnected = true;
    const host = new FakeNode("ccp_editorHost");
    assert.equal(plugin.positionHost(host, li, anchor, true), editor);
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

test("findCommitWithin locates the action row's primary (Save/Apply) button", () => {
    const { editor, commit } = fakeCard();
    assert.equal(plugin.findCommitWithin(editor), commit, "the staged write rides this control's click");
    assert.equal(plugin.findCommitWithin(null), null, "no editor, no commit control");
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

test("the component renders its hidden anchor plus both DOM-moved hosts", () => {
    const tree = plugin.NoApiKeyToggleCard({ ...owner(), scope: fakeScope(readySnapshot(undefined)) });
    assert.ok(find(tree, (n) => n.props && n.props.className === "ccp_anchor"), "anchor present");
    assert.ok(find(tree, (n) => n.props && n.props.className === "ccp_editorHost"), "toggle host present");
    assert.ok(find(tree, (n) => n.props && n.props.className === "ccp_dot"), "the dot host stands too — hiding is a DOM move, never an unmount");
    const box = find(tree, (n) => n.props && n.props.type === "checkbox");
    assert.ok(box, "view rendered inside the host");
    assert.equal(box.props.checked, false);
});

test("gated owner props keep the hosts retired in the hidden anchor and render no live control", () => {
    const gated = { ...owner({ keyConfigured: true }), scope: fakeScope(readySnapshot(undefined)) };
    const tree = plugin.NoApiKeyToggleCard(gated);
    assert.ok(find(tree, (n) => n.props && n.props.className === "ccp_anchor"));
    assert.ok(find(tree, (n) => n.props && n.props.className === "ccp_editorHost"), "the host stands, empty, inside the hidden anchor");
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

test("a staged choice says so in place of the plain hint", () => {
    const staged = plugin.ToggleView({ active: false, staged: true, writable: true, conflict: false, failure: null, onToggle: () => {} });
    const stagedHint = find(staged, (n) => n.props && n.props.className === "ccp_hint");
    assert.ok(stagedHint, "a hint stands");
    assert.match(stagedHint.props.children, /staged/i, "the staged note takes the hint's place");
    const plain = plugin.ToggleView({ active: false, staged: false, writable: true, conflict: false, failure: null, onToggle: () => {} });
    const plainHint = find(plain, (n) => n.props && n.props.className === "ccp_hint");
    assert.ok(!/staged/i.test(plainHint.props.children), "un-staged: the plain hint stands");
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
    const anchor = new FakeNode("ccp_anchor");
    anchor.isConnected = true;
    const host = new FakeNode("ccp_dot");
    assert.equal(plugin.positionDot(host, li, anchor, true), rowIdentity);
    assert.equal(host.parentElement, rowIdentity);
    assert.equal(rowIdentity.children[rowIdentity.children.length - 1], host, "trails the name and the `custom` tag");

    // Idempotent against churn: re-parking does not duplicate.
    plugin.positionDot(host, li, anchor, true);
    assert.equal(rowIdentity.children.filter((child) => child === host).length, 1);

    // React re-maps the row: the churn replay re-parks.
    host.remove();
    assert.equal(plugin.positionDot(host, li, anchor, true), rowIdentity);
    assert.equal(host.parentElement, rowIdentity);

    // The gate stands off: retire — a DOM move back into the anchor, never a detach.
    assert.equal(plugin.positionDot(host, li, anchor, false), anchor);
    assert.equal(host.parentElement, anchor);
    assert.equal(host.isConnected, true);

    // An identityless row (no head mounted): also retired, never stranded.
    li.children = [];
    assert.equal(plugin.positionDot(host, li, anchor, true), anchor);
    assert.equal(host.parentElement, anchor);
    assert.equal(host.isConnected, true);
});

test("the page's own credential dot (green or amber) retires the plugin dot", () => {
    for (const amber of [false, true]) {
        const { li, rowIdentity } = fakeCard();
        const anchor = new FakeNode("ccp_anchor");
        anchor.isConnected = true;
        const host = new FakeNode("ccp_dot");
        assert.equal(plugin.positionDot(host, li, anchor, true), rowIdentity, "parked while the row shows no indicator");
        rowIdentity.appendChild(fakeCredentialDot(amber));
        assert.equal(plugin.positionDot(host, li, anchor, true), anchor, "the churn replay finds the page's own dot");
        assert.equal(host.parentElement, anchor, "ours is retired into the anchor — never two indicators, never a detach");
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
    // Every host stands in the DOM regardless — showing/hiding is placement
    // (positionDot parks or retires), so React never unmounts a moved host.
    const shipped = plugin.NoApiKeyToggleCard({ ...owner({ provider: { declared: false } }), scope: fakeScope(wire) });
    assert.ok(find(shipped, (n) => n.props && n.props.className === "ccp_dot"), "the host stands, retired inside the hidden anchor");
    assert.equal(plugin.showDot({ ...owner({ provider: { declared: false } }) }, wire), false, "the gate stands off — placement retires it out of sight");
    const loading = plugin.NoApiKeyToggleCard({ ...owner(), scope: fakeScope({ status: "loading" }) });
    assert.equal(plugin.showDot({ ...owner() }, { status: "loading" }), false, "nothing is claimed while the state is still loading");
});

test("an unconfigured resolved profile keeps the dot host retired in the anchor", () => {
    const tree = plugin.NoApiKeyToggleCard({ ...owner(), scope: fakeScope(readySnapshot({ "X-Custom": "keep" })) });
    assert.ok(find(tree, (n) => n.props && n.props.className === "ccp_dot"), "rendered — the churn replay retires it (showDot stands off)");
});

// ── DOM integration: the staged draft and the page's save moment ──────────
// A live scope whose document actually moves: a mutation updates the doc and
// bumps its revision, exactly like the Host. `mountCard` builds one component
// instance against a fake row with DOM (refs wired, effects committed);
// `softRender` re-renders that SAME instance without touching the DOM (the
// DOM was built at mount, so re-render must not rebuild it).
function liveScope(doc, scopeListeners) {
    return {
        getSnapshot: () => ({
            status: "ready",
            writable: true,
            revision: doc.revision,
            user: { providers: { "ollama-local": { headers: doc.headers } } },
            value: { providers: { "ollama-local": { headers: doc.headers } } }
        }),
        subscribe(listener) {
            scopeListeners.push(listener);
            return () => {
                const index = scopeListeners.indexOf(listener);
                if (index >= 0) scopeListeners.splice(index, 1);
            };
        },
        mutate(ops) {
            doc.mutations.push(ops);
            for (const op of ops) {
                if (op.op === "unset") {
                    delete doc.headers.Authorization;
                } else if (op.op === "set") {
                    doc.headers.Authorization = op.value;
                }
            }
            doc.revision += 1;
            return Promise.resolve();
        }
    };
}
function mountCard(row, scope) {
    startHookSession();
    const tree = plugin.NoApiKeyToggleCard({ ...owner(), scope });
    row.li.appendChild(tree.dom);
    commitEffects();
    return tree;
}
function softRender(props) {
    hookSession.frozen = true;
    hookSession.cursor = 0;
    const tree = plugin.NoApiKeyToggleCard(props);
    commitEffects();
    hookSession.frozen = false;
    return tree;
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

test("staging alone writes nothing and says it staged", () => {
    const row = fakeCard();
    const doc = { headers: { Authorization: "Bearer none" }, revision: 3, mutations: [] };
    const scope = liveScope(doc, []);
    const tree = mountCard(row, scope);
    const box = find(tree, (n) => n.props && n.props.type === "checkbox");
    box.props.onChange({ target: { checked: false } });
    softRender({ ...owner(), scope });
    assert.equal(doc.mutations.length, 0, "the choice stages; NOTHING has been written yet");
    const hint = find(softRender({ ...owner(), scope }), (n) => n.props && n.props.className === "ccp_hint");
    assert.match(hint.props.children, /staged/i, "the staged note stands in place of the hint");
    endComponentInstance();
    endHookSession();
});

test("a click on the page's Apply lands the staged OFF in the same moment", async () => {
    const row = fakeCard();
    const doc = { headers: { Authorization: "Bearer none" }, revision: 3, mutations: [] };
    const scope = liveScope(doc, []);
    const tree = mountCard(row, scope);
    const box = find(tree, (n) => n.props && n.props.type === "checkbox");
    box.props.onChange({ target: { checked: false } });
    softRender({ ...owner(), scope });
    assert.equal(doc.mutations.length, 0);

    fireWindowClick(row.commit);
    await settle();
    assert.equal(doc.mutations.length, 1, "the staged unset landed once");
    assert.equal(doc.mutations[0][0].op, "unset", "the OFF op is what landed");
    assert.equal(doc.headers.Authorization, undefined, "the keyless header is gone");
    endComponentInstance();
    endHookSession();
});

test("a Cancel click DROPS the stage and the later close writes nothing", async () => {
    const row = fakeCard();
    const doc = { headers: { Authorization: "Bearer none" }, revision: 3, mutations: [] };
    const scope = liveScope(doc, []);
    const tree = mountCard(row, scope);
    const box = find(tree, (n) => n.props && n.props.type === "checkbox");
    box.props.onChange({ target: { checked: false } });
    softRender({ ...owner(), scope });

    fireWindowClick(row.cancel);
    softRender({ ...owner(), scope });
    assert.equal(doc.mutations.length, 0, "Cancel staged nothing");

    // The editor closes: the stage is already dropped; the close replay must
    // not resurrect it into a write.
    row.editor.remove();
    flushMutations();
    await settle();
    assert.equal(doc.mutations.length, 0, "cancel then close writes NOTHING");
    endComponentInstance();
    endHookSession();
});

test("an editor closed without any click DROPS the stage", async () => {
    const row = fakeCard();
    const doc = { headers: { Authorization: "Bearer none" }, revision: 3, mutations: [] };
    const scope = liveScope(doc, []);
    const tree = mountCard(row, scope);
    const box = find(tree, (n) => n.props && n.props.type === "checkbox");
    box.props.onChange({ target: { checked: false } });
    softRender({ ...owner(), scope });

    // The page tears the editor down with no click at all (the user walked
    // away). Exactly like the page's own unsaved field edits, the stage dies
    // with the editor — never a silent write the user never applied.
    row.editor.remove();
    flushMutations();
    await settle();
    assert.equal(doc.mutations.length, 0, "a close with no verdict writes NOTHING");
    assert.equal(doc.headers.Authorization, "Bearer none", "the stored key is untouched");
    endComponentInstance();
    endHookSession();
});

test("a revision bump while staged (the page saved its own draft) lands the stage", async () => {
    const row = fakeCard();
    const doc = { headers: { Authorization: "Bearer none" }, revision: 3, mutations: [] };
    const listeners = [];
    const scope = liveScope(doc, listeners);
    const tree = mountCard(row, scope);
    const box = find(tree, (n) => n.props && n.props.type === "checkbox");
    box.props.onChange({ target: { checked: false } });
    softRender({ ...owner(), scope });
    assert.equal(doc.mutations.length, 0);

    // The page wrote its own fields: the namespace revision moved.
    doc.revision += 1;
    for (const notify of [...listeners]) notify();
    await settle();
    assert.equal(doc.mutations.length, 1, "the revision bump pulled the staged write in");
    assert.equal(doc.mutations[0][0].op, "unset");
    endComponentInstance();
    endHookSession();
});

test("the OTHER card's Apply click never lands this card's stage", async () => {
    const row = fakeCard();
    const doc = { headers: { Authorization: "Bearer none" }, revision: 3, mutations: [] };
    const scope = liveScope(doc, []);
    const tree = mountCard(row, scope);
    const box = find(tree, (n) => n.props && n.props.type === "checkbox");
    box.props.onChange({ target: { checked: false } });
    softRender({ ...owner(), scope });

    // A sibling editor: its commit control, never in THIS card's chain.
    const sibling = fakeCard();
    fireWindowClick(sibling.commit);
    await settle();
    assert.equal(doc.mutations.length, 0, "the foreign Apply writes nothing here");

    // A commit control the page re-mounted in the editor with only its class
    // suffix intact (the located identity is gone): it must still land.
    row.commit.remove();
    const rebuilt = new FakeNode("zGbnIq_primaryButton");
    row.editor.appendChild(rebuilt);
    fireWindowClick(rebuilt);
    await settle();
    assert.equal(doc.mutations.length, 1, "a re-mounted commit control (class suffix only) lands");
    endComponentInstance();
    endHookSession();
});

test("a commit click that arrives AFTER the editor already closed still lands the stage", async () => {
    // The real page closes the editor INSIDE the click's synchronous (discrete)
    // processing — the bubble reaches us with no live editor at all. The
    // last-editor reference must recognize the buttons of the just-detached
    // tree and land the stage.
    const row = fakeCard();
    const doc = { headers: { Authorization: "Bearer none" }, revision: 3, mutations: [] };
    const scope = liveScope(doc, []);
    const tree = mountCard(row, scope);
    const box = find(tree, (n) => n.props && n.props.type === "checkbox");
    box.props.onChange({ target: { checked: false } });
    softRender({ ...owner(), scope });

    // The editor tears down first; no churn replay — then the click bubbles.
    row.editor.remove();
    fireWindowClick(row.commit);
    await settle();
    assert.equal(doc.mutations.length, 1, "the detached-tree commit still lands");
    assert.equal(doc.mutations[0][0].op, "unset");
    endComponentInstance();
    endHookSession();
});

test("a Cancel click that arrives AFTER the editor closed drops the stage", async () => {
    const row = fakeCard();
    const doc = { headers: { Authorization: "Bearer none" }, revision: 3, mutations: [] };
    const scope = liveScope(doc, []);
    const tree = mountCard(row, scope);
    const box = find(tree, (n) => n.props && n.props.type === "checkbox");
    box.props.onChange({ target: { checked: false } });
    softRender({ ...owner(), scope });

    row.editor.remove();
    fireWindowClick(row.cancel);
    flushMutations();
    await settle();
    assert.equal(doc.mutations.length, 0, "the closed editor is read as a DROP, not a save");
    endComponentInstance();
    endHookSession();
});

test("no churn resurrects a stage Cancel dropped before the state settles", async () => {
    // The GUI race: React batches renders, so without the synchronous stage
    // reference the discarded stage still looks alive to DOM signals running
    // before the render — and their churn re-lands exactly what Cancel
    // dropped.
    const row = fakeCard();
    const doc = { headers: { Authorization: "Bearer none" }, revision: 3, mutations: [] };
    const scope = liveScope(doc, []);
    const tree = mountCard(row, scope);
    const box = find(tree, (n) => n.props && n.props.type === "checkbox");
    box.props.onChange({ target: { checked: false } });
    softRender({ ...owner(), scope });

    fireWindowClick(row.cancel);
    // NO softRender: several DOM churns run before any render settles.
    row.editor.remove();
    flushMutations();
    flushMutations();
    await settle();
    assert.equal(doc.mutations.length, 0, "what Cancel dropped stays dropped");
    endComponentInstance();
    endHookSession();
});
