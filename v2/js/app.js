// AGENDA JOSE · HÉCTOR — v2 «Fluido». Misma base de datos, mismo login y misma lógica que la agenda
// de siempre (../js/): solo cambia el marco (isla arriba, barra con gota abajo, páginas con muelle) y
// las vistas Semana y Hoy, que son nuevas. Setups, Mercado, Winrate, Ajustes y los editores son los de
// siempre con la piel Fluido (css/fluido.css).
// Rutas (hash): #/calendario[/2026-11] · #/semana[/2026-W42] · #/dia[/2026-10-13] · #/setups (= operaciones publicadas) · #/notas ·
// #/mercado · #/ajustes. Sin Winrate ni setups planificados: «Solo operaciones» (decisión de Jose Luis, 7-nov).

import { CONFIG } from '../../js/config.js';
import * as db from '../../js/db.js';
import { store } from '../../js/store.js';
import * as ui from '../../js/ui.js';
import * as F from '../../js/fechas.js';
import { ocurrencias, claveOcurrencia } from '../../js/recurrencia.js';
import { Muelle, QUIETO, EASE, DUR, brilloTarjetas, zonaArriba } from './motor.js';

const { el } = ui;

/* ---- TUTORIAL (6-nov): las explicaciones de «cómo se usa» (class="tuto") solo se ven los primeros 5 minutos de uso
   en cada dispositivo. Cuenta el uso de verdad: con la pestaña a la vista y algún toque, tecla o rueda en el último minuto. ---- */
const CLAVE_USO = 'agenda-jh-uso-s', TUTO_S = 300;
let usoS = 0; try { usoS = Math.max(0, +localStorage.getItem(CLAVE_USO) || 0); } catch { }
let ultimoGesto = Date.now();
['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(t => addEventListener(t, () => { ultimoGesto = Date.now(); }, { passive: true, capture: true }));
document.documentElement.classList.toggle('sin-tuto', usoS >= TUTO_S);
const relojTuto = setInterval(() => {
  if (document.hidden || Date.now() - ultimoGesto > 60000) return;
  usoS += 5; try { localStorage.setItem(CLAVE_USO, String(usoS)); } catch { }
  if (usoS < TUTO_S) return;
  clearInterval(relojTuto);
  const vistos = [...document.querySelectorAll('.tuto')].filter(n => n.offsetParent);
  if (!vistos.length || matchMedia('(prefers-reduced-motion: reduce)').matches) return document.documentElement.classList.add('sin-tuto');
  vistos.forEach(n => n.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 600, easing: 'ease-out', fill: 'forwards' }));
  setTimeout(() => document.documentElement.classList.add('sin-tuto'), 620);
}, 5000);

// ---- TUS COLORES (6-nov, de la demo): fondo, tarjetas y barra de abajo; personales, solo en este dispositivo ----
const CLAVE_TEMA = 'agenda-jh-tema', CLAVE_ISLA = 'agenda-jh-isla';
const TEMAS = {
  negro: { n: 'Negro', bg: '#000000', card: '#0e0e10', barra: '#161618' },
  azul: { n: 'Azul noche', bg: '#050b18', card: '#0c1932', barra: '#132447' },
  grafito: { n: 'Grafito', bg: '#121214', card: '#1c1c20', barra: '#28282e' },
  bosque: { n: 'Bosque', bg: '#03100a', card: '#0a1f14', barra: '#112c1e' },
  ciruela: { n: 'Ciruela', bg: '#0d0613', card: '#1b0e26', barra: '#271537' },
  vino: { n: 'Vino', bg: '#110509', card: '#230c15', barra: '#331220' },
};
const okColor = c => /^#[0-9a-f]{6}$/i.test(c || '');
let tema = (() => { try { const t = JSON.parse(localStorage.getItem(CLAVE_TEMA)); if (t && okColor(t.bg) && okColor(t.card) && okColor(t.barra)) return { bg: t.bg, card: t.card, barra: t.barra }; } catch { } const n = TEMAS.negro; return { bg: n.bg, card: n.card, barra: n.barra }; })();
function aplicarTema() {
  const st = document.documentElement.style; st.setProperty('--bg', tema.bg); st.setProperty('--card', tema.card); st.setProperty('--barra', tema.barra);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', tema.bg);
}
const guardarTema = () => { try { localStorage.setItem(CLAVE_TEMA, JSON.stringify(tema)); } catch { } };
aplicarTema();
const luz = hex => { const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const temaActual = () => Object.keys(TEMAS).find(k => TEMAS[k].bg === tema.bg && TEMAS[k].card === tema.card && TEMAS[k].barra === tema.barra);
const temaClaro = () => [tema.bg, tema.card, tema.barra].some(c => luz(c) > 0.22);
let temaAbierto = null;
function temaHTML() {
  const act = temaActual();
  return `<h3>Tus colores</h3><p>Solo cambian en este dispositivo: si el otro pone los suyos en azul, los tuyos se quedan como estén.</p>
    <div class="temas">${Object.entries(TEMAS).map(([k, t]) => `<button class="tm ${k === act ? 'on' : ''}" data-tema="${k}" style="--b:${t.bg};--k:${t.card};--r:${t.barra}"><i></i>${t.n}</button>`).join('')}</div>
    ${[['bg', 'Fondo'], ['card', 'Tarjetas y cuadros'], ['barra', 'Barra de abajo']].map(([k, n]) => `<label class="tema-f"><span>${n}</span><code>${tema[k]}</code><input type="color" data-tc="${k}" value="${tema[k]}"></label>`).join('')}
    <div class="tema-pie"><span class="tema-aviso" ${temaClaro() ? '' : 'hidden'}>Muy claro: el texto blanco casi no se leerá</span><button class="btn btn-peq" data-tema="negro">Volver al negro</button></div>`;
}
function refrescarPanelTema() {
  const p = temaAbierto; if (!p) return; const act = temaActual();
  p.querySelectorAll('.tm').forEach(b => b.classList.toggle('on', b.dataset.tema === act));
  p.querySelectorAll('[data-tc]').forEach(i => { i.previousElementSibling.textContent = tema[i.dataset.tc]; });
  p.querySelector('.tema-aviso').hidden = !temaClaro();
}
function abrirTema() {
  if (temaAbierto) return;
  const p = el('div', { class: 'tema', role: 'dialog', 'aria-label': 'Tus colores' }); p.innerHTML = temaHTML(); document.body.append(p); temaAbierto = p;
  p.addEventListener('click', ev => { const b = ev.target.closest('[data-tema]'); if (!b) return; const t = TEMAS[b.dataset.tema]; tema = { bg: t.bg, card: t.card, barra: t.barra }; aplicarTema(); guardarTema(); p.innerHTML = temaHTML(); });
  p.addEventListener('input', ev => { const i = ev.target.closest('[data-tc]'); if (!i) return; tema[i.dataset.tc] = i.value; aplicarTema(); guardarTema(); refrescarPanelTema(); });
  if (!QUIETO) p.animate([{ opacity: 0, transform: 'scale(.92) translateY(-10px)' }, { opacity: 1, transform: 'none' }], { duration: DUR(), easing: EASE() });
}
function cerrarTema() { const p = temaAbierto; if (!p) return; temaAbierto = null; if (QUIETO) return p.remove(); p.animate([{ opacity: 1 }, { opacity: 0, transform: 'scale(.95) translateY(-6px)' }], { duration: 170, easing: 'ease-in', fill: 'forwards' }).onfinish = () => p.remove(); }
document.addEventListener('click', ev => { if (temaAbierto && !ev.target.closest('.tema, #bTema')) cerrarTema(); });
document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && temaAbierto) cerrarTema(); });

// ---- quitar / poner la isla (6-nov): personal, solo en este dispositivo ----
let islaQuitada = false; try { islaQuitada = localStorage.getItem(CLAVE_ISLA) === 'quitada'; } catch { }
const ICO_TEMA = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.6-.9 1.2-1.8l-.4-.9c-.5-1 .3-2.3 1.4-2.3H17a4 4 0 0 0 4-4c0-4.9-4-9-9-9z"/><circle cx="7.5" cy="11" r="1.2" fill="currentColor" stroke="none"/><circle cx="10.5" cy="7" r="1.2" fill="currentColor" stroke="none"/><circle cx="15.5" cy="7.5" r="1.2" fill="currentColor" stroke="none"/></svg>';
const ICO_ISLA = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect class="bi-pil" x="3" y="8.5" width="18" height="7" rx="3.5"/><path class="bi-hueco" d="M4.5 4.5l15 15" stroke="#000" stroke-width="5"/><path class="bi-raya" d="M4.5 4.5l15 15"/></svg>';
function pintarBotonIsla() {
  const b = document.getElementById('bIsla'); if (!b) return; const t = islaQuitada ? 'Poner la isla' : 'Quitar la isla';
  b.classList.toggle('off', islaQuitada); b.title = `${t} (solo en este dispositivo)`; b.setAttribute('aria-label', t); b.setAttribute('aria-pressed', String(islaQuitada));
}
function verIsla() { document.querySelector('.isla-pos')?.classList.toggle('oculta', islaQuitada && modoIsla !== 'aviso'); }
function alternarIsla() {
  islaQuitada = !islaQuitada; try { localStorage.setItem(CLAVE_ISLA, islaQuitada ? 'quitada' : 'puesta'); } catch { }
  pintarBotonIsla(); islaA('compacta');
}

// ---- escribir en el móvil (6-nov): al tocar un campo sale el teclado; la barra de pestañas y el suelo se apartan y el
//      campo se coloca a la vista encima del teclado (también si el teclado cambia de alto) ----
const esCampoTexto = n => !!n && (n.isContentEditable || n.tagName === 'TEXTAREA' || (n.tagName === 'INPUT' && !/^(color|button|checkbox|radio|range|submit|file)$/i.test(n.type)));
const tactil = () => matchMedia('(pointer: coarse)').matches;
function asegurarCampo() {
  const a = document.activeElement; if (!esCampoTexto(a) || !tactil()) return;
  // un campo pegado abajo (la nota nueva de Notas): se baja hasta el final de su bloque, con lo último justo encima
  const pegado = a.closest('[data-pegado-abajo]');
  if (pegado) { (pegado.closest('[data-hasta-el-final]') || pegado).scrollIntoView({ block: 'end', behavior: 'instant' }); return; }
  const vv = window.visualViewport, arriba = vv ? vv.offsetTop : 0, alto = vv ? vv.height : innerHeight, r = a.getBoundingClientRect();
  if (r.bottom > arriba + alto - 12 || r.top < arriba + 76 + zonaArriba()) a.scrollIntoView({ block: r.height > alto - 110 ? 'start' : 'nearest', behavior: 'instant' });
  // corregir algo que ese campo pegado abajo taparía (una nota de la lista): la página sube hasta dejarlo encima de él
  const tapa = paginaActual?.querySelector('[data-pegado-abajo]');
  if (tapa) { const r2 = a.getBoundingClientRect(), lim = tapa.getBoundingClientRect().top - 10; if (r2.bottom > lim) scrollBy({ top: r2.bottom - lim, behavior: 'instant' }); }
}
let tEscribe = 0;
document.addEventListener('focusin', ev => {
  if (!esCampoTexto(ev.target) || !tactil()) return;
  clearTimeout(tEscribe); document.body.classList.add('escribiendo');
  setTimeout(asegurarCampo, 60); setTimeout(asegurarCampo, 380);
});
document.addEventListener('focusout', () => { clearTimeout(tEscribe); tEscribe = setTimeout(() => { if (!esCampoTexto(document.activeElement)) document.body.classList.remove('escribiendo'); }, 150); });
addEventListener('resize', () => setTimeout(asegurarCampo, 40));
window.visualViewport?.addEventListener('resize', () => setTimeout(asegurarCampo, 40));

const SVG = {
  calendario: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4.5" width="18" height="16.5" rx="4"/><path d="M3 9.5h18M8 2.5v3.5M16 2.5v3.5"/><path d="M7.5 13.5h.01M12 13.5h.01M16.5 13.5h.01M7.5 17.5h.01M12 17.5h.01"/></svg>',
  semana: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="3" y="4" width="18" height="17" rx="4"/><path d="M3 9h18"/></svg>',
  dia: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  setups: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M3 17l5-6 4 4 8-9"/></svg>',
  prompts: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 17l6-5-6-5"/><path d="M12 19h8"/></svg>',
  notas: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h9l4 4v14H6z"/><path d="M9 10h7M9 14h7M9 18h4"/></svg>',
  mercado: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3v18M17 3v18"/><rect x="4.5" y="7" width="5" height="9" rx="1.5"/><rect x="14.5" y="5" width="5" height="7" rx="1.5"/></svg>',
  winrate: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  ajustes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/></svg>',
};
const svg = (nombre) => { const s = el('span', { class: 'ico', 'aria-hidden': 'true' }); s.innerHTML = SVG[nombre] || ''; return s; };

const VISTAS = {
  calendario: { titulo: 'Calendario', tab: true, cargar: () => import('./vistas/calendario.js') },
  semana:  { titulo: 'Semana',  tab: true, cargar: () => import('./vistas/semana.js') },
  dia:     { titulo: 'Hoy',     tab: true, cargar: () => import('./vistas/hoy.js') },
  setups:  { titulo: 'Setups',  tab: true, cargar: () => import('./vistas/operaciones.js') },
  prompts: { titulo: 'Prompts', tab: true, soloPC: true, cargar: () => import('./vistas/prompts.js') },   // en el móvil no (las ideas se marcan con </> en Semana)
  notas:   { titulo: 'Notas',   tab: true, cargar: () => import('./vistas/notas.js') },
  mercado: { titulo: 'Mercado', tab: true, cargar: () => import('../../js/vistas/mercado.js'), clasica: true },
  ajustes: { titulo: 'Ajustes', tab: false, cargar: () => import('../../js/vistas/ajustes.js'), clasica: true },
};
const ORDEN = Object.keys(VISTAS);

const raiz = document.getElementById('app');
let desmontar = null;
let turno = 0;
let iniciado = false;
let conexion = 'conectando';
let presentes = [];
let vistaActual = null;
let paginaActual = null;

export function navegar(ruta) {
  location.hash = ruta.startsWith('#') ? ruta : `#/${ruta.replace(/^\//, '')}`;
}

// ---- arranque (igual que la v1) -----------------------------------------------------------------
async function arrancar() {
  try {
    const { modo } = await db.iniciar();
    document.body.classList.toggle('modo-demo', modo === 'demo');
  } catch (e) {
    return pantallaError('No se pudo cargar la app (¿sin conexión?).', e);
  }
  db.auth.alCambiar(s => { if (!s && iniciado) location.reload(); });
  const enlace = db.auth.enlace();
  const sesion = await db.auth.sesion();
  if (enlace.recuperacion && sesion) return mostrarNuevaClave(sesion);   // viene del correo «contraseña nueva»
  if (sesion) await entrarEnApp(sesion); else mostrarEntrar(enlace.error || (enlace.recuperacion ? 'El enlace del correo no ha funcionado. Pide otro.' : ''));
}

async function entrarEnApp(sesion) {
  ui.reemplazar(raiz, el('div', { class: 'cargando' }, 'Cargando la agenda…'));
  store.ponerUsuario(sesion.usuarioId);
  try { await store.cargarTodo(); }
  catch (e) { return pantallaError('No se pudieron cargar los datos.', e); }
  if (!store.usuario()) return pantallaNoMiembro(sesion);

  iniciado = true;
  db.suscribir(c => store.aplicar(c), estado => {
    const antes = conexion;
    conexion = estado;
    pintarEstado();
    if (estado === 'vivo' && antes === 'caido') store.cargarTodo().catch(() => {});
  });
  montarMarco();
  const yo = store.usuario();
  db.presencia.unirse(sesion.usuarioId, { nombre: yo.nombre, color: yo.color, vista: 'semana', desde: new Date().toISOString() },
    lista => { presentes = lista; pintarEstado(); });
  store.on(['perfiles'], pintarEstado);   // sin pastilla «Agente»: en la v2 no hay setups que vigilar (7-nov)
  store.on(['tareas', 'tareas_hechas', 'grupos', 'perfiles'], () => { if (modoIsla === 'compacta' || modoIsla === 'grande') islaDatos(); });
  setInterval(() => { pintarEstado(); if (modoIsla === 'compacta') islaDatos(); }, 15000);
  window.addEventListener('hashchange', enrutar);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && conexion !== 'vivo') store.cargarTodo().catch(() => {}); });
  enrutar();
}

// ---- pantallas de acceso ------------------------------------------------------------------------
function tarjetaAcceso(...hijos) {
  return el('div', { class: 'acceso' },
    el('div', { class: 'acceso-caja card' },
      el('div', { class: 'acceso-cab' },
        el('h1', {}, 'Agenda'),
        el('span', {}, 'Jose Luis · Héctor')),
      ...hijos));
}

function mostrarEntrar(aviso = '') {
  if (db.enDemo()) {
    const boton = (nombre, email, color) => el('button', {
      class: 'btn btn-grande', style: { '--c': color },
      onclick: async () => { try { await db.auth.entrar(email); await entrarEnApp(await db.auth.sesion()); } catch (e) { ui.error(e); } },
    }, `Entrar como ${nombre}`);
    ui.reemplazar(raiz, tarjetaAcceso(
      el('p', { class: 'acceso-nota' }, 'MODO DEMO: no hay servidor. Los datos de ejemplo viven solo en este navegador.'),
      boton('Jose Luis', 'jose@demo', '#f59e0b'),
      boton('Héctor', 'hector@demo', '#6366f1'),
      el('p', { class: 'acceso-nota' }, 'Abre otra pestaña y entra como la otra persona para ver cómo se sincronizan los cambios.')));
    return;
  }
  let registro = false, olvido = false;
  const email = el('input', { type: 'email', autocomplete: 'email', placeholder: 'tu@correo.com' });
  const clave = el('input', { type: 'password', autocomplete: 'current-password', placeholder: 'Contraseña' });
  const clave2 = el('input', { type: 'password', autocomplete: 'new-password', placeholder: 'Repite la contraseña' });
  const campoClave = ui.campo('Contraseña', clave);
  const campoClave2 = ui.campo('Repite la contraseña', clave2);
  const mensaje = el('div', { class: 'acceso-msg' }, aviso);
  const boton = el('button', { class: 'btn btn-primario btn-ancho', type: 'submit' }, 'Entrar');
  const cambiar = el('button', { class: 'enlace', type: 'button' }, '¿Primera vez? Crear cuenta');
  const bOlvido = el('button', { class: 'enlace', type: 'button' }, '¿Has olvidado la contraseña?');
  const notaOlvido = el('p', { class: 'acceso-nota' },
    'Te mandamos un enlace a tu correo para poner una contraseña nueva. Solo llega si ese correo tiene cuenta en la agenda, ',
    'así que si no te acuerdas de cuál usaste, prueba con los que tengas.');
  const pintarModo = () => {
    campoClave.style.display = olvido ? 'none' : '';
    campoClave2.style.display = registro && !olvido ? '' : 'none';
    notaOlvido.style.display = olvido ? '' : 'none';
    cambiar.style.display = olvido ? 'none' : '';
    boton.textContent = olvido ? 'Mandarme el enlace' : registro ? 'Crear cuenta' : 'Entrar';
    cambiar.textContent = registro ? 'Ya tengo cuenta: entrar' : '¿Primera vez? Crear cuenta';
    bOlvido.textContent = olvido ? 'Volver: ya me acuerdo' : '¿Has olvidado la contraseña?';
    bOlvido.style.display = registro ? 'none' : '';
    clave.autocomplete = registro ? 'new-password' : 'current-password';
  };
  cambiar.onclick = () => { registro = !registro; mensaje.textContent = ''; pintarModo(); };
  bOlvido.onclick = () => { olvido = !olvido; mensaje.className = 'acceso-msg'; mensaje.textContent = ''; pintarModo(); };
  const form = el('form', {
    class: 'acceso-form',
    onsubmit: async ev => {
      ev.preventDefault();
      mensaje.className = 'acceso-msg';
      mensaje.textContent = '';
      if (olvido) {
        if (!email.value.trim()) { mensaje.textContent = 'Escribe tu correo.'; return; }
        boton.disabled = true;
        try {
          await db.auth.recuperar(email.value);
          mensaje.className = 'acceso-msg ok';
          mensaje.textContent = `Si ${email.value.trim()} tiene cuenta, en un par de minutos te llega un correo de Supabase (mira también en spam). `
            + 'Ábrelo en este mismo dispositivo: entrarás y te pedirá la contraseña nueva.';
        } catch (e) { mensaje.textContent = e.message; } finally { boton.disabled = false; }
        return;
      }
      if (!email.value.trim() || !clave.value) { mensaje.textContent = 'Escribe tu correo y tu contraseña.'; return; }
      if (registro && clave.value !== clave2.value) { mensaje.textContent = 'Las contraseñas no coinciden.'; return; }
      boton.disabled = true;
      try {
        if (registro) {
          const { confirmar } = await db.auth.registrarse(email.value, clave.value);
          if (confirmar) {
            mensaje.className = 'acceso-msg ok';
            mensaje.textContent = 'Cuenta creada. Te ha llegado un correo para confirmarla; después entra aquí.';
            registro = false; pintarModo(); return;
          }
        } else {
          await db.auth.entrar(email.value, clave.value);
        }
        await entrarEnApp(await db.auth.sesion());
      } catch (e) {
        mensaje.textContent = e.message;
      } finally { boton.disabled = false; }
    },
  }, ui.campo('Correo', email), campoClave, campoClave2, notaOlvido, mensaje, boton, cambiar, bOlvido);
  pintarModo();
  ui.reemplazar(raiz, tarjetaAcceso(form));
}

// Vuelta del correo «contraseña nueva»: ya hay sesión; se pide la contraseña nueva y se entra.
function mostrarNuevaClave(sesion) {
  const clave = el('input', { type: 'password', autocomplete: 'new-password', placeholder: 'Contraseña nueva' });
  const clave2 = el('input', { type: 'password', autocomplete: 'new-password', placeholder: 'Repite la contraseña' });
  const mensaje = el('div', { class: 'acceso-msg' });
  const boton = el('button', { class: 'btn btn-primario btn-ancho', type: 'submit' }, 'Guardar y entrar');
  const form = el('form', {
    class: 'acceso-form',
    onsubmit: async ev => {
      ev.preventDefault();
      mensaje.className = 'acceso-msg';
      mensaje.textContent = '';
      if (clave.value.length < 6) { mensaje.textContent = 'Mínimo 6 caracteres.'; return; }
      if (clave.value !== clave2.value) { mensaje.textContent = 'Las contraseñas no coinciden.'; return; }
      boton.disabled = true;
      try {
        await db.auth.cambiarClave(clave.value);
        history.replaceState(null, '', location.pathname + location.search);
        await entrarEnApp(sesion);
        ui.toast('Contraseña nueva guardada');
      } catch (e) { mensaje.textContent = e.message; boton.disabled = false; }
    },
  },
  el('p', { class: 'acceso-nota' }, 'Pon tu contraseña nueva para ', el('b', {}, sesion.email || 'tu cuenta'),
    '. Apunta el correo: es con el que entras en la agenda.'),
  ui.campo('Contraseña nueva', clave), ui.campo('Repite la contraseña', clave2), mensaje, boton);
  ui.reemplazar(raiz, tarjetaAcceso(form));
}

function pantallaNoMiembro(sesion) {
  ui.reemplazar(raiz, tarjetaAcceso(
    el('p', { class: 'acceso-nota' }, `La cuenta ${sesion.email || ''} no está en la lista de miembros.`),
    el('p', { class: 'acceso-nota' }, 'Esta app es solo para Jose Luis y Héctor. Si eres uno de los dos, pide que añadan tu correo y vuelve a entrar.'),
    el('button', { class: 'btn btn-ancho', onclick: () => db.auth.salir().then(() => location.reload()) }, 'Salir')));
}

function pantallaError(texto, e) {
  console.error(e);
  ui.reemplazar(raiz, tarjetaAcceso(
    el('p', { class: 'acceso-msg' }, texto),
    el('p', { class: 'acceso-nota' }, String(e?.message || e || '')),
    el('button', { class: 'btn btn-primario btn-ancho', onclick: () => location.reload() }, 'Reintentar')));
}

// ---- marco: isla + esquina + escena + barra -----------------------------------------------------
let isla, gota, mG;
function montarMarco() {
  const tabs = el('nav', { class: 'tabs', id: 'tabs', 'aria-label': 'Secciones' },
    gota = el('span', { class: 'gota', 'aria-hidden': 'true' }),
    ORDEN.filter(k => VISTAS[k].tab).map(k => el('a', { href: `#/${k}`, dataset: { v: k }, class: VISTAS[k].soloPC ? 'solo-pc' : null }, svg(k), el('span', { class: 'tab-t' }, VISTAS[k].titulo))));
  // el ancho de cada pestaña depende de cuántas se VEN (Prompts no sale en el móvil): se recuenta al cambiar de tamaño
  const contarTabs = () => tabs.style.setProperty('--n', String([...tabs.querySelectorAll('a')].filter(a => getComputedStyle(a).display !== 'none').length || 1));
  contarTabs(); addEventListener('resize', contarTabs); requestAnimationFrame(contarTabs);
  ui.reemplazar(raiz,
    el('div', { class: 'techo', 'aria-hidden': 'true' }),
    el('div', { class: 'suelo', 'aria-hidden': 'true' }),
    el('div', { class: 'isla-pos' }, construirIsla()),
    el('div', { class: 'esquina', id: 'esquina' },
      el('div', { class: 'esq-b' },
        el('button', { id: 'bIsla', type: 'button', onclick: alternarIsla }),
        el('button', { id: 'bTema', type: 'button', title: 'Tus colores (solo en este dispositivo)', 'aria-label': 'Tus colores', onclick: () => (temaAbierto ? cerrarTema() : abrirTema()) })),
      el('div', { id: 'presencia', class: 'presencia' }),
      el('span', { id: 'pill-conexion', class: 'estado-p' }),
      el('button', { id: 'yo', class: 'yo', title: 'Ajustes y salir', onclick: () => navegar('ajustes') })),
    el('div', { class: 'marco' },
      el('main', { class: 'escena', id: 'escena' }),
      el('div', { class: 'footer' }, `Agenda Jose · Héctor · v2 Fluido${db.enDemo() ? ' · MODO DEMO' : ''} · `,
        el('a', { href: `../clasica.html${db.enDemo() ? '?demo' : ''}`, class: 'enlace-v1' }, 'abrir la agenda clásica'))),
    tabs);
  document.getElementById('bIsla').innerHTML = ICO_ISLA; document.getElementById('bTema').innerHTML = ICO_TEMA; pintarBotonIsla();
  mG = new Muelle(0, (x, v) => {
    const est = Math.min(0.35, Math.abs(v) / 2600);
    // quieta: en píxel entero y sin escala (nítida); estirada solo mientras se mueve
    gota.style.transform = est < 0.002 ? `translateX(${Math.round(x)}px)` : `translateX(${x}px) scale(${1 + est}, ${1 - est * 0.55})`;
  }, { k: 230, c: 21, eps: 0.1 });
  addEventListener('resize', () => { moverGota(true); remedirIsla(); });
  { const w = anchoIsla(modoIsla); mW.x = mW.obj = w; isla.style.width = `${w}px`; isla.querySelectorAll('.capa').forEach(c => { if (c.dataset.m === modoIsla) c.style.width = `${w}px`; }); }
  verIsla();
  requestAnimationFrame(() => requestAnimationFrame(() => document.documentElement.classList.remove('arranca-sin-isla')));
  brilloTarjetas(document.body);
  pintarEstado();
  islaDatos();
}

// la barra se centra en píxel entero (a medio píxel el navegador difumina texto, iconos, bordes y sombra)
function centrarBarra() { const tb = document.getElementById('tabs'); if (!tb) return; tb.style.margin = '0'; tb.style.right = 'auto'; tb.style.left = `${Math.floor((document.documentElement.clientWidth - tb.offsetWidth) / 2)}px`; }
function moverGota(salto) {
  centrarBarra();
  const b = document.querySelector(`#tabs [data-v="${vistaActual}"]`);
  if (!gota) return;
  gota.style.opacity = b ? '1' : '0';
  if (!b) return;
  gota.style.width = `${b.offsetWidth}px`;
  if (salto) { mG.x = b.offsetLeft - 6; mG.fn(mG.x, 0); }
  mG.a(b.offsetLeft - 6);
}

function pintarEstado() {
  const yo = store.usuarioId();
  const caja = document.getElementById('presencia');
  if (caja) ui.reemplazar(caja, presentes.filter(p => p.usuarioId !== yo).map(p => {
    const perfil = store.perfil(p.usuarioId) || p;
    const a = ui.avatar(perfil, 30);
    a.classList.add('en-linea');
    a.title = `${perfil.nombre} está en ${VISTAS[p.vista]?.titulo || 'la app'}`;
    return a;
  }));
  const b = document.getElementById('yo');
  if (b) ui.reemplazar(b, ui.avatar(store.usuario(), 32));

  const pc = document.getElementById('pill-conexion');
  if (pc) {
    const [clase, texto, titulo] = db.enDemo() ? ['rosa', 'Demo', 'Datos de ejemplo solo en este navegador']
      : conexion === 'vivo' ? ['verde', 'En vivo', 'Los cambios del otro se ven al instante']
      : conexion === 'caido' ? ['rojo', 'Sin conexión', 'Reconectando: lo que hagas se guarda cuando vuelva la conexión']
      : ['ambar', 'Conectando', 'Conectando con el servidor…'];
    pc.className = `estado-p e-${clase}`;
    ui.reemplazar(pc, el('i'), el('span', {}, texto));
    pc.title = titulo;
  }
}

// ---- ISLA ---------------------------------------------------------------------------------------
const TAM = { compacta: [262, 40, 20], grande: [450, 160, 38], aviso: [420, 56, 28], vista: [200, 44, 22] };
let modoIsla = 'compacta', tIsla = null, deshacer = null;
let mW, mH, mR, mS;
const I = {};
function construirIsla() {
  const capa = (m, clase, ...hijos) => el('div', { class: `capa ${clase} ${m === 'compacta' ? 'on' : ''}`, dataset: { m } }, ...hijos);
  isla = el('div', { class: 'isla', id: 'isla', role: 'button', tabindex: 0, 'aria-label': 'Lo siguiente de hoy' },
    capa('compacta', 'c-compacta', el('span', { class: 'pulso' }), I.iT = el('span', { class: 'ct' }), I.iC = el('span', { class: 'cc' })),
    capa('grande', 'c-grande',
      el('div', { class: 'g1' },
        el('div', { style: { minWidth: 0 } }, I.gL = el('small'), I.gT = el('b'), I.gH = el('span')),
        el('div', { class: 'gnum' }, I.gN = el('b'), I.gU = el('small'))),
      el('div', { class: 'g2' }, el('div', { class: 'gbar' }, I.gB = el('i')), I.gS = el('span'),
        el('button', { class: 'gbtn', dataset: { ir: 'dia' } }, 'Ver el día'))),
    capa('aviso', 'c-aviso', I.aI = el('span', { class: 'aok' }, '✓'), I.aT = el('span', { class: 'at' }), I.aP = el('span', { class: 'ap' }),
      // pulsar «Deshacer» no quita el foco de donde se escribía: si no, la nota del día se guardaba al salir del campo
      // justo antes de deshacer, y al otro le llegaban dos cambios
      I.aD = el('button', { class: 'adh', onmousedown: e => e.preventDefault() }, 'Deshacer')),
    capa('vista', 'c-vista', I.vI = el('span', { class: 'ico' }), I.vT = el('b')));
  mW = new Muelle(262, x => { isla.style.width = `${x}px`; }, { k: 300, c: 25, eps: 0.05 });
  mH = new Muelle(40, x => { isla.style.height = `${x}px`; }, { k: 250, c: 24, eps: 0.05 });
  mR = new Muelle(20, x => { isla.style.borderRadius = `${Math.max(12, x)}px`; }, { k: 300, c: 26, eps: 0.05 });
  mS = new Muelle(1, x => { isla.style.transform = `scale(${x})`; }, { k: 420, c: 22, eps: 0.001 });
  let pulsada = false;
  isla.addEventListener('pointerdown', () => { pulsada = true; mS.a(0.94); });
  addEventListener('pointerup', () => { if (pulsada) { pulsada = false; mS.a(1, { v: mS.v + 2 }); } });
  isla.addEventListener('click', ev => {
    if (ev.target.closest('.adh')) return;
    if (ev.target.closest('[data-ir]')) { islaA('compacta'); return navegar('dia'); }
    if (modoIsla === 'aviso') return islaA('compacta');
    islaA(modoIsla === 'grande' ? 'compacta' : 'grande', modoIsla === 'grande' ? 0 : 7000);
  });
  isla.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); isla.click(); } });
  document.addEventListener('click', ev => { if (modoIsla === 'grande' && !ev.target.closest('#isla')) islaA('compacta'); });
  I.aD.addEventListener('click', () => { const d = deshacer; deshacer = null; islaA('compacta'); d?.(); });
  return isla;
}
// la compacta deja sitio a la esquina en pantallas estrechas
const anchoIsla = modo => { const w = TAM[modo][0]; return Math.min(modo === 'compacta' ? Math.min(w, innerWidth - 108) : w, innerWidth - 24); };
function islaA(modo, ms) {
  if (!isla) return;
  if (islaQuitada && (modo === 'grande' || modo === 'vista')) modo = 'compacta';   // quitada: solo asoman los avisos
  if (modo === 'compacta' || modo === 'grande') islaDatos();
  modoIsla = modo;
  clearTimeout(tIsla);
  document.body.classList.toggle('isla-abierta', modo !== 'compacta');
  const [, h, r] = TAM[modo], w = anchoIsla(modo);
  isla.querySelectorAll('.capa').forEach(c => { c.classList.toggle('on', c.dataset.m === modo); if (c.dataset.m === modo) c.style.width = `${w}px`; });
  mW.a(w); mH.a(h); mR.a(r);
  if (ms) tIsla = setTimeout(() => islaA('compacta'), ms);
  verIsla();
}
// al girar el móvil o cambiar el tamaño: solo se vuelve a medir el ancho (ni se corta el aviso ni su «Deshacer»)
function remedirIsla() { if (!isla) return; const w = anchoIsla(modoIsla); isla.querySelectorAll('.capa').forEach(c => { if (c.dataset.m === modoIsla) c.style.width = `${w}px`; }); mW.a(w); }

/** Aviso en la isla (lo usan las vistas nuevas): texto, extra (p. ej. «+12 %»), color, deshacer(). */
export function avisar(texto, extra = '', color = '', alDeshacer = null) {
  if (!isla) return ui.toast(texto, 'ok', alDeshacer ? { accion: alDeshacer } : {});
  I.aT.textContent = texto;
  I.aP.textContent = extra || '';
  I.aI.style.background = color || 'var(--glow)';
  I.aI.style.animation = 'none'; void I.aI.offsetWidth; I.aI.style.animation = '';
  I.aD.style.display = alDeshacer ? '' : 'none';
  deshacer = alDeshacer;
  islaA('aviso', alDeshacer ? 5000 : 2800);
}

const durTxt = m => (m >= 60 ? `${Math.floor(m / 60)} h ${String(Math.round(m % 60)).padStart(2, '0')}` : `${Math.max(1, Math.round(m))} min`);
/** Lo siguiente de hoy: la tarea con hora que está en curso o la próxima sin hacer. */
export function siguienteDeHoy() {
  const d = F.hoy();
  const ahora = F.minutosDe(F.horaDe(new Date()));
  const yo = store.usuarioId();
  const deHoy = store.vivas('tareas', t => t.hora && (t.fecha || t.rrule) && ocurrencias(t, d, d).length > 0)
    .filter(t => {   // las mías o de los dos (las del otro no me interesan en la isla)
      const g = t.grupo_id && store.fila('grupos', t.grupo_id);
      const p = t.persona || g?.persona;
      return !p || p === yo;
    })
    .filter(t => !store.hecha(t.id, claveOcurrencia(t, d)))
    .map(t => ({ t, ini: F.minutosDe(t.hora), fin: F.minutosDe(t.hora) + (t.duracion_min || 0) }))
    .filter(x => x.fin > ahora || (x.ini >= ahora))
    .sort((a, b) => a.ini - b.ini);
  const x = deHoy[0];
  if (!x) return null;
  const enCurso = x.ini <= ahora && x.fin > ahora;
  return { ...x, enCurso, faltan: enCurso ? x.fin - ahora : x.ini - ahora, total: deHoy.length };
}
export function progresoSemana(semana = F.semanaActual()) {
  const grupos = store.vivas('grupos', g => g.semana === semana);
  const ts = grupos.flatMap(g => store.vivas('tareas', t => t.grupo_id === g.id));
  const h = ts.filter(t => store.hecha(t.id)).length;
  return { n: ts.length, hechas: h, pct: ts.length ? Math.round((h / ts.length) * 100) : 0 };
}
const colorOk = c => /^#[0-9a-f]{6}$/i.test(c || '');
const colorTarea = t => {                                    // el color propio (elegido en el Calendario) manda
  if (colorOk(t.color)) return t.color;
  const e = (t.etiquetas || []).map(id => store.fila('etiquetas', id)).find(x => colorOk(x?.color));
  if (e) return e.color;
  const g = t.grupo_id && store.fila('grupos', t.grupo_id);
  if (colorOk(g?.color)) return g.color;
  const p = store.perfil(t.persona);
  return colorOk(p?.color) ? p.color : '#0a84ff';
};
function islaDatos() {
  if (!isla || !store.usuario()) return;
  const s = siguienteDeHoy();
  const T = progresoSemana();
  const glow = s ? colorTarea(s.t) : (store.usuario()?.color || '#30d158');
  document.documentElement.style.setProperty('--glow', glow);
  const sem = `Semana ${F.numeroSemana(F.semanaActual())}`;
  I.iT.textContent = s ? s.t.titulo : `${sem} · ${T.pct} %`;
  I.iC.textContent = s ? (s.enCurso ? 'ahora' : durTxt(s.faltan)) : (T.n && T.hechas === T.n ? 'hecho' : '');
  I.gL.textContent = s ? (s.enCurso ? 'En curso' : 'Siguiente') : 'Hoy';
  I.gT.textContent = s ? s.t.titulo : 'Nada más con hora por hoy';
  I.gH.textContent = s ? `${F.horaCorta(s.t.hora)}${s.t.duracion_min ? ' – ' + F.horaCorta(F.sumarMinutosHora(s.t.hora, s.t.duracion_min)) : ''}${s.total > 1 ? ` · ${s.total - 1} más después` : ''}` : F.fmtDiaLargoStr(F.hoy());
  const f = s ? Math.round(s.faltan) : 0;
  I.gN.textContent = s ? (f >= 60 ? `${Math.floor(f / 60)}:${String(f % 60).padStart(2, '0')}` : String(Math.max(1, f))) : '✓';
  I.gU.textContent = s ? (s.enCurso ? 'para acabar' : f >= 60 ? 'horas' : 'min') : '';
  I.gB.style.width = `${T.pct}%`;
  I.gS.textContent = `${sem} ${T.pct} %`;
}

// ---- rutas y páginas con muelle -----------------------------------------------------------------
function enrutar() {
  const partes = (location.hash || '').replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  const nombre = VISTAS[partes[0]] ? partes[0] : 'semana';
  montarVista(nombre, partes.slice(1));
}

async function montarVista(nombre, params) {
  const mio = ++turno;
  const antes = vistaActual;
  let modulo;
  try { modulo = await VISTAS[nombre].cargar(); }
  catch (e) { console.error(e); modulo = null; }
  if (mio !== turno) return;
  try { desmontar?.(); } catch (e) { console.error(e); }
  desmontar = null;
  vistaActual = nombre;
  document.querySelectorAll('#tabs [data-v]').forEach(a => a.classList.toggle('on', a.dataset.v === nombre));
  moverGota();

  const escena = document.getElementById('escena');
  const viejo = paginaActual;
  // si se cambia rápido, lo que aún se estaba yendo desaparece ya: nunca hay más de dos páginas a la vez
  [...escena.children].forEach(p => { if (p !== viejo) { p.getAnimations().forEach(a => a.cancel()); p.remove(); } });
  const nueva = el('div', { class: `pagina ${VISTAS[nombre].clasica ? 'clasica' : 'fluida'}`, dataset: { vista: nombre } });
  escena.append(nueva);
  paginaActual = nueva;
  if (!modulo) ui.reemplazar(nueva, ui.vacio('Esta sección no se ha podido cargar.'));
  else {
    const ctx = {
      params, navegar, store, db, ui, F, config: CONFIG, avisar, v2: true,
      usuario: store.usuario(),
      titulo: () => {},
    };
    try { desmontar = modulo.montar(nueva, ctx) || null; }
    catch (e) { ui.error(e, 'Error al pintar la sección: '); }
  }
  const dir = ORDEN.indexOf(nombre) >= ORDEN.indexOf(antes) ? 1 : -1;
  const misma = antes === nombre;
  if (viejo && !QUIETO) {
    viejo.classList.add('saliendo');
    viejo.getAnimations().forEach(a => a.cancel());
    viejo.animate([{ opacity: 1, transform: 'none', filter: 'blur(0)' },
      { opacity: 0, transform: misma ? 'scale(.985)' : `translateX(${-dir * 50}px) scale(.97)`, filter: 'blur(10px)' }],
    { duration: misma ? 180 : 240, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' }).onfinish = () => viejo.remove();
    nueva.animate([{ opacity: 0, transform: misma ? 'scale(.985)' : `translateX(${dir * 70}px) scale(.98)`, filter: 'blur(10px)' },
      { opacity: 1, transform: 'none', filter: 'blur(0)' }], { duration: DUR(), easing: EASE() });
  } else viejo?.remove();
  if (!misma) window.scrollTo({ top: 0, behavior: QUIETO ? 'auto' : 'smooth' });
  if (antes && !misma) {
    I.vI.innerHTML = SVG[nombre] || '';
    I.vT.textContent = nombre === 'dia' ? F.fmtDiaLargoStr(F.hoy()) : VISTAS[nombre].titulo;
    TAM.vista[0] = nombre === 'dia' ? 280 : 200;
    islaA('vista', 1100);
  }
  Promise.resolve(db.presencia.actualizar({ vista: nombre })).catch(() => {});
}

// ---- aviso de versión nueva (publicar.py escribe ../version.json) --------------------------------
async function leerVersion() {
  try {
    const r = await fetch(`../version.json?t=${Date.now()}`, { cache: 'no-store' });
    return r.ok ? (await r.json()).version || null : null;
  } catch { return null; }
}
async function vigilarVersion() {
  const cargada = await leerVersion();
  if (!cargada) return;
  const comprobar = async () => {
    const v = await leerVersion();
    if (v && v !== cargada && !document.getElementById('aviso-version')) {
      document.body.append(el('div', { id: 'aviso-version', class: 'aviso-version', role: 'status' },
        el('span', {}, 'Hay una versión nueva de la agenda'),
        el('button', { class: 'btn btn-peq btn-primario', onclick: () => location.reload() }, 'Recargar')));
    }
  };
  setInterval(comprobar, 5 * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) comprobar(); });
}

// ---- atajos: 1, 2, 3… cambian de pestaña (si no estás escribiendo) --------------------------------
document.addEventListener('keydown', ev => {
  if (!iniciado || ev.ctrlKey || ev.metaKey || ev.altKey) return;
  if (ev.target.closest?.('input, textarea, select, [contenteditable]') || document.querySelector('.modal-bg')) return;
  const tabs = ORDEN.filter(k => VISTAS[k].tab && !(VISTAS[k].soloPC && matchMedia('(max-width: 820px)').matches));
  const n = +ev.key;
  if (n >= 1 && n <= tabs.length) navegar(tabs[n - 1]);
});

window.addEventListener('unhandledrejection', ev => ui.error(ev.reason));
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('../sw.js').catch(e => console.warn('Service worker no registrado', e));
}

arrancar();
vigilarVersion();
