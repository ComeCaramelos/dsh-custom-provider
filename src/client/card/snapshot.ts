/**
 * Browser half — `card/`: the namespace scope snapshot as render state.
 *
 * Every pushed `settings/document-updated` lands as a NEW snapshot object and
 * re-renders the card: that is the card's whole connection to stored state
 * (the toggle reads the `user` layer, the dot the resolved `value` layer —
 * `../profile.js` reads them out here). The `getSnapshot` reference is stable
 * per scope, and `subscribe` is re-bound on scope identity only: the scope is
 * bound once at mount, so a churn of props never re-seats the store.
 */
import { useMemo, useSyncExternalStore } from "react";
import type { ScopeSnapshot, SettingsScope } from "../types.js";

/**
 * Subscribe the component to `scope`: the returned snapshot re-renders on
 * every document update.
 * @param scope - the namespace scope bound to this component.
 * @returns the current snapshot, or `undefined` while the scope resolves.
 */
export function useScopeSnapshot(scope: SettingsScope): ScopeSnapshot | undefined {
    var subscribe = useMemo(
        function (): (listener: () => void) => () => void {
            return function (listener) {
                return scope.subscribe(listener);
            };
        },
        [scope]
    );
    return useSyncExternalStore(
        subscribe,
        function (): ScopeSnapshot | undefined {
            return scope.getSnapshot();
        },
        function (): ScopeSnapshot | undefined {
            return scope.getSnapshot();
        }
    );
}
