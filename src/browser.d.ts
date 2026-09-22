/**
 * Ambient declarations for the browser half (`src/client.ts`).
 *
 * The bundle is a hand-authored loader artifact: a self-registering
 * `window.__ModuleLoader__.load({ id, factory: (require) => … })` call — the
 * module table itself seeds the `require`-able modules (`react`,
 * `react/jsx-runtime`, `@deepseek-ai/dsh-client-*`). The primitives package is
 * resolved only when the surface happens to provide it — this half reads it
 * through a guarded `require` and falls back when it is absent. Keep this file
 * free of runtime code; it exists only to type the loader surface the bundle
 * consumes.
 */
interface __DSHModuleLoader__ {
    load(spec: {
        id: string;
        factory: (require: (id: string) => any) => any;
    }): void;
}

interface Window {
    /** The shell's module table; seeded before any plugin bundle runs. */
    __ModuleLoader__: __DSHModuleLoader__;
}
