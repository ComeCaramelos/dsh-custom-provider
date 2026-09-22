/**
 * @comecaramelos/dsh-custom-provider — browser half, public surface.
 *
 * The one module the bundler walks, so the emitted `client.js` exports exactly
 * what the loader and the tests consume: `apply` (the mount), the component
 * halves (`NoApiKeyToggleCard`, `ToggleView`), the pure read/write surface
 * they share (`profileHeaders` … `showToggle`), the DOM placement helpers, and
 * the identifiers this half registers under (`inject`, `SETTINGS_NS`,
 * `NO_KEY_HEADER`, `NO_KEY_VALUE`).
 *
 * Re-export only: nothing here decides anything. The pure surface is on this
 * face only so the tests can drive it; the loader ignores it.
 */
export { apply } from "./apply.js";
export { NoApiKeyToggleCard } from "./card.js";
export { ToggleView } from "./toggle-view.js";
export {
    clearOps,
    configureOps,
    hasForeignAuthorization,
    headerConfigured,
    isNoKeyActive,
    noKeyPath,
    profileHeaders,
    resolvedProfile,
    showDot,
    showToggle,
    stageOf,
    stagedDirection,
    stagedOps
} from "./profile.js";
export {
    findActionsWithin,
    findButtonWithin,
    findCancelWithin,
    findCommitWithin,
    findEditorWithin,
    findKeyFieldWithin,
    findRowIdentityWithin,
    hasClassEnding,
    hasCredentialDotWithin,
    positionDot,
    positionHost,
    PRIMARY_BUTTON_CLASS_END,
    SECONDARY_BUTTON_CLASS_END
} from "./dom.js";
export { inject, NO_KEY_HEADER, NO_KEY_VALUE, SETTINGS_NS } from "./plugin-meta.js";
