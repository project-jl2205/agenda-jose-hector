# AGENDA JOSE · HÉCTOR — web (instrucciones para Claude)

App solo para Jose Luis y Héctor. Desde el 7-nov-2026 la agenda es la **v2 «Fluido»** (`v2/`): Calendario, Semana, Hoy,
Setups (= las operaciones que Jose Luis publica desde su Terminal), Prompts (solo en el PC) y Notas (privadas).
Desde el 8-nov (decisión de Jose Luis) la v2 no tiene Mercado (ni pestaña ni sus apuntes en Semana y Hoy) y Hoy no tiene
bandeja (una sola columna centrada); esos datos siguen guardados y la clásica los enseña. No los vuelvas a poner sin que él lo pida.
`index.html` (la dirección de siempre) abre la v2; la agenda de antes sigue en `clasica.html` (de reserva).
Este repositorio es **solo la web** (GitHub Pages, público). Los datos viven en Supabase. El esquema de la base de datos
(`sql/`), las herramientas y las pruebas de la web están en el PC Windows de Jose Luis (`sistema/agenda/` del proyecto), no aquí.

## Reglas
- **Todo en español**: interfaz, textos, comentarios del código.
- **Estética v2 = «Fluido»** (`v2/css/fluido.css`): fondo negro, tarjetas `.card` redondeadas, Inter, muelles y la isla
  de arriba (avisos con «Deshacer»). Movimiento con `v2/js/motor.js` (muelles interrumpibles). Que funcione a 390 px
  (móvil) y con el teclado del móvil abierto. La clásica conserva su estética (`css/base.css`).
- **Sin build ni framework**: HTML + módulos ES. Librerías por CDN con versión fija (supabase-js) o copiadas en
  `v2/vendor/` (Lightweight Charts 5.2, Apache 2.0: sin su logo y con el crédito en texto).
- **Seguridad**: nunca `innerHTML` con texto de usuario sin escapar (`esc()` / `textContent`).
  Nunca una clave **secreta** (`sb_secret_…`) en ningún fichero: `js/config.js` solo lleva la URL y la
  clave **publicable** (pública por diseño; protege RLS + la lista de 2 miembros).
- **Nada se borra de verdad**: borrar = papelera (`borrado_en`), con «Deshacer» en la isla.
- **Cada uno lo suyo** (la base de datos lo impone; no abras los permisos a los dos):
  - Notas (`notas_mercado`): PRIVADAS, el otro ni las ve. La hora de una nota no cambia al corregirla.
  - Setups = operaciones (`operaciones`): solo las publica el PC de Jose Luis; desde la web, su autor solo puede mandarla
    a la papelera y sacarla. Dibujos sobre su gráfico (`operacion_dibujos`): los dos ven todos; cada uno toca los suyos.
  - Noticias que cada uno quita del calendario (`noticias_ocultas`): cada uno las suyas.
  - Prompts para Claude: la tarea guarda su parte en `tareas.claude` ({comp, nota, manual, enviado, n}); el prompt se arma SIN IA
    con la ficha de su proyecto, que vive en la tabla `claude_fichas` de la base: NUNCA pongas fichas, rutas ni puertos en el
    código (este repositorio es público). En la demo hay fichas de ejemplo.
  - Si la base rechaza un cambio, `db.js` lo convierte en error para que la pantalla lo deshaga (no se queda «hecho»).
- **Cambios en el modelo de datos** (tablas/columnas/permisos): se preparan como SQL numerado (en el PC de Jose Luis,
  `sistema/agenda/sql/NNN_….sql`) y la web se publica DESPUÉS de aplicarlo. `js/store.js` es de las dos versiones: una
  tabla nueva va en `OPCIONALES` para que, si aún no existe, la agenda arranque igual.

## Mapa
- `v2/index.html` · `v2/css/fluido.css` · `v2/js/app.js` (arranque, isla, barra de pestañas, rutas #/calendario,
  #/semana, #/dia, #/setups, #/prompts, #/notas, #/ajustes; #/mercado lleva a Semana) · `v2/js/motor.js` (muelles)
- `v2/js/vistas/`: `calendario.js`, `semana.js`, `hoy.js`, `notas.js`, `operaciones.js` (la pestaña Setups), `prompts.js`
- Compartido con la clásica: `js/store.js` (copia en memoria + tiempo real) · `js/db.js` (Supabase o demo) ·
  `js/demo.js` · `js/fechas.js` (Europe/Madrid) · `js/recurrencia.js` (RRULE = dateutil) · `js/ui.js` ·
  `ajustes.js`, `tarea-editor.js`, `comentarios.js` (la v2 los usa con su piel; `js/vistas/mercado.js` ya solo lo usa la clásica)
- Cada vista exporta `montar(contenedor, ctx) -> desmontar`.

## Probar y publicar
- Probar: `python3 -m http.server 8798` y abrir **`http://127.0.0.1:8798/?demo`** (abre la v2 con datos de ejemplo:
  no toca los reales; dos pestañas = dos personas en vivo; la demo imita los permisos de la base, pero lo que dependa
  de la base de verdad se comprueba con la real). Sin `?demo` usa los datos REALES.
- Repeticiones: `cd tests && node probar_recurrencia.mjs` (debe dar 24/24).
- Publicar: `python3 publicar.py "qué he cambiado"` (trae lo del otro, marca versión nueva y sube; a quien la tenga
  abierta le sale «RECARGAR»).
- Antes de empezar a editar: `git pull`.
