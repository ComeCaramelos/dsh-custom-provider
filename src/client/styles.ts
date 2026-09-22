/**
 * Browser half — the component's stylesheet.
 *
 * The plugin never references the Models page's hashed CSS-module class names
 * (they churn every rebuild); its own rules ride in under stable `ccp_*`
 * class names through a single `style[data-plugin-css=…]` tag, installed once
 * per document. The colors come from the design-system alias variables the
 * page already defines — nothing here invents a shade.
 */

/** The whole rule sheet — one plugin-owned tag, never page class names. */
var CSS =
    ".ccp_editorHost{display:flex;flex-direction:column;gap:2px}" +
    ".ccp_dot{display:inline-block;flex:none;width:8px;height:8px;border-radius:50%;background:var(--dsw-alias-state-success-primary)}" +
    ".ccp_anchor{display:none}" +
    ".ccp_line{align-items:center;gap:8px;display:flex}" +
    ".ccp_value{color:var(--dsw-alias-label-secondary);border:0;background:0 0;padding:0;font-size:12px}" +
    ".ccp_hint{color:var(--dsw-alias-label-tertiary);margin:0;font-size:12px;line-height:1.5}" +
    ".ccp_warning{color:var(--dsw-alias-label-error);margin:0;font-size:12px}";

/** The `data-plugin-css` tag identity — the one installed sheet for this half. */
var CSS_TAG = "@comecaramelos/dsh-custom-provider/NoApiKeyToggle.module.css";

var cssInstalled = false;

/** Install the stylesheet once per document (the tag may pre-exist from an earlier mount). */
export function ensureCss(doc: Document): void {
    if (cssInstalled) return;
    if (doc.querySelector('style[data-plugin-css="' + CSS_TAG + '"]') !== null) {
        cssInstalled = true;
        return;
    }
    var tag = doc.createElement("style");
    tag.dataset.plugin = "@comecaramelos/dsh-custom-provider";
    tag.dataset.pluginCss = CSS_TAG;
    tag.textContent = CSS;
    doc.head.appendChild(tag);
    cssInstalled = true;
}
