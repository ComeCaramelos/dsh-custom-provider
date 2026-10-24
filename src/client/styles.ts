/**
 * Browser half — the component's stylesheet.
 *
 * The plugin never references the Models page's hashed CSS-module class names
 * (they churn every rebuild); its own rules ride in under stable `ccp_*`
 * class names. The colors come from the design-system alias variables the
 * page already defines — nothing here invents a shade — and the metrics copy
 * the editor's own field (measured on the live page): a 6px stack gap, the
 * label at 12px/18px weight 500 in `label-secondary`, hint and warning lines
 * at 12px/18px. The line keeps the input row's 22px height so the switch
 * never makes the field jump.
 *
 * Injection is `@comecaramelos/dsh-ancesters`' `injectCardStyles`: the shared
 * sheet (the one `SwitchField` draws with) first, then this sheet, each keyed
 * by its content — so a page that already carries an ancestor card's copy of
 * the shared sheet never stacks a second one, and a re-mount injects nothing.
 */
import { injectCardStyles } from "@comecaramelos/dsh-ancesters/styles";

/** The whole rule sheet — plugin-owned classes, never page class names. */
export var CSS =
    ".ccp_editorHost{display:flex;flex-direction:column;gap:6px}" +
    ".ccp_dot{display:inline-block;flex:none;width:8px;height:8px;border-radius:50%;background:var(--dsw-alias-state-success-primary)}" +
    ".ccp_anchor{display:none}" +
    ".ccp_line{align-items:center;gap:8px;display:flex;min-height:22px;min-width:0}" +
    ".ccp_label{color:var(--dsw-alias-label-secondary);font-size:12px;font-weight:500;line-height:18px;white-space:nowrap}" +
    ".ccp_value{color:var(--dsw-alias-label-tertiary);font:inherit;font-size:12px;line-height:18px;border:0;background:0 0;padding:0;margin:0;min-width:0;flex:0 1 auto;field-sizing:content;text-overflow:ellipsis}" +
    ".ccp_hint,.ccp_warning{margin:0;font-size:12px;font-weight:400;line-height:18px}" +
    ".ccp_hint{color:var(--dsw-alias-label-tertiary)}" +
    ".ccp_warning{color:var(--dsw-alias-label-error)}";

/** Install the shared sheet and this one (idempotent per sheet content). */
export function ensureCss(): void {
    injectCardStyles([CSS]);
}
