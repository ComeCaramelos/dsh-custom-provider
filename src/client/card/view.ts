/**
 * Browser half — `card/`: what one render claims about the card.
 *
 * The pure view of the seat: from the owner props and the snapshot it resolves
 * the gates (which host may stand where) and the stored facts every part of
 * the component re-reads. Nothing here touches the DOM or the mutable state —
 * the staging facts arrive as parameters (render state and the synchronous
 * reference) because the DOM signals read the synchronous one while the hint
 * draws from the state, and the view states both sides of that pair.
 */
import { hasForeignAuthorization, isNoKeyActive, showDot, showToggle, stageOf } from "../profile.js";
import type { NoApiKeyToggleCardProps, ScopeSnapshot, SettingsPathOp } from "../types.js";

/** Every gate and fact one render draws. */
export interface CardView {
    /** The toggle stands on this card (`showToggle`'s gate). */
    visible: boolean;
    /** The row dot stands on this card (`showDot`'s gate — not the toggle's). */
    dot: boolean;
    /** The route id the facts are read under (empty when the toggle is off). */
    route: string;
    /** The scope resolves — without it no fact stands. */
    ready: boolean;
    /** The no-key header stands in the STORED (user-layer) profile. */
    active: boolean;
    /** Writes may land at all. */
    writable: boolean;
    /** A foreign `Authorization` stands: the toggle renders off and disabled. */
    conflict: boolean;
    /** What the STAGED state shows (render-side; `stageOf` over the state). */
    stage: { draftActive: boolean; dirty: boolean };
    /** What the SYNCHRONOUS stage shows (what DOM signals just consumed). */
    liveStage: { draftActive: boolean; dirty: boolean };
}

/**
 * Resolve the view's gates and facts.
 * @param props - the seat's owner props plus the bound scope.
 * @param snapshot - the current scope snapshot.
 * @param staged - the staged ops as render state (`null` for none).
 * @param stagedNow - the staged ops as the synchronous reference.
 */
export function resolveCardView(
    props: NoApiKeyToggleCardProps,
    snapshot: ScopeSnapshot | undefined,
    staged: SettingsPathOp[] | null,
    stagedNow: SettingsPathOp[] | null
): CardView {
    var visible = showToggle(props);
    var dot = showDot(props, snapshot);
    var route = visible ? props.provider!.provider || "" : "";
    var ready = !!snapshot && snapshot.status === "ready";
    var active = visible && ready && isNoKeyActive(snapshot, route);
    var writable = ready && snapshot!.writable === true;
    // A staged direction differs from the STORED value only while it is
    // worth saying; once the stored value matches it, the stage is spent.
    return {
        visible: visible,
        dot: dot,
        route: route,
        ready: ready,
        active: active,
        writable: writable,
        conflict: visible && ready && hasForeignAuthorization(snapshot, route),
        stage: stageOf(staged, active),
        liveStage: stageOf(stagedNow, active)
    };
}
