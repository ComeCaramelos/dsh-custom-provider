/**
 * Browser half — the view's copy.
 *
 * The strings the toggle renders. English is the source of truth (this half
 * registers no locale service); the warning texts carry the two facts the
 * user must not mistake for the other: the reason a foreign header disables
 * the control, and what a rejected write means for the profile.
 */
export const COPY: Record<string, string> = {
    label: "No API key required",
    configured: "No-API-key request header configured",
    hint: 'Disables API key input and sets up the profile so keyless endpoints pass key check.',
    staged: "Staged with this card — stored when the card itself is saved.",
    conflict: 'A custom Authorization header is already set on this provider. Clear it in the profile settings to use this toggle.',
    readOnly: "Settings are read-only in this deployment.",
    failed: "The settings write was rejected; the profile was left unchanged.",
    dotAuthorizationConfigured: "Authorization header configured"
};
