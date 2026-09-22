/**
 * Build the browser half with esbuild.
 *
 * The shell's client manifest fetches exactly ONE script per bundle
 * (`/plugins/<id>/client.js`), loaded as a plain `<script>` — no import graph,
 * no `type="module"`, nothing behind a second URL. So the browser half can be
 * ordinary modules at source level but must collapse into one CJS-shaped
 * factory body at emit time, requiring only the ids the shell seeds into its
 * module table.
 *
 * That is exactly what a bundler is for, so this build is two steps, mirroring
 * the host half's separation of check and emit:
 *
 *   1. `tsc -p tsconfig.client.json` typechecks the browser modules (no emit) —
 *      their imports resolve against the structural views declared in
 *      `src/client/shell-modules.d.ts`;
 *   2. this script runs esbuild over `src/client/index.ts`: bundle, CJS output,
 *      `platform: "neutral"` (no Node or DOM globals assumed), the baseline
 *      ids kept external, and an external source map so the emitted bundle is
 *      debuggable back to `src/client/*.ts`.
 *
 * The bundle's shape is the loader's own contract, not esbuild's: the factory
 * prologue/epilogue is supplied through esbuild's `banner`/`footer`, so the
 * generated body sits inside `window.__ModuleLoader__.load({ id, factory: … })`
 * exactly as every other plugin's emitted half does. The one page-agnostic
 * stylesheet this half owns travels inside the TypeScript (see
 * `src/client/styles.ts`); it is injected through its own `style` tag at mount
 * time, so nothing here emits a second artifact.
 */
import { build } from "esbuild";
import { readFile } from "node:fs/promises";

const ROOT = new URL("../", import.meta.url);
const pkg = JSON.parse(await readFile(new URL("package.json", ROOT), "utf8"));

/**
 * Modules the shell seeds into `window.__ModuleLoader__` before this bundle
 * runs. They must stay external: bundling them would duplicate the shell's own
 * copy (two Reacts). The optional toggle primitive is NOT listed here — the
 * half resolves it through a guarded require in `src/client/toggle-view.ts`
 * because its presence is a property of the surface, not a hard dependency.
 */
const BASELINE_MODULES = ["react", "react/jsx-runtime"];

await build({
    entryPoints: ["src/client/index.ts"],
    outfile: "lib/client.js",
    bundle: true,
    format: "cjs",
    platform: "neutral",
    target: "es2022",
    external: BASELINE_MODULES,
    sourcemap: "linked",
    sourcesContent: true,
    banner: {
        js: [
            "window.__ModuleLoader__.load({",
            `\tid: ${JSON.stringify(pkg.name)},`,
            "\tfactory: (require) => {",
            "\t\tvar module = { exports: {} };",
            "\t\tvar exports = module.exports;",
            '\t\tObject.defineProperty(exports, Symbol.toStringTag, { value: "Module" });'
        ].join("\n")
    },
    footer: {
        js: ["\treturn module.exports;", "\t}", "});"].join("\n")
    }
});
