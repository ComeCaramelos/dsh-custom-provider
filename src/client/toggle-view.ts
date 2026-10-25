/**
 * Browser half — the toggle view.
 *
 * The DOM body of the editor block: the control and, while configured, a
 * read-only view of the header it writes. Stateless on purpose — the card
 * component owns the snapshot, the failure draft and the write calls, this
 * half only renders.
 *
 * The control is the shared `SwitchField` of `@comecaramelos/dsh-ancesters`
 * (its `row` variant: the switch alone, the line already names it), which
 * draws the shell's own `Switch` primitive — the same switch every ancestor
 * card shows, styled by the shared sheet `ensureCss` installs. The field asks
 * for a toggle, not a value: what "on" means stays this card's answer.
 */
import { SwitchField } from "@comecaramelos/dsh-ancesters/client/blocks";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { COPY } from "./copy.js";
import { NO_KEY_HEADER, NO_KEY_VALUE } from "./plugin-meta.js";
import type { ToggleViewProps } from "./types.js";

/**
 * The toggle's DOM (the body half), rendered inside the editor host parked
 * by the card component.
 */
export function ToggleView(props: ToggleViewProps): any {
    var active = props.active === true;
    var conflict = props.conflict === true;
    var disabled = props.writable !== true || conflict;
    var control = jsx(SwitchField, {
        variant: "row",
        label: COPY.label,
        checked: active,
        disabled: disabled,
        onToggle: function () {
            props.onToggle(!active);
        }
    });
    var failure = props.failure || null;
    return jsxs(Fragment, {
        children: [
            jsxs("div", {
                className: "ccp_line",
                children: [
                    control,
                    jsx("span", { className: "ccp_label", children: COPY.label }),
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
            props.writable ? null : jsx("p", { className: "ccp_warning", children: props.unavailable === true ? COPY.unavailable : COPY.readOnly }),
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
