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
 * `src/client/styles.ts`), and the shared `dsh-ancesters` sheet travels inside
 * the ancestor's bundled ESM; both are injected at mount time, so nothing here
 * emits a second artifact.
 */
import { build } from "esbuild";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

const ROOT = new URL("../", import.meta.url);
const require = createRequire(new URL("package.json", ROOT));
const pkg = JSON.parse(await readFile(new URL("package.json", ROOT), "utf8"));

/**
 * Modules the shell seeds into `window.__ModuleLoader__` before this bundle
 * runs. They must stay external: bundling them would duplicate the shell's own
 * copy (two Reacts). The primitives module is listed because the shared
 * `SwitchField` (`@comecaramelos/dsh-ancesters/client/blocks`) draws the
 * shell's own `Switch` — the same baseline the ancestor's other consumers keep.
 */
const BASELINE_MODULES = ["react", "react/jsx-runtime", "@deepseek-ai/dsh-client-ui-primitives"];

/**
 * The shared half (`@comecaramelos/dsh-ancesters`) is bundled INTO this file:
 * its `./client/blocks` and `./styles` subpaths emit plain ESM, so esbuild
 * inlines what this half imports and tree-shakes the rest. When the ancestor is
 * not installed (or not built) the build fails here with the reason stated,
 * rather than with an unresolved-import trace.
 */
for (const subpath of ["@comecaramelos/dsh-ancesters/client/blocks", "@comecaramelos/dsh-ancesters/styles"]) {
    try {
        if (!existsSync(require.resolve(subpath))) throw new Error("missing file");
    } catch (error) {
        throw new Error(`build-client: ${subpath} did not resolve (${String(error)}) — install and build dsh-ancesters first`);
    }
}

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
