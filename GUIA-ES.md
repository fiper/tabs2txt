# Guía paso a paso

Cómo construir, probar y publicar esta extensión desde cero. El repositorio ya trae todo el código; esta guía explica qué hace cada pieza, en qué orden tocarla y cómo dejarla publicada en GitHub.

---

## Paso 0. Lo que hay que saber antes de escribir código

Tres límites del navegador definen el diseño de la extensión. Conviene entenderlos antes, porque explican por qué el código está hecho así.

1. **No se puede elegir una carpeta cualquiera del disco.** La API `downloads` solo acepta rutas _relativas_ al directorio de descargas configurado en Firefox. Las rutas absolutas, las vacías y las que contienen `..` producen un error. Es decir: la extensión puede escribir en `Descargas/tab-backups/`, pero no en `D:\respaldos`.

   La solución práctica es un enlace simbólico dentro de la carpeta de descargas:

   ```bat
   :: Windows, terminal como administrador
   mklink /D "%USERPROFILE%\Downloads\tab-backups" "D:\respaldos\firefox"
   ```

   ```bash
   # macOS / Linux
   ln -s /mnt/respaldos/firefox ~/Descargas/tab-backups
   ```

   Firefox escribe en `Descargas/tab-backups` y el sistema de archivos redirige al destino real.

2. **Firefox tiene que poder guardar sin preguntar.** En _Ajustes → General → Descargas_ hay que dejar marcado **Guardar archivos en…** y no _Preguntar siempre dónde guardar los archivos_. Si está en "preguntar", cada respaldo abriría un diálogo.

3. **El fondo no es persistente.** Manifest V3 en Firefox usa una _event page_: el script de fondo se descarga de memoria cuando está inactivo y se despierta con un evento. Por eso no sirve `setInterval` y todo el estado vive en `browser.storage.local`. Los temporizadores se hacen con `browser.alarms`, y todos los `addListener` van en el nivel superior del archivo.

---

## Paso 1. Herramientas

```bash
node -v    # 20 o superior
npm -v
git --version
```

Instala Firefox Developer Edition si quieres un perfil separado para desarrollo (opcional, pero cómodo).

---

## Paso 2. Crear el repositorio y la estructura

```bash
mkdir tabs-to-txt && cd tabs-to-txt
git init
```

La estructura separa el código fuente de todo lo demás, que es lo que espera cualquiera que llegue al proyecto:

```
.github/            plantillas de issues/PR y workflows de CI
src/                todo lo que se empaqueta en el .zip final
  manifest.json
  background/       la event page: temporizador y escritura de archivos
  common/           módulos compartidos (ajustes, nombres, snapshot de pestañas)
  options/          la pantalla de configuración
  popup/            el switch de pausa
  icons/
tests/              pruebas unitarias de la lógica pura
tools/              scripts auxiliares (generador de iconos)
docs/               esta guía
dist/               el .zip (ignorado por git)
```

Todo lo que esté en `src/` termina dentro del paquete, así que ahí no van ni pruebas ni configuración de herramientas.

---

## Paso 3. El manifest

`src/manifest.json` declara permisos, el fondo, el popup y la página de opciones. Los puntos que importan:

- `"manifest_version": 3` y `"background": { "scripts": [...], "type": "module" }`. Firefox **no** soporta `background.service_worker`: usa una event page con `scripts`. Con `type: "module"` se pueden usar `import`/`export` sin ningún empaquetador.
- `"permissions": ["tabs", "downloads", "storage", "alarms"]`. `tabs` para leer URLs y títulos, `downloads` para escribir, `storage` para los ajustes, `alarms` para el temporizador.
- `"options_ui": { "page": "options/options.html", "open_in_tab": false }`. Esto es lo que hace que **toda la configuración aparezca dentro de `about:addons`** (Extensiones → Tabs to TXT → Preferencias), en vez de en un popup.
- `"action": { "default_popup": "popup/popup.html" }`. El popup del icono, que solo contiene el switch.
- `browser_specific_settings.gecko`:
  - `id`: obligatorio en MV3 para firmar. Cámbialo antes de publicar (formato `algo@tudominio.com`); ese ID es la identidad del add-on para siempre.
  - `strict_min_version: "140.0"`: la versión mínima que entiende `data_collection_permissions`.
  - `data_collection_permissions: { required: ["none"] }`: desde el 3 de noviembre de 2025 **toda extensión nueva en AMO debe declararlo**. `["none"]` es lo correcto aquí porque nada sale del equipo.

---

## Paso 4. Los módulos compartidos (`src/common/`)

Escribe primero la lógica que no toca APIs del navegador; es la que después se puede probar sin Firefox.

- **`settings.js`** — los valores por omisión, `getSettings()`, `patchSettings()` y `normalize()`, que recorta el intervalo al rango 1–1440 y fuerza tipos. Un único lugar donde se define qué recuerda la extensión.
- **`naming.js`** — funciones puras:
  - `formatStamp()` → `2026-09-18_14-03-27` (hora local, con segundos).
  - `sanitizeFolder()` → limpia lo que escribe el usuario: convierte `\` en `/`, elimina `..`, rutas absolutas, caracteres inválidos (`< > : " | ? *`) y segmentos que empiezan o terminan en punto, porque Firefox los rechaza.
  - `buildFilename()` → `tab-backups/window2_2026-09-18_14-03-27.txt`. Con 10 ventanas o más rellena el número con un cero (`window07_`) para que los archivos se ordenen bien.
  - `renderFile()` → el contenido del `.txt`: cabecera opcional en líneas `#`, una URL por línea y, si se activa, el título como comentario sobre cada enlace.
  - `signature()` → una huella del snapshot completo, para poder omitir respaldos idénticos.
- **`tabs.js`** — `collectWindows()`: pide `browser.windows.getAll({ populate: true })`, descarta ventanas que no sean `normal`, descarta las privadas salvo que el usuario lo permita, y filtra URLs no guardables (`about:`, `moz-extension:`, etc.). Los grupos de pestañas se ignoran: la unidad es la ventana.

El orden en que el navegador devuelve las ventanas es el que decide quién es `window1` y quién `window2`, y ese orden puede cambiar entre ejecuciones. Es decir: el número es una etiqueta del archivo, no un identificador de ventana.

---

## Paso 5. El fondo (`src/background/background.js`)

Es el corazón. Cuatro responsabilidades:

**a) Programar.** `reschedule()` borra la alarma y la vuelve a crear con `periodInMinutes` y `delayInMinutes` según los ajustes. `ensureSchedule()` se llama al cargar la página de fondo y crea la alarma **solo si no existe**; recrearla en cada despertar iría empujando el próximo respaldo hacia adelante para siempre.

**b) Escribir.** `runBackup()` toma el snapshot, compara la huella con la anterior (si "omitir sin cambios" está activo), y para cada ventana construye nombre y contenido y llama a `writeFile()`. Ahí está el truco central:

```js
const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
const url = URL.createObjectURL(blob);
const id = await browser.downloads.download({
  url,
  filename,
  conflictAction: "uniquify",
  saveAs: false,
});
```

El archivo no se descarga de ningún servidor: se crea en memoria como blob y se "descarga" desde la propia extensión. El `URL.revokeObjectURL()` se hace en `downloads.onChanged`, cuando la descarga termina, no antes.

**c) Limpiar.** En ese mismo listener, si el usuario lo pidió, `downloads.erase()` quita la entrada del panel de descargas. Borra el registro, nunca el archivo. Sin esto el panel de descargas se llena cada 15 minutos.

**d) Reaccionar.** `storage.onChanged` reprograma cuando cambian el intervalo o el switch; `runtime.onStartup` y `runtime.onInstalled` reprograman al arrancar (las alarmas no sobreviven al cierre del navegador); `runtime.onMessage` atiende el botón "Guardar ahora" de las opciones.

El estado de la última ejecución (`lastRunAt`, `lastRunFiles`, `lastError`) se guarda en storage para que la pantalla de opciones lo muestre aunque la event page se haya descargado.

---

## Paso 6. El popup: un solo switch

`src/popup/popup.html` es una sola fila: etiqueta, estado y un `<input type="checkbox">` con estilo de switch. El JS hace dos cosas: leer `enabled` al abrir y escribirlo al cambiar.

No hay mensajería con el fondo: el popup escribe en `storage.local` y el fondo reacciona con `storage.onChanged`. Menos código y menos estados raros.

El switch es un checkbox real, no un `<div>`: así funciona con teclado y con lectores de pantalla sin trabajo extra. El badge del icono muestra `OFF` cuando está en pausa.

---

## Paso 7. La pantalla de opciones

`src/options/options.html` contiene **todos** los ajustes, y aparece dentro de `about:addons` por el `options_ui` del manifest.

El elemento central es la vista previa en vivo: lista los nombres exactos de los archivos que se escribirían **ahora mismo**, con las ventanas que tienes abiertas en este momento y la marca de tiempo actualizándose cada segundo. Es la forma más directa de responder la única pregunta importante de esta extensión: "¿dónde va a quedar el archivo y cómo se va a llamar?".

Los estilos usan `prefers-color-scheme` porque `about:addons` sigue el tema de Firefox; una página con fondo blanco fijo se ve rota en modo oscuro.

---

## Paso 8. Iconos

`tools/make-icons.py` genera `src/icons/icon-{16,32,48,96,128}.png` con Pillow, desde un lienzo de 512 px reducido con LANCZOS:

```bash
python3 tools/make-icons.py
```

Generarlos por código en vez de a mano hace que el diseño sea reproducible y que el cambio quede en el historial de git como cualquier otro.

---

## Paso 9. Probar en Firefox

Con `web-ext`, que abre un perfil limpio y recarga al guardar:

```bash
npm install
npm start
```

A mano, si prefieres tu perfil normal: `about:debugging` → _Este Firefox_ → **Cargar complemento temporal** → elige `src/manifest.json`.

Qué revisar:

1. Abre las opciones desde `about:addons` y pon el intervalo en 1 minuto.
2. Pulsa "Save a backup now" y confirma que aparecen los `.txt` en `Descargas/tab-backups/`.
3. Espera un minuto y verifica que se generó el siguiente juego de archivos.
4. Abre una segunda ventana y comprueba que salen `window1_...` y `window2_...` con la misma marca de tiempo.
5. Pausa desde el icono de la barra: el badge muestra `OFF` y dejan de aparecer archivos.
6. En `about:debugging` → _Inspeccionar_ revisa la consola de la event page por si hay errores.

---

## Paso 10. Calidad automática

Las barreras que evitan que el proyecto se degrade cuando lo toque alguien más (o tú en tres meses):

```bash
npm run lint    # eslint + prettier + addons-linter (web-ext lint)
npm test        # pruebas de naming.js con el runner de Node, sin dependencias
npm run build   # dist/tabs_to_txt-<versión>.zip
```

- **ESLint** (`eslint.config.js`, formato flat) con los globales de `webextensions`, para que `browser` no marque error y sí lo hagan las variables sin usar.
- **Prettier** para el formato; un solo estilo, sin discusiones en los PR.
- **web-ext lint** es el mismo linter que usa AMO al revisar. Si pasa en local, no te rechazan la subida por algo tonto.
- **Husky** instala dos hooks (`npm install` los deja listos): `pre-commit` corre `lint-staged` y las pruebas; `commit-msg` valida el mensaje con commitlint.
- **Conventional Commits**: `feat: ...`, `fix: ...`, `docs: ...`, `chore: ...`. No es cosmético: de ahí sale la versión y el CHANGELOG en el paso 12.

---

## Paso 11. Subirlo a GitHub

```bash
git add .
git commit -m "feat: initial release of the tab backup extension"
gh repo create tabs-to-txt --public --source=. --push
# o crea el repo en la web y luego:
# git remote add origin https://github.com/TU_USUARIO/tabs-to-txt.git
# git branch -M main && git push -u origin main
```

Reemplaza `YOUR_USER` en `README.md`, `package.json` y `src/manifest.json` por tu usuario.

Lo que hace que el repositorio se lea como un proyecto y no como una carpeta suelta:

- `README.md` — qué hace, por qué existe, cómo instalarlo, cómo configurarlo, sus límites.
- `LICENSE` — MIT. Sin licencia, legalmente nadie puede reutilizar el código.
- `CONTRIBUTING.md` — cómo clonar, correr y enviar un PR.
- `CODE_OF_CONDUCT.md` — el estándar de comportamiento.
- `SECURITY.md` — cómo reportar una vulnerabilidad en privado.
- `.github/ISSUE_TEMPLATE/` — formularios que obligan a indicar versión de Firefox, sistema operativo y pasos para reproducir.
- `.github/PULL_REQUEST_TEMPLATE.md` — la lista de verificación del contribuyente.

En **Settings → Branches** agrega una regla para `main`: exige que el check de CI pase y que haya un PR. Es lo que convierte al CI en una barrera real y no en un adorno.

---

## Paso 12. CI y releases automáticos

`.github/workflows/ci.yml` corre en cada push y cada PR: instala, pasa el linter, las pruebas, el linter de AMO y construye el `.zip`, que queda como artifact. Un PR que rompe algo se ve rojo antes de que alguien lo lea.

`.github/workflows/release.yml` usa **release-please**. El flujo:

1. Fusionas a `main` commits convencionales.
2. release-please abre (o actualiza) un PR de release con el número de versión calculado según SemVer (`fix:` → parche, `feat:` → menor, `!` o `BREAKING CHANGE` → mayor) y el `CHANGELOG.md` generado.
3. Al fusionar ese PR, crea el tag y el Release de GitHub.
4. El segundo job construye el paquete y lo adjunta al Release.

La versión se sincroniza en `package.json` **y** en `src/manifest.json` mediante `extra-files` en `release-please-config.json`; si se desincronizan, el paquete queda con una versión distinta a la del tag.

Nunca más comprimas un zip a mano.

---

## Paso 13. Publicar en addons.mozilla.org (opcional)

Un complemento temporal desaparece al cerrar Firefox. Para instalarlo de forma permanente el paquete tiene que estar firmado por Mozilla.

1. Cambia el `id` del manifest a algo tuyo y definitivo.
2. Crea cuenta de desarrollador en [addons.mozilla.org](https://addons.mozilla.org/developers/).
3. Sube `dist/tabs_to_txt-<versión>.zip`. Elige listado público o _unlisted_ (firmado para instalación privada).
4. Explica los permisos en la ficha: `downloads` y `tabs` provocan preguntas en la revisión; el README ya tiene la justificación.
5. Sube también el código fuente si te lo piden. Aquí no hay empaquetador ni minificación, así que el `.zip` **es** el código fuente: eso hace la revisión trivial.

Para automatizar la firma después, `web-ext sign` con las credenciales de AMO (`WEB_EXT_API_KEY` y `WEB_EXT_API_SECRET` como secrets del repositorio) se puede añadir como un job extra en `release.yml`.

---

## Resumen del orden de trabajo

| #   | Qué                                                      | Dónde                 |
| --- | -------------------------------------------------------- | --------------------- |
| 1   | Entender los límites de `downloads` y de la event page   | —                     |
| 2   | Estructura de carpetas y `git init`                      | raíz                  |
| 3   | Manifest con permisos, popup y `options_ui`              | `src/manifest.json`   |
| 4   | Lógica pura: ajustes, nombres, snapshot                  | `src/common/`         |
| 5   | Temporizador y escritura de archivos                     | `src/background/`     |
| 6   | El switch                                                | `src/popup/`          |
| 7   | Toda la configuración                                    | `src/options/`        |
| 8   | Iconos generados por script                              | `tools/make-icons.py` |
| 9   | Probar con `npm start` y `about:debugging`               | —                     |
| 10  | ESLint, Prettier, pruebas, hooks, commits convencionales | raíz                  |
| 11  | README, licencia, plantillas, protección de rama         | `.github/`, raíz      |
| 12  | CI y release-please                                      | `.github/workflows/`  |
| 13  | Firma y publicación en AMO                               | —                     |
