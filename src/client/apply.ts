/**
 * Browser half — the plugin body.
 *
 * The entry the loader calls: install the stylesheet, bind one scope over the
 * adapter's namespace (binding never touches the wire) and claim the
 * provider-card seat through the slot-injection ledger so the ledger order is
 * the Host's problem, not ours.
 */
import { NoApiKeyToggleCard } from "./card/index.js";
import { SETTINGS_NS } from "./plugin-meta.js";
import { ensureCss } from "./styles.js";
import type { SettingsScope } from "./types.js";

function noop(): void {}

export function apply(ctx: any): () => void {
    if (!ctx.settingsScope || !ctx.slots || typeof ctx.slots.inject !== "function") return noop;
    if (typeof document !== "undefined") ensureCss(document);
    return ctx.effect(function (): any {
        var scope: SettingsScope | undefined;
        try {
            scope = ctx.settingsScope.bind({ namespace: SETTINGS_NS });
        } catch (error) {
            return noop;
        }
        return ctx.slots.inject("settings.models.provider-card", function () {
            return ctx.slots.register(
                {
                    name: "settings.models.provider-card",
                    // Every card of this adapter family dispatches with
                    // entryKey = settingsNs; hand-declared routes live
                    // in this namespace, which is the family claimed.
                    key: SETTINGS_NS,
                    inject: function () {
                        return { scope: scope };
                    }
                },
                NoApiKeyToggleCard
            );
        });
    }, "custom-provider: models card");
}
