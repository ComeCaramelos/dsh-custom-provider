/**
 * Host half — the mount.
 *
 * Inert: everything happens in `lib/client.js` (slot registration, the toggle
 * component, the row status dot). Cordis still calls `apply` on every mount —
 * it registers no services, owns no settings section and opens no wire
 * protocol, so this only keeps the two halves loading as one bundle.
 */

export function apply(): void {}
