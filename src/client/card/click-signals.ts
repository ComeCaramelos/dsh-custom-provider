/**
 * Browser half — `card/`: the window click listeners that judge each click.
 *
 * The editor persists every field through its own Save/Apply — this card's
 * click only STAGED the choice — so the page's commit control is what lands
 * it. Two listeners, two phases, because a real MOUSE click is a DISCRETE
 * event: React 19 drains its whole effect (the async `apply()`'s microtasks
 * included — and with no page-field edits it awaits nothing that matters)
 * synchronously inside the root container's handler, and the editor is
 * already unmounted by the time the event bubbles to `window`. A bubble-only
 * listener that demands a live editor therefore never sees the page's commit
 * control in the very case that matters.
 *
 * - CAPTURE (window, before React's root handler — the DOM is still live):
 *   marks Cancel clicks on THIS card's row so the close it triggers is read
 *   as a DROP, never as a save.
 * - BUBBLE (window, after React's queued `writeSettings`, so a staged write
 *   lands behind theirs and their still-stale `expectedRevision` fence never
 *   conflicts): lands the stage on the commit control — recognizing it either
 *   in a live editor or in the detached tree this card's host just stood in
 *   (`lastEditorRef`).
 */
import { useEffect } from "react";
import { findCancelWithin, findCommitWithin, findEditorWithin, hasClassEnding, PRIMARY_BUTTON_CLASS_END, SECONDARY_BUTTON_CLASS_END } from "../dom.js";
import type { CardState } from "./state.js";

/** Attach the capture verdict marker and the bubble commit lander to `window`. */
export function useClickSignals(state: CardState): void {
    useEffect(
        function (): () => void {
            if (typeof window === "undefined" || typeof window.addEventListener !== "function") return function (): void {};

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
                var anchor = state.anchorRef.current;
                if (!anchor || !anchor.isConnected || typeof anchor.closest !== "function") return;
                var row = anchor.closest("li");
                if (!row || target.closest("li") !== row) return;
                var button = buttonInChain(target, row);
                if (button === "cancel") {
                    state.cancelSeenRef.current = true;
                    state.commitSeenRef.current = false;
                } else if (button === "commit") {
                    state.commitSeenRef.current = true;
                    state.cancelSeenRef.current = false;
                }
            }

            function onWindowClick(event: any): void {
                var target = event && event.target;
                var anchor = state.anchorRef.current;
                if (!target || !anchor || !anchor.isConnected) return;
                var card = typeof anchor.closest === "function" ? anchor.closest("li") : null;
                var live = state.liveRef.current;
                var editor = findEditorWithin(card);
                var last = state.lastEditorRef.current;
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
                    state.cancelSeenRef.current = true;
                    if (live.staged !== null) state.setStaged(null);
                    return;
                }
                if (live.staged === null) return;
                state.beginFlush(live);
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
}
