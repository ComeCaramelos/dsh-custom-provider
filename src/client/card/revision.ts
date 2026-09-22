/**
 * Browser half — `card/`: the namespace-revision watcher.
 *
 * While a stage stands, the moment the namespace revision moves is the moment
 * the page wrote its own draft through its Save/Apply — its write is already
 * queued ahead of any we land, so this card's staged op fences cleanly behind
 * it. A bump with no stage tells us nothing worth acting on; a bump the page
 * never got to announce (the first one after the stage stands) still lands.
 */
import { useEffect } from "react";
import type { CardState } from "./state.js";
import type { SettingsScope } from "../types.js";

function noop(): void {}

/**
 * Watch `scope` for the revision bump that means the page just saved, and
 * hand any standing stage to the flush.
 * @param state - the card's shared state.
 * @param scope - the namespace scope bound to this component.
 */
export function useRevisionWatch(state: CardState, scope: SettingsScope): void {
    useEffect(
        function (): () => void {
            if (!scope || typeof scope.subscribe !== "function") return noop;
            // Seed the last seen revision NOW: a bump is the page's write —
            // the very first bump after the stage stands must already count
            // (a baseline-seed-less `last === undefined` would swallow it).
            var seed = scope.getSnapshot();
            state.lastRevisionRef.current = seed ? seed.revision : undefined;
            function onScopeChange(): void {
                var live = state.liveRef.current;
                var snap = live.scope ? live.scope.getSnapshot() : undefined;
                var revision = snap ? snap.revision : undefined;
                var last = state.lastRevisionRef.current;
                state.lastRevisionRef.current = revision;
                if (last === undefined || revision === undefined || revision === last) return;
                if (live.staged !== null && !state.flushingRef.current) state.beginFlush(live);
            }
            try {
                return scope.subscribe(onScopeChange);
            } catch {
                return noop;
            }
        },
        [scope]
    );
}
