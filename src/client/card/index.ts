/**
 * Browser half — `card/`: the seat component, split by concern.
 *
 * The face of the split: it states what the directory exports (the one seat
 * component the slot registers) and decides nothing. The machinery behind it
 * lives in the pieces this component composes —
 *
 * - `state.ts`     the mutable state every effect shares (refs, staging, flush gates);
 * - `snapshot.ts`  the scope snapshot as React state (`useSyncExternalStore`);
 * - `view.ts`      what a render claims: the gates, the stored/active facts, the stage;
 * - `flush.ts`     the one landing attempt the staged write gets;
 * - `placement.ts` parking both hosts across the page's own re-mounts (churn observer);
 * - `signals.ts`   the window click listeners (capture verdicts, bubble commit landing);
 * - `revision.ts`  the namespace-revision watcher (the page's own save lands the stage);
 * - `toggle-card.ts` the composition and the rendered hosts.
 *
 * Nothing outside this component is a second surface: `src/client/index.ts`
 * re-exports exactly `NoApiKeyToggleCard` from here, so the emitted bundle's
 * public face is unchanged by the split.
 */
export { NoApiKeyToggleCard } from "./toggle-card.js";
