/**
 * @comecaramelos/dsh-custom-provider — host half, public surface.
 *
 * The host half is inert by design: it registers the bundle row (`name` +
 * `inject`) and mounts a no-op, because the whole feature lives in the
 * browser bundle (`lib/client.js`) — slot registration, the "No API key
 * required" toggle and the row status dot are all web-plane, and the
 * namespace they read/write is the `pi-ai` adapter's, already served. A
 * plugin-owned settings section here would fork that state.
 *
 * Re-export only: nothing here decides anything. The modules behind it keep
 * the same contract cordis reads (`name`, `inject`, `apply`) — the row exists
 * only so the bundle (and with it the web plane) loads.
 *
 * @module lib/index
 */
export { apply } from "./host/apply.js";
export { inject, name } from "./host/plugin-meta.js";
export type { Dispose, HostContext } from "./host/types.js";
