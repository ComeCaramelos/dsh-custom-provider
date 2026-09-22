# Custom Providers - No API Key Toggle Enhancement

> Revision del plan: verificado contra `@deepseek-ai/dsh-client-ui-settings-models`,
> `@deepseek-ai/dsh-client-ui-settings`, `@deepseek-ai/dsh-llm-pi-ai` y
> `@earendil-works/pi-ai` (tree instalada del checkout DSH). Los apartados 1 y 2
> del plan original describian una API (`dsh.plugins.registerSlotExtension`,
> `operations.writeSettings` visible para extensiones) que **no existe** para
> plugins externos: esta version describe la API real. Pendientes: los puntos 3
> y 4 del plan original quedan modificados o descartados en "Detalles UI".

## Problema

Un custom provider declarado a mano (`api=openai-completions`) sin ninguna
API key **falla al hacer la peticion, no al conectar la UI**:
`@earendil-works/pi-ai` lanza
`Error: No API key for provider: <route>` en `openai-completions.js`
(`getClientApiKey`: si `options.apiKey` esta vacio, exige una cabecera
`authorization` no vacia en `options.headers`). La pagina Models, mientras
tanto, muestra esa fila **sin ningun punto de estado** (ni rojo: el dot
solo se renderiza cuando el perfil nombra una referencia
`apiKeyEnv`), por lo que parece lista pero todo request revienta.

No es que DSH anada `Authorization: Bearer none`: la cabecera no existe y
pi-ai aborta antes de mandar nada.

## Solucion

Un toggle **"No API key required"** en las cards de provedores
**hand-declared ya guardados**, que al activarlo escribe en el perfil:

```js
providers.<route>.headers.Authorization = "Bearer none"
```

La escritura borra solo esa clave (`unset ["providers", <route>, "headers",
"Authorization"]`), nunca el objeto `headers` completo, para no tumbar
cabeceras ajenas del usuario.

El control debe vivir **dentro del `*_editor`** que `ProviderEditor` monta
cuando la card esta abierta en modo edicion, no en el area del slot (que va
en la cabecera de la fila). Como `ProviderEditor` no tiene slot ni acepta
children, el componente se renderiza en el slot
`settings.models.provider-card` (que si existe en cada card) en un anchor
oculto, y desde ahi reposiciona **dos** hosts propios: `div.ccp_editorHost`
con la vista del toggle, insertado **dentro del `*_editor`** abierto **justo
despues del `*_field` de la API key** (el campo que envuelve el
`input[type=password]`; nunca el bloque `headers` entero ni la fila de
acciones); y el host del punto de estado (`span.ccp_dot`), que **no** va en el
editor sino en el bloque de identidad de la fila (`*_rowIdentity`) — ver
`docs/authorization-dot-plan.md`, que complementa a esta guia. Un
`MutationObserver` sobre el `li` de la card vuelve a meter ambos cuando React
re-mapa el subtree. No hay portal: el shim `react` del runner web no expone
`createPortal`, y mover el DOM propio (React lo referencia por nodo) es la via
segura.

y al desactivarlo hace `unset` sobre esa misma ruta. Esto cumple el chequeo
de pi-ai (cabecera `authorization` explicita y no vacia en `options.headers`;
las cabeceras del perfil se aplican al final y **sobrescriben** el
`Bearer <key>` derivado). Vale para gateways locales/self-hosted que
ignoran autenticacion; para un endpoint que la exige el toggle no es
solucion, sino como maximo indicarlo.

**Dónde NO va**: la card de creacion hand-declared (`CustomProviderCard`,
estado `declaring`) **no emite ninguna ranura del slot** hasta guardar
(su card no tiene fila de directorio). El toggle solo puede vivir en
row-cards guardadas y en el estado first-run, que para rutas hand-declared
tampoco aparece (`needsSetup` exige `settingsPath.length === 0`). El
escenario original "crear con toggle" es infeasible por slot y debe
desaparecer del plan de test.

## Arquitectura

### Stack: TypeScript (`src/*.ts` → `lib/`)

Igual que los plugins hermanos `dsh-ask-before-compact` y
`dsh-docker-desktop-mcp`: dos tsconfigs, uno por mitad.

- `tsconfig.json` (host): `strict`, `module: NodeNext`, `declaration` →
  `lib/index.js` + `lib/index.d.ts`.
- `tsconfig.client.json` (navegador): `module: ESNext`, `lib: ES2022 + DOM`,
  `strict: false` / `noImplicitAny: false` (el factory va con `require`
  tipado como `(id: string) => any`), `declaration: false`, `sourceMap:
  false` → `lib/client.js`.

Lo que sigue igual que el hermano: el artefacto emitido tiene que seguir
siendo un `window.__ModuleLoader__.load({ id, factory(require) {...} })`
auto-registrado, sin `import` estático. `lib/` es salida generada (esta en
`.gitignore`) y nunca se edita a mano.

### Slots reales del modelo (verificados)

`dsh-client-ui-settings-models` declara dos asientos
(`src/client/slot-contract.ts`), despachados en `ModelsSection`:

| Slot | Tipo | Dispatch |
|------|------|----------|
| `settings.models.provider-card` | `keyed` (scope `root`) | en cada card con fila del directorio, `entryKey = entry.settingsNs` |
| `settings.models.footer` | `list` (scope `root`) | un area tras las filas y los controles de anadir, `ownerProps = {}` |

- Owner props del provider-card, exactas:
  `{ provider, configured, keyConfigured }` donde `provider` es
  `ProviderDirectoryEntry`: `{ provider, displayName, settingsNs,
  settingsPath, active, declared?, error? }`. **No** contienen
  `namespace` ni operaciones del Host.
- Los custom routes hand-declared viven en la namespace
  `settingsNs: "llm-pi-ai"` con `settingsPath: ["providers", "<route>"]`
  (asi lo fija `dsh-llm-pi-ai` en `directoryEntries`).
- `declared: true` marca las rutas hand-declared (`!catalog.has(provider)`).
  Como los provedores shipped configurados por esa misma seccion tambie
  comparten `settingsNs = "llm-pi-ai"`, la extension debe mirar
  `provider.declared === true` para no ensuciar cards que no son nuestra
  funcionalidad.
- Las cards no se despachan para filas sin `settingsNs` (rutas live sin
  perfil settings), ni para la draft de creacion hand-declared.

### Registro: API real

No existe `dsh.plugins.*`. Un plugin client de web hace, dentro de `apply(ctx)`:

```js
var inject = ["slots", "settingsScope", "locale"];

function apply(ctx) {
  // namespace compartida con el adaptador llm-pi-ai
  var scope = ctx.settingsScope.bind({ namespace: "llm-pi-ai" });

  ctx.slots.inject("settings.models.provider-card", function () {
    return ctx.slots.register(
      {
        name: "settings.models.provider-card",
        key: "llm-pi-ai",            // entryKey: solo cards de la familia pi-ai
        inject: function () { return { scope: scope }; }
      },
      NoKeyCard                      // componente React
    );
  });
}
```

- `ctx.slots.inject(slotName, registrationFactory)` pospone hasta que el
  ledger del asiento esta en el arbol; no hay que alinear orden a mano.
  El patrón esta probado en `dsh-skills-in-directories` /
  `dsh-hover-information` (registran `settings.plugin.item` igual).
- El componente recibe `props` = owner props + `inject()`
  ({ provider, configured, keyConfigured, scope }).
- Dependencias del manifiesto: `dsh.client.inject` debe incluir
  `@deepseek-ai/dsh-client-ui-settings` (provee `settingsScope`) y, si se
  usan diccionarios, `@deepseek-ai/dsh-client-locale`. Los `slots` los
  envuelve el runner web para todo plugin de plataforma `web`.
- Dependencia deseable no ejecutada en runtime: solo hay import
  `import type` de `@deepseek-ai/dsh-client-ui-settings-models/client`
  para los tipos del contrato; no se importan funciones del paquete
  (regla de pureza del bundle client: nada de valor entre plugins,
  `settingsScope` es la via oficial).

### Leer y escribir el perfil

No hay `operations` en el ctx del registrante (`createModelsOperations`
es interna de la pagina). La via:

```js
var snap = scope.getSnapshot();       // { status, value, user, revision, base }
var profile = snap.user && snap.user.providers && snap.user.providers[route];
var hasHeaders = !!(profile && profile.headers
                    && profile.headers.Authorization);
```

- Estado del toggle: presencia en la **capa user** (`snap.user`), no en la
  valor resuelto: la documentacion del scope dice que la presencia en
  `user` es lo que marca "sobrescrito"; `value` vendria del `base`
  (perfiles por defecto del adaptador) y podria confundir.
- Activar:
  `scope.mutate([{ op: "set", path: ["providers", route, "headers",
  "Authorization"], value: "Bearer none" }])`
- Desactivar:
  `scope.mutate([{ op: "unset", path: ["providers", route, "headers",
  "Authorization"] }])`
- `op: "set" | "unset"` y `value: JsonValue` son
  `SettingsPathOpView` (verificado en `dsh-settings/lib/types/types.d.ts`,
  coincidente con `operations.d.ts` de la pagina). `mutate` ya fencea con
  `revision` y maneja conflictos/recovery.
- La escritura la filtra el Host contra el schema `Config` de
  `dsh-llm-pi-ai`: `headers?: Record<string, string>` existe en
  `PiAiProviderProfile` ("Provider request headers, validated against
  Fetch"). `"Bearer none"` es legal para Fetch, y `Authorization` no es
  nombre reservado por la atribucion de Harness (que solo fija
  `user-agent`), por lo que no se descarta ni se cubre.
- Las dos direcciones escriben/borran la clave unica, no el mapa `headers`
  completo: otras cabeceras que el usuario mantenga a mano sobreviven.
- Tras escribir, el push `settings/document-updated` del Host hace
  `load()` a la pagina Models, que es lo que actualiza la fila. El
  componente escucha su `scope.subscribe(...)` para volver a dibujar.

## Detalles UI

- No debe aparecer ninguna accion mientras `!configured` (fila dormant)
  ni mientras `keyConfigured === true` (si hay credencial, su flujo es
  el correcto, no hay que enganarlo a la fuerza). Tampoco para filas
  sin `declared` (provedores shipped).
- Punto verde (verificado): el dot propio (`span.ccp_dot`) se inserta como
  ultimo hijo del bloque `*_rowIdentity` de la cabecera de la fila (donde la
  pagina dibuja su propio indicador, justo tras el nombre y la etiqueta
  `custom`), **no** en el `*_editorHeader` ni en ninguna envoltura intermedia;
  y **nunca** cuando la identidad ya trae un `credentialDot*` propio (verde o
  amber): una fila con credencial referenciada ya habla por si sola. La
  regla de encendido —ruta `declared`, perfil RESUELTO (`value`) con
  `Authorization` no vacia, cualquier casacion— esta verificada en
  `docs/authorization-dot-plan.md`; el dot no escribe nunca. Las clases del
  CSS de la pagina (`zGbnIq_*` en `ModelsSection.module.css`) solo se usan
  para **localizar** el `*_editor`, el `*_field` que envuelve el
  `input[type=password]` (con `*_editorActions` como respaldo si la key aun
  no esta montada), el `*_rowIdentity` y el `credentialDot` propio, casando
  por sufijo no-haseado (nunca el nombre completo con hash, que cambia en
  cada rebuild); nunca para copiar sus estilos. El color del dot sale del
  alias compartible del theme (`--dsw-alias-state-success-primary`).
- Deshabilitar el input de API key: **descartado**. La caja de key vive
  en el DOM del `ProviderEditor` (solo visible con la fila abierta en
  modo edicion) y React lo vuelve a renderizar cuando quiere. Un
  `document.querySelector` + `disabled` es fragil. En su lugar: el area
  del slot lleva el propio campo deshabilitado (`placeholder="—"` o
  similar) mientras el toggle esta activado.
- Estado de conflicto: si el perfil ya tiene una `Authorization` con otro
  valor (distinto de `Bearer none`), esa cabecera es configuracion propia
  del usuario y ya satisface por su cuenta la comprobacion de pi-ai. El
  toggle se muestra OFF y **deshabilitado** con un mensaje que lo explica
  (nunca se muestra ni se lee el valor del usuario, porque puede ser una
  credencial real), y `onToggle` no escribe en ninguna de las dos
  direcciones. Solo vuelve a ser util cuando el usuario borra esa cabecera.

## Estructura

```
package.json       # bloque dsh.client { platform: web, inject: [dsh-client-ui-settings] }; `test` = build + node --test
tsconfig.json          # mitad host: src/index.ts → lib/index.js (+ .d.ts), estricto
tsconfig.client.json   # mitad web: src/client.ts → lib/client.js, DOM lib, sin declaraciones
src/index.ts       # host half (stub; el plugin es puramente web)
src/client.ts      # __ModuleLoader__.load(...) con el registro y la UI
src/browser.d.ts   # tipado ambiento de `window.__ModuleLoader__`
lib/               # SALIDA generada (en .gitignore); no se toca a mano
cordis.patch.yml   # fila del bundle que hace que la mitad web cargue
```

`exports: { ".": "./lib/index.js", "./client": "./lib/client.js", … }`
es lo que consume el loader, y ahora lo produce `tsc` desde `src/` (una
fuente por mitad, dos tsconfigs, igual que los hermanos). La mitad web tiene
que seguir emitiendose como artifact `window.__ModuleLoader__.load(...)`
auto-registrado: por eso lleva `module: ESNext` y ninguna importacion
estatica.

## Testing

| Escenario | Resultado esperado |
|-----------|-------------------|
| Guardar custom provider con toggle ON | Perfil con `headers: { "Authorization": "Bearer none" }` bajo `providers.<route>`, campo `ccp_value` de solo lectura en el editor, request ya no lanza `No API key…` |
| Guardar custom provider sin tocar el toggle | Sin `headers`; el request sigue fallando como hoy (el toggle es el remedio, no hay default) |
| Toggle OFF en una fila ya guardada | `unset` en la misma ruta, el campo `ccp_value` desaparece, flujo stock restaurado |
| Toggle ON con `keyConfigured === true` | Se oculta/no expone: hay credencial, no hay que forzar cabeceras |
| Toggle en provedor shipped (`declared` no es `true`) | No aparece nada |
| Toggle ON con `headers` del perfil que ya contenia otras claves | Las otras claves sobreviven; solo se escribe `Authorization` (formato bloque en fichero) |
| Toggle OFF con una `Authorization` manual (no `Bearer none`) | Control OFF y deshabilitado, con mensaje del motivo; ninguna escritura sale |
| Toggle ON con una `Authorization` manual (no `Bearer none`) | Igual: deshabilitado, mensaje del motivo, no escribe sobre la cabecera del usuario |
| Toggle con `headers` del perfil que ya contenia otras claves | OFF se niega/no-op o advierte: no borrar `headers` ajenas |
| Settings read-only (Host no escribe) | `mutate` rechaza; mensaje visible, control en estado neutro |
| Card hand-declared a medio crear (`declaring`) | Sin toggle; flujo actual, sin cambios |
