/**
 * Browser half — `card/`: the staged write's ONE landing attempt.
 *
 * The pure machinery the flush gate (`state.beginFlush`) hands its staged ops
 * to. The write stands when the Host accepts it (or the STORED state already
 * matches the staged direction): a refusal (`mutate` answers `false` — the page's own save bumped
 * the revision under a stale fence, and the form has already run its recovery
 * read) gets exactly ONE replay, and the chain rejects only when the replay
 * still disagrees. A transport failure rejects straight through.
 *
 * The route is CAPTURED for the flush: the editor may unmount mid-flight
 * (the card closing), which zeroes the live view's route, and reading it
 * there would mistake an unset profile for the OFF target and drop an
 * unsaved OFF.
 */
import { isNoKeyActive, stagedDirection } from "../profile.js";
import type { ConfigForm, SettingsPathOp } from "../types.js";

/**
 * Land `ops` against `flushScope`, one attempt plus one replay. Resolves when
 * the stored state matches the staged direction; rejects otherwise (the
 * caller then falls the draft back to the stored value).
 * @param ops - the staged path ops (`set` ON, `unset` OFF, never the whole map).
 * @param flushScope - the config form captured when the flush began.
 * @param flushRoute - the route captured when the flush began.
 */
export function landStaged(ops: SettingsPathOp[], flushScope: ConfigForm, flushRoute: string): Promise<unknown> {
    var target = stagedDirection(ops);
    function stands(): boolean {
        var snapshotNow = flushScope.getSnapshot();
        return !!snapshotNow && snapshotNow.status === "ready" && isNoKeyActive(snapshotNow, flushRoute) === target;
    }
    function attempt(retry: boolean): Promise<unknown> {
        if (stands()) return Promise.resolve();
        // No explicit fence: the form fences on the latest revision it knows,
        // which is the page's own write queued ahead of this one.
        return flushScope.mutate(ops).then(function (accepted: boolean) {
            // Host acceptance IS the landing; the pushed snapshot follows.
            if (accepted === true) return;
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
