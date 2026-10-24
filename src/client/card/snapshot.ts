/**
 * Browser half — `card/`: the config-form snapshot as render state.
 *
 * Every pushed `settings/document-updated` lands as a NEW snapshot object and
 * re-renders the card: that is the card's whole connection to stored state
 * (the toggle reads the `user` layer, the dot the resolved `value` layer —
 * `../profile.js` reads them out here). The `getSnapshot` reference is stable
 * per form, and `subscribe` is re-bound on form identity only: the form is
 * taken once at mount, so a churn of props never re-seats the store.
 */
import { useMemo, useSyncExternalStore } from "react";
import type { ConfigForm, ConfigFormSnapshot } from "../types.js";

/**
 * Subscribe the component to `scope`: the returned snapshot re-renders on
 * every document update.
 * @param scope - the adapter entry's config form bound to this component.
 * @returns the current snapshot (`loading` while the form resolves — the form
 *  never answers `undefined`).
 */
export function useScopeSnapshot(scope: ConfigForm): ConfigFormSnapshot {
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
        function (): ConfigFormSnapshot {
            return scope.getSnapshot();
        },
        function (): ConfigFormSnapshot {
            return scope.getSnapshot();
        }
    );
}
