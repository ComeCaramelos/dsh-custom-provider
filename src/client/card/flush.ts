/**
 * Browser half — `card/`: the staged write's ONE landing attempt.
 *
 * The pure machinery the flush gate (`state.beginFlush`) hands its staged ops
 * to. The write only stands when the STORED state ends up matching the staged
 * direction: a rejection (the page's own save bumped the revision under a
 * stale fence — a stale-fence rejection has already re-read the scope) gets
 * exactly ONE replay, and the chain rejects only when the replay still
 * disagrees.
 *
 * The route is CAPTURED for the flush: the editor may unmount mid-flight
 * (the card closing), which zeroes the live view's route, and reading it
 * there would mistake an unset profile for the OFF target and drop an
 * unsaved OFF.
 */
import { isNoKeyActive, stagedDirection } from "../profile.js";
import type { SettingsPathOp, SettingsScope } from "../types.js";

/**
 * Land `ops` against `flushScope`, one attempt plus one replay. Resolves when
 * the stored state matches the staged direction; rejects otherwise (the
 * caller then falls the draft back to the stored value).
 * @param ops - the staged path ops (`set` ON, `unset` OFF, never the whole map).
 * @param flushScope - the scope captured when the flush began.
 * @param flushRoute - the route captured when the flush began.
 */
export function landStaged(ops: SettingsPathOp[], flushScope: SettingsScope, flushRoute: string): Promise<unknown> {
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
    // The first attempt waits one microtask: whatever signal tripped this
    // flush (a commit click, a revision bump, a close verdict) has more work
    // queued in the same tick — the write must land BEHIND the page's own.
    return Promise.resolve().then(function () {
        return attempt(false);
    });
}
