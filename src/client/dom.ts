/**
 * DOM-moves, never deletions. Both hosts this component renders (the toggle
 * view and the row status dot) live inside DOM the page owns and freely
 * re-mounts; each of the two functions below moves one host either to its
 * page position (park) or back inside the component's anchor (retire) —
 * never a detach, because the host must keep standing somewhere React
 * tracks it. (A detached host could still be DELETED by React while React
 * believes it lives in the anchor, and removing a DOM-moved node throws
 * NotFoundError — the crash that used to kill the card.) Page-local CSS is
 * only ever matched by the stable un-hashed SUFFIX of each class
 * (`*_editor`, `*_field`, `*_editorActions`, `rowIdentity`, `credentialDot`);
 * the hashed prefix churns every rebuild and is never referenced.
 *
 * Every move here is idempotent against the page's own re-mounts, so the
 * seat component's churn observer can replay them freely.
 */

/** The page's commit control: the action row's primary (Save/Apply) button. */
export const PRIMARY_BUTTON_CLASS_END = "primaryButton";
/** The page's cancel control: the action row's secondary button. A click on
 *  it closes the card WITHOUT saving — the staged toggle must die with it. */
export const SECONDARY_BUTTON_CLASS_END = "secondaryButton";

/** Page-local editor classes, matched by their un-hashed suffix. */
export const EDITOR_CLASS_END = "_editor";
export const EDITOR_ACTIONS_CLASS_END = "_editorActions";
/** The key-input field: a `*_field` block that wraps the password box. */
export const EDITOR_FIELD_CLASS_END = "_field";
/** Page-local row classes, matched by their un-hashed suffix. */
export const ROW_IDENTITY_CLASS_END = "rowIdentity";
/**
 * The page's own credential indicator (its `credentialDotConfigured`
 * / `credentialDotMissing` states ride on this base class, which only
 * the dots themselves carry).
 */
export const CREDENTIAL_DOT_CLASS_END = "credentialDot";

/**
 * Whether `element`'s class list carries a hashed page-local class
 * whose name ENDS with `suffix` — so matching `_editor` never matches
 * the `*_editorActions` children. Only the suffix
 * is stable across rebuilds; the hash prefix is ignored.
 */
export function hasClassEnding(element: any, suffix: string): boolean {
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
export function findEditorWithin(root: any): any {
    if (!root || typeof root.querySelectorAll !== "function") return null;
    var nodes = root.querySelectorAll("[class]");
    for (var i = 0; i < nodes.length; i++) {
        if (hasClassEnding(nodes[i], EDITOR_CLASS_END)) return nodes[i];
    }
    return null;
}

/** The editor's own action row (`*_editorActions`) when mounted inside `editor`. */
export function findActionsWithin(editor: any): any {
    if (!editor || typeof editor.querySelectorAll !== "function") return null;
    var nodes = editor.querySelectorAll("[class]");
    for (var i = 0; i < nodes.length; i++) {
        if (hasClassEnding(nodes[i], EDITOR_ACTIONS_CLASS_END)) return nodes[i];
    }
    return null;
}

/**
 * The first node inside `editor` whose class ENDS with `buttonClassEnd` —
 * the footer's primary/cancel buttons live in the action row, but the whole
 * editor is searched so a footer restructure never hides the control. `null`
 * while the control is not mounted.
 */
export function findButtonWithin(editor: any, buttonClassEnd: string): any {
    if (!editor || typeof editor.querySelectorAll !== "function") return null;
    var scope = findActionsWithin(editor);
    var nodes = (scope || editor).querySelectorAll("[class]");
    for (var i = 0; i < nodes.length; i++) {
        if (hasClassEnding(nodes[i], buttonClassEnd)) return nodes[i];
    }
    return null;
}

/**
 * The editor's commit (Save/Apply) button — the page's own control that
 * lands EVERY staged field of the card. A staged toggle write rides this
 * same moment, so it must never fire on any other click. `null` while no
 * editor stands.
 */
export function findCommitWithin(editor: any): any {
    return findButtonWithin(editor, PRIMARY_BUTTON_CLASS_END);
}

/**
 * The editor's CANCEL button (the action row's secondary button). Clicking
 * it closes the card WITHOUT saving — the page drops its own draft edits,
 * and the staged toggle is dropped the same way. `null` while no editor
 * stands (the footer always renders both buttons; this stays null-safe).
 */
export function findCancelWithin(editor: any): any {
    return findButtonWithin(editor, SECONDARY_BUTTON_CLASS_END);
}

/**
 * The editor's API-key field: a `*_field` block that wraps a password
 * input (the page's key input renders as `type: "password"`; route or
 * URL fields never do). `null` while the key block is not mounted.
 */
export function findKeyFieldWithin(editor: any): any {
    if (!editor || typeof editor.querySelectorAll !== "function") return null;
    var fields = editor.querySelectorAll("[class]");
    for (var i = 0; i < fields.length; i++) {
        if (!hasClassEnding(fields[i], EDITOR_FIELD_CLASS_END)) continue;
        if (fields[i].querySelectorAll("input[type=\"password\"]").length > 0) return fields[i];
    }
    return null;
}

/**
 * Retire `host` back INTO `anchor` — its own React parent. This is the
 * hiding half of every DOM move: the node keeps standing in the DOM and
 * in the place the fiber tree expects it, so a later React op (an
 * unmount cascade, a re-render) reaches it exactly where it stands.
 * Never `remove()` — a detached node is still React's child on paper,
 * and deleting one that was moved out throws NotFoundError.
 */
function retireHost(host: any, anchor: any): any {
    if (anchor && host.parentElement !== anchor) anchor.appendChild(host);
    return anchor;
}

/**
 * Find the page's password input inside the editor and mark it
 * disabled — so the user cannot type while the no-key header is set.
 * Called from the MutationObserver so it survives React re-renders.
 * @param editor - the editor container.
 * @param active - whether the toggle is on (true = disable, false = re-enable).
 */
export function disablePasswordInput(editor: any, active: boolean | undefined): void {
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
 * the editor's end. When `park` is falsy, or no editor stands open, the
 * host is retired back into `anchor`. Idempotent against the page's
 * re-renders, so the churn observer can replay it.
 * @param host - this card's toggle host element.
 * @param card - the row's `li` subtree.
 * @param anchor - the component's anchor (the host's React parent).
 * @param park - whether the host stands in the editor (its gate is open).
 * @param active - whether the no-key header is set (disables the password input).
 * @returns the element the host stands in.
 */
export function positionHost(host: any, card: any, anchor: any, park?: boolean, active?: boolean): any {
    if (!park) return retireHost(host, anchor);
    var editor = findEditorWithin(card);
    if (!editor) return retireHost(host, anchor);
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

/**
 * The row-identity block (`*_rowIdentity`) inside `root` (the row's
 * `li`): the page's own head span that holds `rowName`, the `custom`
 * `rowTag` and, for referenced credentials, the credential dot.
 * `null` when the row head is not mounted.
 */
export function findRowIdentityWithin(root: any): any {
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
export function hasCredentialDotWithin(identity: any): boolean {
    if (!identity || typeof identity.querySelectorAll !== "function") return false;
    var nodes = identity.querySelectorAll("[class]");
    for (var i = 0; i < nodes.length; i++) {
        if (hasClassEnding(nodes[i], CREDENTIAL_DOT_CLASS_END)) return true;
    }
    return false;
}

/**
 * Move `host` to the row-identity block as its last child — the very spot
 * where the page draws its own credential dot, right after the name and the
 * `custom` tag. When `show` is falsy, no identity stands mounted, or the
 * page's own dot stands, the host is retired back into `anchor` (also
 * caught here, so a churn replay retires ours the moment the page starts
 * showing its indicator). Idempotent against the page's re-maps.
 * @param host - this card's dot host element.
 * @param card - the row's `li` subtree.
 * @param anchor - the component's anchor (the host's React parent).
 * @param show - whether the wire fact stands.
 * @returns the element the host stands in.
 */
export function positionDot(host: any, card: any, anchor: any, show?: boolean): any {
    if (!show) return retireHost(host, anchor);
    var identity = findRowIdentityWithin(card);
    if (!identity || hasCredentialDotWithin(identity)) return retireHost(host, anchor);
    if (host.parentElement !== identity) identity.appendChild(host);
    return identity;
}
