/**
 * Browser half — the seat component.
 *
 * One `settings.models.provider-card` seat occurrence per saved card. It
 * renders inside a hidden anchor — which marks "which card this is" — and TWO
 * hosts rendered INSIDE that anchor, always rendered, never conditionally:
 * the toggle view (`div.ccp_editorHost`), DOM-moved (parked) into the open
 * `*_editor` right after the API-key field while the gate stands, and the
 * row status dot (`span.ccp_dot`, DOM-moved into the row-head identity
 * block, the very spot where the page parks its own credential dot — ours
 * only when that page dot is absent).
 *
 * Why always rendered: React deletes DOM nodes when a tree flips them off.
 * For a node that React itself tracks inside the anchor but the observer has
 * DOM-moved OUT to the editor/identity, that deletion calls
 * `hostParent.removeChild(moved)` against the fiber's parent — the anchor —
 * and throws `NotFoundError: The node is not a child of this node`. The
 * error lands on the slot's error boundary, the card dies (an un-clickable
 * toggle, gone on reopen) — hence: nothing this component renders is ever
 * unmounted mid-mount; showing/hiding a host is a DOM move in or out of the
 * anchor (park/retire), never a React unmount. The anchor itself only goes
 * away with the component, and the cleanup below first detaches both hosts,
 * so React never deletes a moved node.
 *
 * Reads come from the scope snapshot (every pushed `settings/document-updated`
 * lands as a new snapshot and re-renders): the stored toggle state and the
 * conflict guard read the `user` layer, the dot reads the resolved `value`
 * layer. The toggle NEVER writes on a click: the choice stages locally, the
 * way the page's own editor fields stage their draft, and lands through the
 * scope's fenced mutation queue when the page's own Save/Apply runs (the
 * commit listener below). The dot never writes, in any rhythm.
 */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { jsx } from "react/jsx-runtime";
import { COPY } from "./copy.js";
import { findCancelWithin, findCommitWithin, findEditorWithin, hasClassEnding, positionDot, positionHost, PRIMARY_BUTTON_CLASS_END, SECONDARY_BUTTON_CLASS_END } from "./dom.js";
import {
    hasForeignAuthorization,
    isNoKeyActive,
    showDot,
    showToggle,
    stageOf,
    stagedDirection,
    stagedOps
} from "./profile.js";
import { ToggleView } from "./toggle-view.js";
import type { NoApiKeyToggleCardProps, ScopeSnapshot, SettingsPathOp, SettingsScope } from "./types.js";

function noop(): void {}

export function NoApiKeyToggleCard(props: NoApiKeyToggleCardProps): any {
    var scope = props.scope;

    var subscribe = useMemo(
        function (): (listener: () => void) => () => void {
            return function (listener) {
                return scope.subscribe(listener);
            };
        },
        [scope]
    );
    var snapshot: ScopeSnapshot | undefined = useSyncExternalStore(
        subscribe,
        function (): ScopeSnapshot | undefined {
            return scope.getSnapshot();
        },
        function (): ScopeSnapshot | undefined {
            return scope.getSnapshot();
        }
    );
    var failurePair: [string | null, (value: string | null) => void] = useState<string | null>(null);
    var failure = failurePair[0];
    var setFailure = failurePair[1];
    // The toggle's DRAFT: a click stages the write locally, exactly like the
    // page's own field edits (which the editor keeps in its `draft` and
    // persists only through its Save/Apply). `null` stands for nothing
    // staged.
    var stagedPair: [SettingsPathOp[] | null, (value: SettingsPathOp[] | null) => void] = useState<SettingsPathOp[] | null>(null);
    var staged = stagedPair[0];
    var setStagedState = stagedPair[1];
    // The STAGED value as a synchronous reference. The state alone is not
    // enough: React batches renders, and a DOM signal (a close churn, a
    // click) can run several times before the state settles — a Cancel that
    // discarded its stage would otherwise be seen one render later, letting
    // a later churn re-land what Cancel dropped.
    var stagedRef = useRef<SettingsPathOp[] | null>(null);
    var anchorRef = useRef(null);
    var hostRef = useRef(null);
    var dotRef = useRef(null);
    // The live view values the page-triggered listeners read (a React event
    // cannot reach the closure of an effect attached once).
    var liveRef = useRef({ visible: false, dot: false, active: false, route: "", scope: scope, staged: null as SettingsPathOp[] | null });
    // A flush in flight: the three landing signals (commit click, revision
    // bump, editor close) must never fire the same staged op twice.
    var flushingRef = useRef(false);
    // A Cancel click was seen in this editor's session: closing now DROPS the
    // stage (the page drops its own draft edits the same way) — the opposite
    // of closing by Apply without a click seen (a restructured footer), which
    // lands the stage.
    var cancelSeenRef = useRef(false);
    // A COMMIT (Save/Apply) click was seen in this editor's session, marked
    // in the capture phase. Its close LANDS the stage — any other close
    // (Cancel, or simply walking away) DROPS it exactly like the page drops
    // its own draft edits.
    var commitSeenRef = useRef(false);
    // A close with no click verdict yet: the decision waits one step (the
    // bubble phase of the very same click may be the verdict; a close with no
    // click at all — the user walked away — must DROP the stage).
    var deferredCloseRef = useRef(false);
    // Last namespace revision seen — a bump while a stage stands means the
    // page just wrote ITS own draft through its Save/Apply.
    var lastRevisionRef = useRef<number | undefined>(undefined);
    // The last live editor this card's DOM moved into. A real (mouse) click
    // is a DISCRETE event: React 19 processes its whole effect — including
    // the async `apply()`'s microtasks and the unmount it causes — before
    // the event ever bubbles to `window`, so a click listener that insists on
    // a live editor never sees the page's commit control. This reference lets
    // the bubble listener still recognize the buttons' chain (and the buttons
    // themselves) in the DOM tree it just detached — and lets the capture
    // listener catch Cancel BEFORE the close it triggers.
    var lastEditorRef = useRef<any>(null);

    var visible = showToggle(props);
    var dot = showDot(props, snapshot);
    var route = visible ? props.provider!.provider || "" : "";
    var ready = !!snapshot && snapshot.status === "ready";
    var active = visible && ready && isNoKeyActive(snapshot, route);
    var writable = ready && snapshot!.writable === true;
    var conflict = visible && ready && hasForeignAuthorization(snapshot, route);
    // A staged direction differs from the STORED value only while it is
    // worth saying; once the stored value matches it, the stage is spent.
    var stage = stageOf(staged, active);
    // The live view reads the SYNCHRONOUS stage (see stagedRef): render-time
    // state could lag whatever a DOM signal just consumed.
    var liveStage = stageOf(stagedRef.current, active);
    liveRef.current = {
        visible: visible,
        dot: dot,
        active: active,
        route: route,
        scope: scope,
        staged: liveStage.dirty ? stagedRef.current : null
    };

    // Change the stage NOW (ref + live view), schedule the state update the
    // render draws its hint from. Every stage change must ride this path —
    // the state alone would let DOM signals act on one render's stale view.
    function setStaged(ops: SettingsPathOp[] | null): void {
        stagedRef.current = ops;
        var st = stageOf(ops, liveRef.current.active);
        liveRef.current.staged = st.dirty ? ops : null;
        setStagedState(ops);
    }

    // Park both hosts where they belong and keep them there across the
    // page's own re-mounts: while their gate stands, the editor host sits
    // inside the open `*_editor` card and the status dot inside the row
    // identity; retired, each host sits back INSIDE the anchor (hidden with
    // it). Every subtree churn re-plays the moves. Neither move is ever a
    // React unmount, so React never deletes a DOM node it moved out.
    useEffect(
        function (): () => void {
            var anchor = anchorRef.current;
            if (!anchor || typeof MutationObserver !== "function" || typeof document === "undefined") return noop;
            var hostEl = hostRef.current;
            var dotEl = dotRef.current;
            function cardOf(): any {
                return anchor!.isConnected && typeof anchor!.closest === "function" ? anchor!.closest("li") : null;
            }
            function position(): void {
                var card = cardOf();
                var live = liveRef.current;
                var editorNode = findEditorWithin(card);
                if (editorNode) lastEditorRef.current = editorNode;
                if (hostEl) positionHost(hostEl, card, anchor, live.visible, live.active);
                if (dotEl) positionDot(dotEl, card, anchor, live.dot);
                // The editor is gone while a stage still stands. In a real
                // (mouse) click the close lands INSIDE the click's own
                // discrete processing — before this observer, before any
                // bubble listener — so the capture-phase verdicts decide:
                //  • Cancel clicked → DROPS the stage, exactly like the
                //    page drops its own draft edits.
                //  • Apply clicked → LANDS it: the page's own write is
                //    already queued ahead (apply awaits its writeSettings
                //    before closing), so ours fences cleanly behind it.
                //  • neither was clicked on THIS card — the editor was
                //    walked away from (another card opened) → DROPS it: the
                //    draft dies with the page's other unsaved edits, never
                //    a silent write the user never asked to apply.
                if (live.staged !== null && editorNode === null) {
                    if (cancelSeenRef.current) {
                        cancelSeenRef.current = false;
                        commitSeenRef.current = false;
                        setStaged(null);
                    } else if (commitSeenRef.current) {
                        if (!flushingRef.current) beginFlush(live);
                    } else {
                        // No verdict yet: the click that caused this close may
                        // be the bubble that has not been read. DEFER the call
                        // one step (the bubble lands/decides now, else drop).
                        deferredCloseRef.current = true;
                        Promise.resolve().then(deferredDecision);
                    }
                }
            }
            position();
            var observer = new MutationObserver(function () {
                position();
            });
            var card = cardOf();
            if (card) observer.observe(card, { childList: true, subtree: true });
            return function () {
                observer.disconnect();
                // Unmounting the component: pull the hosts OUT of the page
                // before the cascade can reach them (each host is DOM-moved
                // — the cascade would delete it from the anchor, its fiber
                // parent, not from where it stands).
                if (hostEl) hostEl.remove();
                if (dotEl) dotEl.remove();
            };
        },
        [visible, active, dot]
    );

    // Commit/cancel listeners. The editor persists every field through its
    // own Save/Apply — this card's click only STAGED the choice — so the
    // page's commit control is what lands it.
    //
    // Two listeners, two phases, because a real MOUSE click is a DISCRETE
    // event: React 19 drains its whole effect (the async `apply()`'s
    // microtasks included — and with no page-field edits it awaits nothing
    // that matters) synchronously inside the root container's handler, and
    // the editor is already unmounted by the time the event bubbles to
    // `window`. A bubble-only listener that demands a live editor therefore
    // never sees the page's commit control in the very case that matters.
    //
    //  • CAPTURE (window, before React's root handler — the DOM is still
    //    live): marks Cancel clicks on THIS card's row so the close it
    //    triggers is read as a DROP, never as a save.
    //  • BUBBLE (window, after React's queued `writeSettings`, so a staged
    //    write lands behind theirs and their still-stale
    //    `expectedRevision` fence never conflicts): lands the stage on the
    //    commit control — recognizing it either in a live editor or in the
    //    detached tree this card's host just stood in (`lastEditorRef`).
    useEffect(
        function (): () => void {
            if (typeof window === "undefined" || typeof window.addEventListener !== "function") return noop;

            function chainHits(node: any, ancestor: any): boolean {
                while (node) {
                    if (node === ancestor) return true;
                    node = node.parentElement;
                }
                return false;
            }
            function buttonInChain(node: any, stopAt?: any): string | null {
                var sawSecondary = false;
                while (node && node !== stopAt) {
                    if (hasClassEnding(node, SECONDARY_BUTTON_CLASS_END)) sawSecondary = true;
                    else if (hasClassEnding(node, PRIMARY_BUTTON_CLASS_END)) {
                        return sawSecondary ? "cancel" : "commit";
                    }
                    node = node.parentElement;
                }
                return sawSecondary ? "cancel" : null;
            }

            function onWindowCapture(event: any): void {
                var target = event && event.target;
                if (!target || typeof target.closest !== "function") return;
                var anchor = anchorRef.current;
                if (!anchor || !anchor.isConnected || typeof anchor.closest !== "function") return;
                var row = anchor.closest("li");
                if (!row || target.closest("li") !== row) return;
                var button = buttonInChain(target, row);
                if (button === "cancel") {
                    cancelSeenRef.current = true;
                    commitSeenRef.current = false;
                } else if (button === "commit") {
                    commitSeenRef.current = true;
                    cancelSeenRef.current = false;
                }
            }

            function onWindowClick(event: any): void {
                var target = event && event.target;
                var anchor = anchorRef.current;
                if (!target || !anchor || !anchor.isConnected) return;
                var card = typeof anchor.closest === "function" ? anchor.closest("li") : null;
                var live = liveRef.current;
                var editor = findEditorWithin(card);
                var last = lastEditorRef.current;
                if (!editor) editor = last;
                // The click must stand inside THIS card's editor (live, or the
                // tree React just detached in this same dispatch) — never in
                // any other card's footer.
                if (!editor || !chainHits(target, editor)) return;
                var commit = findCommitWithin(editor);
                var cancel = findCancelWithin(editor);
                var commitHit = false;
                var cancelHit = false;
                var node = target;
                while (node && node !== editor) {
                    if (commit && node === commit) { commitHit = true; break; }
                    if (cancel && node === cancel) { cancelHit = true; break; }
                    node = node.parentElement;
                }
                if (!commitHit && !cancelHit) {
                    var button = buttonInChain(target, editor);
                    commitHit = button === "commit";
                    cancelHit = button === "cancel";
                }
                if (!commitHit && !cancelHit) return;
                if (cancelHit) {
                    cancelSeenRef.current = true;
                    if (live.staged !== null) setStaged(null);
                    return;
                }
                if (live.staged === null) return;
                beginFlush(live);
            }
            window.addEventListener("click", onWindowCapture, true);
            window.addEventListener("click", onWindowClick);
            return function () {
                window.removeEventListener("click", onWindowCapture, true);
                window.removeEventListener("click", onWindowClick);
            };
        },
        []
    );

    // Revision watcher. While a stage stands, the moment the NAMESPACE
    // revision moves is the moment the page wrote its own draft through its
    // Save/Apply — its write is already queued ahead of any we land. A bump
    // with no stage tells us nothing worth acting on.
    useEffect(
        function (): () => void {
            if (!scope || typeof scope.subscribe !== "function") return noop;
            // Seed the last seen revision NOW: a bump is the page's write —
            // the very first bump after the stage stands must already count
            // (a baseline-seed-less `last === undefined` would swallow it).
            var seed = scope.getSnapshot();
            lastRevisionRef.current = seed ? seed.revision : undefined;
            function onScopeChange(): void {
                var live = liveRef.current;
                var snap = live.scope ? live.scope.getSnapshot() : undefined;
                var revision = snap ? snap.revision : undefined;
                var last = lastRevisionRef.current;
                lastRevisionRef.current = revision;
                if (last === undefined || revision === undefined || revision === last) return;
                if (live.staged !== null && !flushingRef.current) beginFlush(live);
            }
            try {
                return scope.subscribe(onScopeChange);
            } catch {
                return noop;
            }
        },
        [scope]
    );

    // Begin the ONE write any of the three landing signals agreed on. The
    // stage is taken out of local draft state FIRST: the write is no longer
    // the user's local intent, and until it settles no signal may land the
    // same op a second time (the flush-in-flight ref holds the other two
    // signals off). If the attempt ultimately fails, the draft falls back to
    // the stored value and the failure message stands — the choice has to be
    // re-staged deliberately, exactly like any failed write.
    // One step after a no-verdict close: whatever the bubble read decides.
    function deferredDecision(): void {
        if (!deferredCloseRef.current) return;
        deferredCloseRef.current = false;
        var live = liveRef.current;
        if (live.staged === null) return;
        if (cancelSeenRef.current) {
            cancelSeenRef.current = false;
            commitSeenRef.current = false;
            setStaged(null);
            return;
        }
        if (commitSeenRef.current) {
            if (!flushingRef.current) beginFlush(live);
            return;
        }
        commitSeenRef.current = false;
        setStaged(null);
    }

    function beginFlush(live: { staged: SettingsPathOp[] | null; scope: SettingsScope; route: string }): void {
        if (flushingRef.current || live.staged === null) return;
        var ops = live.staged;
        var flushScope = live.scope;
        var flushRoute = live.route;
        cancelSeenRef.current = false;
        commitSeenRef.current = false;
        flushingRef.current = true;
        flushStaged(ops, flushScope, flushRoute, function (): void {
            flushingRef.current = false;
        });
        // Take the stage out synchronously: a later signal must not re-land
        // it (React batches this with the flush's own state settles).
        setStaged(null);
    }

    // Land the staged op, then read the settled document back: the write only
    // stands when the stored state matches the staged direction. A rejection
    // (a stale fence — the page's own save may have bumped the revision first)
    // has already re-read the scope, so it gets exactly one replay. The route
    // is CAPTURED for the flush: the editor may unmount mid-flight (the card
    // closing), which zeroes `liveRef.route`, and reading it there would
    // mistake an unset profile for the OFF target and drop an unsaved OFF.
    function flushStaged(
        ops: SettingsPathOp[],
        flushScope: SettingsScope,
        flushRoute: string,
        done?: () => void
    ): void {
        var target = stagedDirection(ops);
        function attempt(retry: boolean): Promise<unknown> {
            var snapshotNow = flushScope.getSnapshot();
            if (!!snapshotNow && snapshotNow.status === "ready" && isNoKeyActive(snapshotNow, flushRoute) === target) {
                return Promise.resolve();
            }
            return flushScope.mutate(ops).then(function () {
                var after = flushScope.getSnapshot();
                var landed = !!after && after.status === "ready" && isNoKeyActive(after, flushRoute) === target;
                if (landed) return;
                if (!retry) return attempt(true);
                return Promise.reject(new Error("rejected"));
            });
        }
        Promise.resolve()
            .then(function () {
                return attempt(false);
            })
            .then(
                function () {
                    if (done) done();
                    setFailure(null);
                },
                function () {
                    if (done) done();
                    setFailure(COPY.failed);
                }
            );
    }
    function onToggle(checked: boolean): void {
        if (conflict) return;
        if (checked === stage.draftActive) return;
        // Staged, never written: the editor persists every other field the
        // same way, only when its Save/Apply runs. A new draft starts with
        // no pending click verdicts.
        var next = stagedOps(checked, active, route);
        cancelSeenRef.current = false;
        commitSeenRef.current = false;
        setStaged(next);
    }

    // Once the STORED value matches the staged direction, the stage is spent:
    // clear the state, so an old stage can never re-land a stale choice.
    useEffect(
        function (): void {
            if (staged !== null && !stage.dirty) setStaged(null);
        },
        [staged, stage.dirty]
    );

    return jsx("div", {
        ref: anchorRef,
        className: "ccp_anchor",
        "aria-hidden": "true",
        children: [
            // Both hosts render HERE, inside the anchor, always: showing one
            // is the DOM move of the same node (park) — hiding one moves it
            // back (retire) — never a React unmount, or React would delete a
            // node it is not standing on.
            jsx("div", {
                ref: hostRef,
                className: "ccp_editorHost",
                children: visible
                    ? jsx(ToggleView, { active: stage.draftActive, staged: stage.dirty, writable: writable, conflict: conflict, failure: failure, onToggle: onToggle })
                    : null
            }),
            jsx("span", {
                ref: dotRef,
                className: "ccp_dot",
                role: "img",
                "aria-label": COPY.dotAuthorizationConfigured,
                title: COPY.dotAuthorizationConfigured
            })
        ]
    });
}
