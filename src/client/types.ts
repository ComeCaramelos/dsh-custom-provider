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

/** The Host scope snapshot: `user` is the layer read, `value` rides the adapter base profiles. */
export interface ScopeSnapshot {
    status?: string;
    value?: unknown;
    user?: UserLayer | undefined;
    revision?: number | undefined;
    writable?: boolean | undefined;
}

/** The `value`-layer profile of one route: what rides the wire, not what was stored. */
export interface ResolvedProfile {
    headers?: unknown;
}

/** The Host `settingsScope` service bound to one namespace. */
export interface SettingsScope {
    getSnapshot(): ScopeSnapshot | undefined;
    subscribe(listener: () => void): () => void;
    mutate(ops: SettingsPathOp[]): Promise<unknown>;
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
    conflict?: boolean | undefined;
    failure?: string | null | undefined;
    onToggle: (checked: boolean) => void;
}

/** Props of the seat component: the owner props plus the bound scope. */
export interface NoApiKeyToggleCardProps extends ProviderOwner {
    scope: SettingsScope;
}
