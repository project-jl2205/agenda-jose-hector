# AGENDA JOSE · HÉCTOR — web (instrucciones para Claude)

App solo para Jose Luis y Héctor: agenda semanal y diaria, anotaciones de mercado, setups y winrate.
Este repositorio es **solo la web** (GitHub Pages, público). Los datos viven en Supabase. El agente que
vigila los setups con MT5 y el esquema de la base de datos están en el PC Windows de Jose Luis
(`sistema/agenda/` del proyecto), no aquí.

## Reglas
- **Todo en español**: interfaz, textos, comentarios del código.
- **Estética = el panel original**: tokens de `css/base.css` (`--bg #0a0a0f`, `--surface #12121a`,
  naranja `#f97316`, verde `#10b981`, índigo `#6366f1`, rosa `#ec4899`…), Segoe UI/system-ui, etiquetas en
  mayúsculas con letter-spacing, tarjetas `.card`. Solo modo oscuro. Que funcione a 390 px (móvil).
- **Sin build ni framework**: HTML + módulos ES. Librerías por CDN con versión fija (supabase-js, Chart.js).
- **Seguridad**: nunca `innerHTML` con texto de usuario → `ui.el()` / `textContent`.
  Nunca una clave **secreta** (`sb_secret_…`) en ningún fichero: `js/config.js` solo lleva la URL y la
  clave **publicable** (pública por diseño; protege RLS + la lista de 2 miembros).
- **Setups: cada uno toca solo los suyos** (decisión de los dos, 2026-10-20). El autor (`setups.autor`) es
  siempre quien lo crea (no hay selector de autor) y es el único que lo edita, anula, manda a la papelera,
  marca sus pasos «a mano», sube capturas y marca el resultado. El otro lo ve todo y puede comentarlo, pero
  no le salen esos botones. La base de datos lo impone (permisos `autor_*` en `setups`, `setup_marcas`,
  `setup_capturas` y `capturas_suben` en storage): no los abras a los dos al tocar permisos. Si la base
  rechaza un cambio, `db.js` lo convierte en error para que la pantalla lo deshaga (no se queda «hecho»).
- **Cambios en el modelo de datos** (tablas/columnas/permisos): se pueden hacer desde cualquiera de los
  dos ordenadores. Se preparan como SQL para pegar en el SQL Editor de Supabase y la web se publica
  DESPUÉS de aplicarlo (si no, la web pediría columnas que aún no existen). Si afecta a lo que vigila el
  agente de MT5, avisa de qué hay que cambiar en él.

## Mapa
- `index.html` · `css/base.css` (tokens y piezas del panel) · `css/vistas.css`
- `js/app.js` arranque, cabecera, rutas (#/semana, #/dia, #/mercado, #/setups, #/winrate, #/ajustes)
- `js/store.js` copia en memoria de las tablas + tiempo real · `js/db.js` Supabase o demo · `js/demo.js`
- `js/fechas.js` (Europe/Madrid) · `js/recurrencia.js` (RRULE = dateutil) · `js/ui.js` (piezas)
- `js/vistas/*.js` una pantalla por fichero; cada una exporta `montar(contenedor, ctx) -> desmontar`

## Probar y publicar
- Probar: `python3 -m http.server 8798` y abrir **`http://127.0.0.1:8798/?demo`** (datos de ejemplo,
  no toca los reales; dos pestañas = dos personas en vivo; la demo imita los permisos de setups, pero
  lo que dependa de la base de datos de verdad se comprueba con la real). Sin `?demo` usa los datos REALES.
- Repeticiones: `cd tests && node probar_recurrencia.mjs` (debe dar 21/21).
- Publicar: `python3 publicar.py "qué he cambiado"` (trae lo del otro, marca versión nueva y sube).
- Antes de empezar a editar: `git pull`.
