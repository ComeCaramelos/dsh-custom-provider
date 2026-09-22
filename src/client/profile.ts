/**
 * Browser half — the pure read/write surface.
 *
 * Every fact the card claims about a route's profile resolves here, against
 * the namespace scope snapshot, and every mutation this plugin issues is
 * described here as an op. Nothing in this module touches the DOM, React or
 * the shell services; it is the module the tests drive directly.
 *
 * Two layers, deliberately read apart:
 *
 * - the **user** layer backs the toggle (`profileHeaders`): presence there is
 *   what marks the field configured *by this card*, and it is what this card
 *   writes back;
 * - the resolved **value** layer backs the row status dot (`resolvedProfile`):
 *   what matters for the dot is what actually rides the wire, so a header
 *   folded in from the base layer counts.
 *
 * The writes address the single header key rather than the whole `headers`
 * map — both directions — so a profile whose owner maintains other headers
 * by hand keeps them.
 */
import { NO_KEY_HEADER, NO_KEY_VALUE } from "./plugin-meta.js";
import type {
    ProfileHeaderMap,
    ProviderOwner,
    ResolvedProfile,
    ScopeSnapshot,
    SettingsPathOp
} from "./types.js";

/**
 * The hand-written request headers of one route's user-layer profile.
 * Presence in the user layer is what marks the header configured; the
 * resolved `value` would ride the adapter's base profiles and could
 * show a header the user never stored.
 * @param snapshot - the namespace scope snapshot.
 * @param route - the provider route id.
 * @returns the header map, or undefined when the route names none.
 */
export function profileHeaders(snapshot: ScopeSnapshot | undefined, route: string): ProfileHeaderMap | undefined {
    var user = snapshot && snapshot.user;
    var profile = user && user.providers && user.providers[route];
    var headers = profile && profile.headers;
    if (!headers || typeof headers !== "object" || Array.isArray(headers)) return undefined;
    return headers as ProfileHeaderMap;
}

/**
 * Whether the no-key placeholder header stands on this route. Only the
 * exact value counts; an `Authorization` the user typed themselves is
 * not this toggle's state.
 */
export function isNoKeyActive(snapshot: ScopeSnapshot | undefined, route: string): boolean {
    var headers = profileHeaders(snapshot, route);
    return !!headers && headers[NO_KEY_HEADER] === NO_KEY_VALUE;
}

/**
 * Whether the route carries an `Authorization` header with some other
 * value. That header already wins the `authorization` check and is the
 * user's own configuration — this toggle neither claims nor overwrites
 * it, so the view must stay off and disabled with the reason shown.
 * The value itself is never read out (it can be a real key).
 */
export function hasForeignAuthorization(snapshot: ScopeSnapshot | undefined, route: string): boolean {
    var headers = profileHeaders(snapshot, route);
    return !!headers && Object.prototype.hasOwnProperty.call(headers, NO_KEY_HEADER) && headers[NO_KEY_HEADER] !== NO_KEY_VALUE;
}

/**
 * The profile of one route in the RESOLVED (`value`) layer: the
 * document that actually rides the wire — user writes folded in,
 * composed over the base layer. The toggle reads the `user` layer for
 * its own state; the row dot reads this layer, because what matters
 * is what the adapter SENDS (a header inherited from `base` counts).
 * @param snapshot - the namespace scope snapshot.
 * @param route - the provider route id.
 * @returns the profile, or `undefined` when the route names none.
 */
export function resolvedProfile(snapshot: ScopeSnapshot | undefined, route: string): ResolvedProfile | undefined {
    var value = snapshot && snapshot.value;
    if (!value || typeof value !== "object") return undefined;
    var providers = (value as { providers?: unknown }).providers;
    if (!providers || typeof providers !== "object") return undefined;
    var profile = (providers as Record<string, unknown>)[route];
    return profile && typeof profile === "object" ? (profile as ResolvedProfile) : undefined;
}

/**
 * Whether a resolved profile carries a NON-EMPTY `Authorization`
 * header, spelled in any casing. This is exactly what pi-ai's key
 * check accepts on the wire (`getClientApiKey` in
 * `openai-completions.js`), so it is the single fact the row dot
 * reports. The value itself is never read out — it can be a real
 * credential.
 */
export function headerConfigured(profile: ResolvedProfile | undefined): boolean {
    var headers = profile && profile.headers;
    if (!headers || typeof headers !== "object" || Array.isArray(headers)) return false;
    var names = Object.keys(headers as Record<string, unknown>);
    for (var i = 0; i < names.length; i++) {
        if (names[i].toLowerCase() === "authorization") {
            var value = (headers as Record<string, unknown>)[names[i]];
            return typeof value === "string" && value.trim().length > 0;
        }
    }
    return false;
}

/**
 * Whether the row earns the plugin's own dot. The gate is narrower
 * than the toggle's and shallower than it looks: a hand-declared
 * route (never decorate shipped adapters) whose RESOLVED profile
 * authenticates by header. `keyConfigured` decides nothing — the
 * referenced-key fact and the own-header fact are distinct, and a
 * key-configured row still lights it only when the page shows no dot
 * of its own (the DOM check in `positionDot` never parks two). Pure
 * observation: nothing here writes.
 */
export function showDot(owner: ProviderOwner | undefined, snapshot: ScopeSnapshot | undefined): boolean {
    var provider = owner && owner.provider;
    if (!(provider && provider.declared === true && typeof provider.provider === "string" && provider.provider.length > 0)) {
        return false;
    }
    if (!(snapshot && snapshot.status === "ready")) return false;
    return headerConfigured(resolvedProfile(snapshot, provider.provider));
}

/** One whole-map `unset` would erase headers the user keeps by hand, so writes address the single key. */
export function noKeyPath(route: string): string[] {
    return ["providers", route, "headers", NO_KEY_HEADER];
}

/** Ops that turn the route keyless: a per-key set creates the headers map as needed. */
export function configureOps(route: string): SettingsPathOp[] {
    return [{ op: "set", path: noKeyPath(route), value: NO_KEY_VALUE }];
}

/** Ops that restore the stock flow: clears this header only, keeping any other. */
export function clearOps(route: string): SettingsPathOp[] {
    return [{ op: "unset", path: noKeyPath(route) }];
}

/** Which way a staged op leans: `set` stands ON, `unset` stands OFF. */
export function stagedDirection(ops: SettingsPathOp[] | null): boolean {
    return !!ops && ops[0] !== undefined && ops[0].op === "set";
}

/**
 * What a click STAGES (the card never writes on a click): the editor keeps
 * every other field as a draft and persists it only through its Save/Apply,
 * so the toggle's choice waits for the same moment. A click that agrees
 * with the stored value stages nothing.
 */
export function stagedOps(checked: boolean, storedActive: boolean, route: string): SettingsPathOp[] | null {
    if (checked === storedActive) return null;
    return checked ? configureOps(route) : clearOps(route);
}

/**
 * What a staged choice SHOWS while nothing has landed: a dirty stage takes
 * the value over, a spent one falls back to the stored value. The stored
 * value alone never lies.
 */
export function stageOf(ops: SettingsPathOp[] | null, storedActive: boolean): { draftActive: boolean; dirty: boolean } {
    if (ops === null) return { draftActive: storedActive, dirty: false };
    var on = stagedDirection(ops);
    var dirty = on !== storedActive;
    return { draftActive: dirty ? on : storedActive, dirty };
}

/**
 * Whether the seat's owner props call for the toggle: a hand-declared
 * route (the shipped adapters own their credential flow), with a
 * profile that resolves, and no confirmed credential — a row that can
 * already authenticate should keep that path, not be forced through
 * headers.
 */
export function showToggle(owner: ProviderOwner | undefined): boolean {
    var provider = owner && owner.provider;
    return !!(provider && provider.declared === true && owner!.configured === true && owner!.keyConfigured === false);
}
