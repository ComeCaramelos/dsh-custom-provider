/**
 * Browser half — the identifiers this bundle registers under.
 *
 * These are the contract shared with the page and with the Host: the
 * namespace this card claims is the namespace the hand-declared routes live
 * in, and the two constants it writes are exactly what the `pi-ai`
 * openai-completions key check accepts in place of a key. Declared once here
 * and imported by every other module of this half.
 */

/** The `pi-ai` adapter's settings namespace — the family this card claims. */
export const SETTINGS_NS = "llm-pi-ai";

/** Header pi-ai accepts in place of a key. */
export const NO_KEY_HEADER = "Authorization";

/** The placeholder value written when the toggle stands on. */
export const NO_KEY_VALUE = "Bearer none";

/** Browser services consumed by this half (`slots` is wrapped in by the web runner). */
export const inject: string[] = ["settingsScope", "slots"];
