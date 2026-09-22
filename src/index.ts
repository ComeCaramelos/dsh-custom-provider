/**
 * @comecaramelos/dsh-custom-provider — host half.
 *
 * The whole feature lives in the browser bundle (`lib/client.js`, built from
 * `src/client.ts`): it registers into the Models page's
 * `settings.models.provider-card` slot and writes the `llm-pi-ai` settings
 * namespace that the pi-ai adapter already serves, so this half owns no
 * services, no settings section and no wire protocol. The row exists only so
 * the bundle (and with it the web plane) loads.
 *
 * Keep the two names stable: cordis reads `name`/`inject` off the module and
 * calls `apply` on every mount.
 *
 * @module lib/index
 */

/** A host-context dispose function (structural — no cordis value import here). */
export type Dispose = () => void;

/** The slice of the host context this half consumes: none. */
export type HostContext = Record<string, unknown>;

/** Cordis row id in the profile bundle (matches `cordis.patch.yml`). */
export const name = "custom-provider";

/** Nothing consumed host-side. */
export const inject: string[] = [];

/** Inert mount: everything happens in `lib/client.js`. */
function apply(): void {}

export { apply };
