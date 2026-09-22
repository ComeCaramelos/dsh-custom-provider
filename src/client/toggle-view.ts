/**
 * Browser half — the toggle view.
 *
 * The DOM body of the editor block: the control and, while configured, a
 * read-only view of the header it writes. Stateless on purpose — the card
 * component owns the snapshot, the failure draft and the write calls, this
 * half only renders.
 *
 * The control is the shell's `Switch` primitive when the surface resolves
 * one; a plain checkbox stands in when it does not. The primitive is not a
 * module this bundle declares — the runner may or may not have seeded it —
 * so its id is required through a guard: a surface without it is a normal
 * page state, never an error.
 */
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { COPY } from "./copy.js";
import { NO_KEY_HEADER, NO_KEY_VALUE } from "./plugin-meta.js";
import type { ToggleViewProps } from "./types.js";

/** Shell toggle primitive when the surface resolves it; `null` when it does not. */
var SwitchResolved: any = null;
var switchResolved = false;

/**
 * Resolve the shell primitive once. Guarded so a surface without the
 * primitives module simply yields no Switch (the checkbox fallback), never a
 * factory-time failure.
 */
function resolveSwitch(): any {
    if (!switchResolved) {
        switchResolved = true;
        try {
            var primitives = require("@deepseek-ai/dsh-client-ui-primitives");
            SwitchResolved = (primitives && primitives.Switch) || null;
        } catch (error) {
            SwitchResolved = null;
        }
    }
    return SwitchResolved;
}

/**
 * The toggle's DOM (the body half), rendered inside the editor host parked
 * by the card component.
 */
export function ToggleView(props: ToggleViewProps): any {
    var Switch = resolveSwitch();
    var active = props.active === true;
    var conflict = props.conflict === true;
    var disabled = props.writable !== true || conflict;
    var control = Switch ? (
        jsx(Switch, {
            checked: active,
            disabled: disabled,
            label: COPY.label,
            onChange: function (checked: boolean) {
                props.onToggle(checked === true);
            }
        })
    ) : (
        jsxs("label", {
            children: [
                jsx("input", {
                    type: "checkbox",
                    checked: active,
                    disabled: disabled,
                    "aria-label": COPY.label,
                    onChange: function (event: any) {
                        props.onToggle(!!(event && event.target && event.target.checked));
                    }
                }),
                jsx("span", { children: COPY.label })
            ]
        })
    );
    var failure = props.failure || null;
    return jsxs(Fragment, {
        children: [
            jsxs("div", {
                className: "ccp_line",
                children: [
                    control,
                    active ? (
                        jsx("input", {
                            className: "ccp_value",
                            value: NO_KEY_HEADER + ": " + NO_KEY_VALUE,
                            disabled: true,
                            readOnly: true,
                            tabIndex: -1,
                            "aria-label": COPY.configured
                        })
                    ) : null
                ]
            }),
            props.writable ? null : jsx("p", { className: "ccp_warning", children: COPY.readOnly }),
            failure
                ? jsx("p", { className: "ccp_warning", children: failure })
                : conflict
                  ? jsx("p", { className: "ccp_warning", children: COPY.conflict })
                  : props.staged === true
                    ? jsx("p", { className: "ccp_hint", children: COPY.staged })
                    : jsx("p", { className: "ccp_hint", children: COPY.hint })
        ]
    });
}
