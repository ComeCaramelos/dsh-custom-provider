/**
 * Browser half — `card/`: the seat component, composed.
 *
 * One `settings.models.provider-card` seat occurrence per saved card. It
 * renders inside a hidden anchor — which marks "which card this is" — and TWO
 * hosts rendered INSIDE that anchor, always rendered, never conditionally:
 * the toggle view (`div.ccp_editorHost`), DOM-moved (parked) into the open
 * `*_editor` right after the API-key field while the gate stands, and the
 * row status dot (`span.ccp_dot`, DOM-moved into the row-head identity
 * block, the very spot where the page parks its own credential dot — ours
 * only when that page dot is absent).
 *
 * Why always rendered: React deletes DOM nodes when a tree flips them off.
 * For a node that React itself tracks inside the anchor but the observer has
 * DOM-moved OUT to the editor/identity, that deletion calls
 * `hostParent.removeChild(moved)` against the fiber's parent — the anchor —
 * and throws `NotFoundError: The node is not a child of this node`. The
 * error lands on the slot's error boundary, the card dies (an un-clickable
 * toggle, gone on reopen) — hence: nothing this component renders is ever
 * unmounted mid-mount; showing/hiding a host is a DOM move in or out of the
 * anchor (park/retire), never a React unmount. The anchor itself only goes
 * away with the component, and the placement hook below first detaches both
 * hosts, so React never deletes a moved node.
 *
 * Everything the original monolith did lives behind this composition, one
 * concern per module — the scope store (`snapshot.ts`), the view's gates and
 * facts (`view.ts`), the shared staging/flush state (`state.ts`, with its
 * one landing attempt in `flush.ts`), and the three DOM-facing signal hooks
 * (`placement.ts`, `click-signals.ts`, `revision.ts`). The toggle NEVER
 * writes on a click: the choice stages locally, the way the page's own
 * editor fields stage their draft, and lands through the scope's fenced
 * mutation queue when the page's own Save/Apply runs. The dot never writes,
 * in any rhythm.
 */
import { useEffect } from "react";
import { jsx } from "react/jsx-runtime";
import { COPY } from "../copy.js";
import { stagedOps } from "../profile.js";
import { ToggleView } from "../toggle-view.js";
import type { NoApiKeyToggleCardProps } from "../types.js";
import { useClickSignals } from "./click-signals.js";
import { usePlacement } from "./placement.js";
import { useRevisionWatch } from "./revision.js";
import { useCardState } from "./state.js";
import { useScopeSnapshot } from "./snapshot.js";
import { resolveCardView } from "./view.js";

export function NoApiKeyToggleCard(props: NoApiKeyToggleCardProps): any {
    var scope = props.scope;
    var state = useCardState(scope);
    var snapshot = useScopeSnapshot(scope);

    var view = resolveCardView(props, snapshot, state.staged, state.stagedRef.current);

    // Refresh the live view the DOM-dispatched signals read: they run off the
    // page, not off this render, and must never act on what an earlier render
    // left standing. A spent stage is not staged: the live view holds the
    // stage only while it still says something.
    state.liveRef.current = {
        visible: view.visible,
        dot: view.dot,
        active: view.active,
        route: view.route,
        scope: scope,
        staged: view.liveStage.dirty ? state.stagedRef.current : null
    };

    // Park/retire both hosts across churn (+ the close-with-stage verdict)…
    usePlacement(state, view.visible, view.active, view.dot);
    // …the commit/cancel click verdicts…
    useClickSignals(state);
    // …and the revision bump that means the page's own save just ran.
    useRevisionWatch(state, scope);

    function onToggle(checked: boolean): void {
        if (view.conflict) return;
        if (checked === view.stage.draftActive) return;
        // Staged, never written: the editor persists every other field the
        // same way, only when its Save/Apply runs. A new draft starts with
        // no pending click verdicts.
        state.cancelSeenRef.current = false;
        state.commitSeenRef.current = false;
        state.setStaged(stagedOps(checked, view.active, view.route));
    }

    // Once the STORED value matches the staged direction, the stage is spent:
    // clear the state, so an old stage can never re-land a stale choice.
    useEffect(
        function (): void {
            if (state.staged !== null && !view.stage.dirty) state.setStaged(null);
        },
        [state.staged, view.stage.dirty]
    );

    return jsx("div", {
        ref: state.anchorRef,
        className: "ccp_anchor",
        "aria-hidden": "true",
        children: [
            // Both hosts render HERE, inside the anchor, always: showing one
            // is the DOM move of the same node (park) — hiding one moves it
            // back (retire) — never a React unmount, or React would delete a
            // node it is not standing on.
            jsx("div", {
                ref: state.hostRef,
                className: "ccp_editorHost",
                children: view.visible
                    ? jsx(ToggleView, { active: view.stage.draftActive, staged: view.stage.dirty, writable: view.writable, conflict: view.conflict, failure: state.failure, onToggle: onToggle })
                    : null
            }),
            jsx("span", {
                ref: state.dotRef,
                className: "ccp_dot",
                role: "img",
                "aria-label": COPY.dotAuthorizationConfigured,
                title: COPY.dotAuthorizationConfigured
            })
        ]
    });
}
