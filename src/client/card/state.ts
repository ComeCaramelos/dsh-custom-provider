/**
 * Browser half — `card/`: the mutable state every effect shares.
 *
 * One component, several concurrent signals (churn observer, window listeners,
 * the scope subscription), and each may stage or land a choice. Every fact
 * they must NOT race on lives here as refs, created once by the component and
 * handed to each effect hook — an effect must never depend on one render's
 * closure of a value another signal already moved.
 *
 * The live view (`liveRef`) is what the DOM-dispatched signals read: React
 * events cannot reach the closure of an effect attached once, so whatever the
 * listeners need stands here, refreshed every render by the component. The
 * staged ops keep BOTH shapes on purpose: the state (`staged`) is what the
 * render draws its hint from, the reference (`stagedRef`) what every DOM
 * signal reads synchronously — React batches renders, and a churn or click
 * can run several times before the state settles (a Cancel's drop read one
 * render late would let a later churn re-land what Cancel killed).
 */
import { useRef, useState } from "react";
import { COPY } from "../copy.js";
import { stageOf } from "../profile.js";
import { landStaged } from "./flush.js";
import type { SettingsPathOp, SettingsScope } from "../types.js";

/** The live view the DOM-dispatched signals read. Refreshed every render. */
export interface CardLiveView {
    visible: boolean;
    dot: boolean;
    active: boolean;
    route: string;
    scope: SettingsScope;
    staged: SettingsPathOp[] | null;
}

/** Everything the component's effect hooks need out of each other's hands. */
export interface CardState {
    /** The last write rejection's message (null while nothing failed). */
    failure: string | null;
    /** The staged draft as render state; `null` stands for nothing staged. */
    staged: SettingsPathOp[] | null;
    /** The staged ops as a synchronous reference — what DOM signals read. */
    stagedRef: { current: SettingsPathOp[] | null };
    liveRef: { current: CardLiveView };
    /** The hidden anchor div: "which card this is", the hosts' React parent. */
    anchorRef: { current: any };
    /** The toggle-view host (DOM-moved into the open editor, else parked here). */
    hostRef: { current: any };
    /** The row status-dot host (DOM-moved into the row identity, else parked here). */
    dotRef: { current: any };
    /** A flush in flight: the three landing signals never land the same op twice. */
    flushingRef: { current: boolean };
    /** A Cancel click was seen in this editor's session: closing now DROPS the stage. */
    cancelSeenRef: { current: boolean };
    /** A COMMIT click was seen in this editor's session: its close LANDS the stage. */
    commitSeenRef: { current: boolean };
    /** A close with no click verdict yet: the decision waits one step (the bubble phase). */
    deferredCloseRef: { current: boolean };
    /** The last namespace revision seen: a bump with a stage stands means the page saved. */
    lastRevisionRef: { current: number | undefined };
    /** The last live editor this card DOM-moved into: a discrete click's close detaches it. */
    lastEditorRef: { current: any };
    /** Change the stage NOW (ref + live view) and schedule the state render. */
    setStaged: (ops: SettingsPathOp[] | null) => void;
    /** Begin the ONE write the landing signals agreed on. */
    beginFlush: (live: CardLiveView) => void;
    /** One step after a no-verdict close: whatever the bubble read decides. */
    deferredDecision: () => void;
}

/**
 * Create the card's shared state: every ref, both draft states, and the two
 * cross-signal verbs (staging, flushing) the effects call through it.
 * @param scope - the namespace scope bound to this component.
 */
export function useCardState(scope: SettingsScope): CardState {
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

    var stagedRef = useRef<SettingsPathOp[] | null>(null);
    var liveRef = useRef<CardLiveView>({ visible: false, dot: false, active: false, route: "", scope: scope, staged: null });
    /** The hidden anchor div: "which card this is", the hosts' React parent. */
    var anchorRef = useRef(null);
    /** The toggle-view host: DOM-moved into the open editor, else parked in the anchor. */
    var hostRef = useRef(null);
    /** The row status-dot host: DOM-moved into the row identity, else parked in the anchor. */
    var dotRef = useRef(null);
    /** A flush in flight: the three landing signals must never land the same staged op twice. */
    var flushingRef = useRef(false);
    /** A Cancel click was seen in this editor's session: closing now DROPS the stage (the
     *  page drops its own draft edits the same way) — the opposite of closing by Apply
     *  without a click seen (a restructured footer), which lands the stage. */
    var cancelSeenRef = useRef(false);
    /** A COMMIT (Save/Apply) click was seen in this editor's session, marked in the capture
     *  phase. Its close LANDS the stage — any other close (Cancel, or simply walking away)
     *  DROPS it exactly like the page drops its own draft edits. */
    var commitSeenRef = useRef(false);
    /** A close with no click verdict yet: the decision waits one step (the bubble phase of
     *  the very same click may be the verdict; a close with no click at all — the user
     *  walked away — must DROP the stage). */
    var deferredCloseRef = useRef(false);
    /** Last namespace revision seen — a bump while a stage stands means the page just wrote
     *  ITS own draft through its Save/Apply. */
    var lastRevisionRef = useRef<number | undefined>(undefined);
    /** The last live editor this card's DOM moved into. A real (mouse) click is a DISCRETE
     *  event: React 19 processes its whole effect — including the async `apply()`'s
     *  microtasks and the unmount it causes — before the event ever bubbles to `window`, so
     *  a click listener that insists on a live editor never sees the page's commit control.
     *  This reference lets the bubble listener still recognize the buttons' chain (and the
     *  buttons themselves) in the DOM tree it just detached — and lets the capture listener
     *  catch Cancel BEFORE the close it triggers. */
    var lastEditorRef = useRef(null);

    // Change the stage NOW (ref + live view), schedule the state update the
    // render draws its hint from. Every stage change must ride this path —
    // the state alone would let DOM signals act on one render's stale view.
    function setStaged(ops: SettingsPathOp[] | null): void {
        stagedRef.current = ops;
        var st = stageOf(ops, liveRef.current.active);
        liveRef.current.staged = st.dirty ? ops : null;
        setStagedState(ops);
    }

    // Begin the ONE write any of the three landing signals agreed on. The
    // stage is taken out of local draft state FIRST: the write is no longer
    // the user's local intent, and until it settles no signal may land the
    // same op a second time (the flush-in-flight ref holds the other two
    // signals off). If the attempt ultimately fails, the draft falls back to
    // the stored value and the failure message stands — the choice has to be
    // re-staged deliberately, exactly like any failed write.
    function beginFlush(live: CardLiveView): void {
        if (flushingRef.current || live.staged === null) return;
        var ops = live.staged;
        var flushScope = live.scope;
        var flushRoute = live.route;
        cancelSeenRef.current = false;
        commitSeenRef.current = false;
        flushingRef.current = true;
        landStaged(ops, flushScope, flushRoute).then(
            function (): void {
                flushingRef.current = false;
                setFailure(null);
            },
            function (): void {
                flushingRef.current = false;
                setFailure(COPY.failed);
            }
        );
        // Take the stage out synchronously: a later signal must not re-land
        // it (React batches this with the flush's own state settles).
        setStaged(null);
    }

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

    return {
        failure: failure,
        staged: staged,
        stagedRef: stagedRef,
        liveRef: liveRef,
        anchorRef: anchorRef,
        hostRef: hostRef,
        dotRef: dotRef,
        flushingRef: flushingRef,
        cancelSeenRef: cancelSeenRef,
        commitSeenRef: commitSeenRef,
        deferredCloseRef: deferredCloseRef,
        lastRevisionRef: lastRevisionRef,
        lastEditorRef: lastEditorRef,
        setStaged: setStaged,
        beginFlush: beginFlush,
        deferredDecision: deferredDecision
    };
}
