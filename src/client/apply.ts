/**
 * Browser half — the plugin body.
 *
 * The entry the loader calls: install the stylesheets (the shared
 * `dsh-ancesters` sheet plus this half's own, through the ancestor's
 * idempotent injector), take the adapter entry's config form (`configForms.get`
 * never touches the wire) and claim the provider-card seat through the
 * slot-injection ledger so the ledger order is the Host's problem, not ours.
 *
 * The claim follows the namespace: wrapped in `configForms.whileServed`, a
 * deployment that never composed the `pi-ai` adapter shows no trace of the
 * seat. A shell without `whileServed` claims it outright.
 */
import { NoApiKeyToggleCard } from "./card/index.js";
import { SETTINGS_NS } from "./plugin-meta.js";
import { ensureCss } from "./styles.js";
import type { ConfigForm } from "./types.js";

function noop(): void {}

export function apply(ctx: any): () => void {
    if (!ctx.configForms || typeof ctx.configForms.get !== "function" || !ctx.slots || typeof ctx.slots.inject !== "function") return noop;
    ensureCss();
    return ctx.effect(function (): any {
        var form: ConfigForm | undefined;
        try {
            form = ctx.configForms.get(SETTINGS_NS);
        } catch (error) {
            return noop;
        }
        if (!form) return noop;
        function claim(): () => void {
            var dispose = ctx.slots.inject("settings.models.provider-card", function () {
                return ctx.slots.register(
                    {
                        name: "settings.models.provider-card",
                        // Every card of this adapter family dispatches with
                        // entryKey = settingsNs; hand-declared routes live
                        // in this namespace, which is the family claimed.
                        key: SETTINGS_NS,
                        inject: function () {
                            return { scope: form };
                        }
                    },
                    NoApiKeyToggleCard
                );
            });
            return typeof dispose === "function" ? dispose : noop;
        }
        if (typeof ctx.configForms.whileServed !== "function") return claim();
        return ctx.configForms.whileServed([SETTINGS_NS], claim);
    }, "custom-provider: models card");
}
