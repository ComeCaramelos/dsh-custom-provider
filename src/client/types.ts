/**
 * Shared local structural types of the browser half.
 *
 * The Host contracts (the scope snapshot, the path ops, the seat owner props)
 * are described here by their structural shape instead of imported from the
 * host packages — same rule the old in-factory declarations followed: the
 * bundle depends on the shape only, never on a module that does not appear
 * in the loader's module table.
 *
 * Keep each shape as narrow as what this half actually calls; widening it to
 * match upstream's real surface is a drift risk the tests cannot catch. The
 * page-owned DOM is deliberately NOT typed structurally either — those nodes
 * are matched only by their stable class suffix, and a DOM type would claim
 * more than that contract allows.
 */

/** One `SettingsPathOpView` mutation, addressed to a single path. */
export type SettingsPathOp = { op: "set"; path: string[]; value?: string } | { op: "unset"; path: string[] };

/** The hand-written request headers of one profile. */
export interface ProfileHeaderMap {
    [name: string]: string;
}

/** The user layer of the namespace document (the layer that marks a header configured). */
export interface UserLayer {
    providers?: Record<string, { headers?: unknown } | undefined> | undefined;
}

/**
 * The dsh 0.2 `ConfigFormSnapshot` of the adapter entry: `user` is the layer
 * the toggle reads, `value` the resolved section the dot reads (the adapter's
 * base profiles folded in). The same shape `@comecaramelos/dsh-ancesters`
 * reads its cards from, plus the two layers only this card needs (`base`,
 * `user`). The fields stay optional: a snapshot is only ever read through
 * guards, never trusted to carry a layer.
 */
export interface ConfigFormSnapshot {
    /** `loading` until the first accepted section, `ready` while one stands,
     * `unavailable` when the namespace is not served to this client (or the
     * connection keeps preferences process-local — memory mode). */
    status?: "loading" | "ready" | "unavailable" | undefined;
    value?: unknown;
    /** Composition layer `value` was resolved over (unused here). */
    base?: unknown;
    user?: UserLayer | undefined;
    revision?: number | undefined;
    writable?: boolean | undefined;
    /** `host` syncs with the Host document; `memory` never writes. */
    mode?: "host" | "memory" | undefined;
}

/** The `value`-layer profile of one route: what rides the wire, not what was stored. */
export interface ResolvedProfile {
    headers?: unknown;
}

/**
 * The dsh 0.2 `ConfigForm` of the adapter entry (`configForms.get("llm-pi-ai")`):
 * `getSnapshot()` never answers `undefined`, and `mutate` answers `true` for
 * Host acceptance, `false` for a refusal (after its own recovery read) — a
 * transport failure rejects.
 */
export interface ConfigForm {
    getSnapshot(): ConfigFormSnapshot;
    subscribe(listener: () => void): () => void;
    mutate(ops: readonly SettingsPathOp[], expectedRevision?: number): Promise<boolean>;
}

/** The owner props the `settings.models.provider-card` seat dispatches with. */
export interface ProviderOwner {
    provider?: { provider?: string | undefined; declared?: boolean | undefined } | undefined;
    configured?: boolean | undefined;
    keyConfigured?: boolean | undefined;
}

/** Props of the toggle view rendered inside the editor host. */
export interface ToggleViewProps {
    active?: boolean | undefined;
    staged?: boolean | undefined;
    writable?: boolean | undefined;
    /** The namespace is not served to this browser (remote / memory mode). */
    unavailable?: boolean | undefined;
    conflict?: boolean | undefined;
    failure?: string | null | undefined;
    onToggle: (checked: boolean) => void;
}

/** Props of the seat component: the owner props plus the entry's config form
 * (injected under `scope`, the name the seat registration hands it by). */
export interface NoApiKeyToggleCardProps extends ProviderOwner {
    scope: ConfigForm;
}
