/**
 * Browser half — `card/`: parking both hosts across the page's own re-mounts.
 *
 * The anchor marks "which card this is"; both hosts stand inside it until
 * their gate parks them where the page shows them: the toggle host inside the
 * open `*_editor` right after the API-key field, the status dot inside the
 * row-head identity block. Every move is a DOM MOVE — never a React unmount
 * (deleting a node the fiber tracks inside the anchor throws NotFoundError
 * inside the commit and kills the card). The churn observer re-parks on every
 * subtree change, so the page re-mapping its row or editor is harmless: the
 * same moves are idempotent (`../dom.js`).
 *
 * The observer also watches for the editor closing WHILE a stage stands, and
 * the close's verdict is a cross-signal call: in a real (mouse) click the
 * close lands INSIDE the click's own discrete processing — before this
 * observer, before any bubble listener — so whatever the capture-phase
 * listeners left in `cancelSeenRef`/`commitSeenRef` decides:
 *
 * - Cancel clicked      → DROPS the stage, exactly like the page drops its
 *   own draft edits;
 * - Apply clicked       → LANDS it: the page's own write is already queued
 *   ahead (its apply awaits `writeSettings` before closing), so ours fences
 *   cleanly behind it;
 * - no verdict seen     → wait one step (the bubble of the very same click
 *   may still be the verdict; a walk-away close DROPS the stage).
 */
import { useEffect } from "react";
import { findEditorWithin, positionDot, positionHost } from "../dom.js";
import type { CardState } from "./state.js";

function noop(): void {}

/**
 * Keep both hosts parked where their gate stands, re-parked on every churn,
 * and retire both out of the page DOM BEFORE React's teardown cascade can
 * reach them when the component unmounts.
 * @param state - the card's shared state (refs in, refs out — the moves read
 *  the live view the component refreshes every render).
 * @param visible - the toggle's gate (re-park when it flips).
 * @param active - the stored no-key state (drives the password disable).
 * @param dot - the dot's gate (re-park when it flips).
 */
export function usePlacement(state: CardState, visible: boolean, active: boolean, dot: boolean): void {
    useEffect(
        function (): () => void {
            var anchor = state.anchorRef.current;
            if (!anchor || typeof MutationObserver !== "function" || typeof document === "undefined") return noop;
            var hostEl = state.hostRef.current;
            var dotEl = state.dotRef.current;
            function cardOf(): any {
                return anchor!.isConnected && typeof anchor!.closest === "function" ? anchor!.closest("li") : null;
            }
            function position(): void {
                var card = cardOf();
                var live = state.liveRef.current;
                var editorNode = findEditorWithin(card);
                if (editorNode) state.lastEditorRef.current = editorNode;
                if (hostEl) positionHost(hostEl, card, anchor, live.visible, live.active);
                if (dotEl) positionDot(dotEl, card, anchor, live.dot);
                // The editor is gone while a stage still stands: whatever
                // the close was, the stage cannot sit and wait for a
                // Save/Apply that is already unmounted. The capture-phase
                // verdicts decide — Cancel drops, Apply lands, none waits
                // one step for the bubble (see the module note above).
                if (live.staged !== null && editorNode === null) {
                    if (state.cancelSeenRef.current) {
                        state.cancelSeenRef.current = false;
                        state.commitSeenRef.current = false;
                        state.setStaged(null);
                    } else if (state.commitSeenRef.current) {
                        if (!state.flushingRef.current) state.beginFlush(live);
                    } else {
                        state.deferredCloseRef.current = true;
                        Promise.resolve().then(state.deferredDecision);
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
}
