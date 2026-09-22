/**
 * Host half — the identity this bundle registers under.
 *
 * Cordis reads `name` off the module and uses it as the row id in the profile
 * bundle (see `cordis.patch.yml`, whose `config {}` is inert). Nothing is
 * consumed host-side: the whole feature is web-plane, so `inject` is empty —
 * installing a plugin-owned settings section here would fork the state the
 * browser half reads through the adapter's namespace.
 */

/** Cordis row id in the profile bundle (matches `cordis.patch.yml`). */
export const name = "custom-provider";

/** Nothing consumed host-side. */
export const inject: string[] = [];
