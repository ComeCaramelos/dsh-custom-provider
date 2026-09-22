/**
 * Structural views of the modules the shell seeds — and of `require` itself.
 *
 * The emitted bundle requires only ids the loader seeds into its module table
 * (`react`, `react/jsx-runtime`) plus the id this half resolves through a
 * guarded require (`@deepseek-ai/dsh-client-ui-primitives`). None of them
 * appears in a local `node_modules` tree, so each is described by its
 * structural shape here — the same idiom `src/client/types.ts` uses for the
 * Host contracts. Keep each shape as narrow as what this half actually
 * calls; widening it to match upstream's real surface is a drift risk the
 * tests cannot catch.
 */

/** The loader's require, handed to the factory the bundle registers under. */
declare function require(id: string): any;

/** The baseline React the GUI seeds before this bundle runs. */
declare module "react" {
    export function useState<T = any>(initial: any): [T, (next: T) => void];

    export function useRef<T = any>(initial: any): { current: T };

    export function useMemo<T = any>(fn: () => T, deps?: ReadonlyArray<any> | undefined): T;

    export function useSyncExternalStore<T = any>(
        subscribe: (listener: () => void) => () => void,
        getSnapshot: () => T,
        getServerSnapshot?: () => T
    ): T;

    export function useEffect(effect: () => void | (() => void), deps?: ReadonlyArray<any> | undefined): void;
}

/** The jsx runtime the same loader seeds alongside `react`. */
declare module "react/jsx-runtime" {
    export const Fragment: any;

    export function jsx(type: any, props: any, key?: any): any;

    export function jsxs(type: any, props: any, key?: any): any;
}
