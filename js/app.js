// Arranque de la app: entrar, cargar datos, tiempo real, cabecera, navegación y rutas.
// Rutas (hash): #/semana[/2026-W42] · #/dia[/2026-10-13] · #/mercado[/2026-10] · #/setups[/nuevo|/<id>]
//               #/winrate · #/ajustes
// Cada vista exporta montar(contenedor, ctx) -> desmontar().
//   ctx = { params, navegar(ruta), titulo(texto), usuario, store, db, ui, F, config }

import { CONFIG } from './config.js';
import * as db from './db.js';
import { store } from './store.js';
import * as ui from './ui.js';
import * as F from './fechas.js';

const { el } = ui;

const VISTAS = {
  semana:  { titulo: 'Semana',  icono: 'semana',  cargar: () => import('./vistas/semana.js') },
  dia:     { titulo: 'Día',     icono: 'dia',     cargar: () => import('./vistas/dia.js') },
  mercado: { titulo: 'Mercado', icono: 'mercado', cargar: () => import('./vistas/mercado.js') },
  setups:  { titulo: 'Setups',  icono: 'setups',  cargar: () => import('./vistas/setups.js') },
  winrate: { titulo: 'Winrate', icono: 'winrate', cargar: () => import('./vistas/winrate.js') },
  ajustes: { titulo: 'Ajustes', icono: 'ajustes', cargar: () => import('./vistas/ajustes.js') },
};

const raiz = document.getElementById('app');
let desmontar = null;
let turno = 0;
let iniciado = false;
let conexion = 'conectando';
let presentes = [];

export function navegar(ruta) {
  location.hash = ruta.startsWith('#') ? ruta : `#/${ruta.replace(/^\//, '')}`;
}

// ---- arranque -----------------------------------------------------------------------------------
async function arrancar() {
  try {
    const { modo } = await db.iniciar();
    document.body.classList.toggle('modo-demo', modo === 'demo');
  } catch (e) {
    return pantallaError('No se pudo cargar la app (¿sin conexión?).', e);
  }
  db.auth.alCambiar(s => { if (!s && iniciado) location.reload(); });
  const sesion = await db.auth.sesion();
  if (sesion) await entrarEnApp(sesion); else mostrarEntrar();
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
    pintarConexion();
    if (estado === 'vivo' && antes === 'caido') store.cargarTodo().catch(() => {});   // recupera lo perdido
  });
  montarMarco();
  const yo = store.usuario();
  db.presencia.unirse(sesion.usuarioId, { nombre: yo.nombre, color: yo.color, vista: 'semana', desde: new Date().toISOString() },
    lista => { presentes = lista; pintarPresencia(); });
  store.on(['agente_estado'], pintarAgente);
  store.on(['perfiles'], () => { pintarPresencia(); pintarYo(); });
  setInterval(pintarAgente, 15000);
  window.addEventListener('hashchange', enrutar);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && conexion !== 'vivo') store.cargarTodo().catch(() => {}); });
  enrutar();
}

// ---- pantallas de acceso ------------------------------------------------------------------------
function tarjetaAcceso(...hijos) {
  return el('div', { class: 'acceso' },
    el('div', { class: 'acceso-caja card' },
      el('div', { class: 'acceso-cab' },
        el('h1', {}, 'AGENDA JOSE · HÉCTOR'),
        el('span', {}, 'Solo para Jose Luis y Héctor')),
      ...hijos));
}

function mostrarEntrar() {
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
  let registro = false;
  const email = el('input', { type: 'email', autocomplete: 'email', placeholder: 'tu@correo.com' });
  const clave = el('input', { type: 'password', autocomplete: 'current-password', placeholder: 'Contraseña' });
  const clave2 = el('input', { type: 'password', autocomplete: 'new-password', placeholder: 'Repite la contraseña' });
  const campoClave2 = ui.campo('Repite la contraseña', clave2);
  const mensaje = el('div', { class: 'acceso-msg' });
  const boton = el('button', { class: 'btn btn-primario btn-ancho', type: 'submit' }, 'ENTRAR');
  const cambiar = el('button', { class: 'enlace', type: 'button' }, '¿Primera vez? Crear cuenta');
  const pintarModo = () => {
    campoClave2.style.display = registro ? '' : 'none';
    boton.textContent = registro ? 'CREAR CUENTA' : 'ENTRAR';
    cambiar.textContent = registro ? 'Ya tengo cuenta: entrar' : '¿Primera vez? Crear cuenta';
    clave.autocomplete = registro ? 'new-password' : 'current-password';
  };
  cambiar.onclick = () => { registro = !registro; mensaje.textContent = ''; pintarModo(); };
  const form = el('form', {
    class: 'acceso-form',
    onsubmit: async ev => {
      ev.preventDefault();
      mensaje.className = 'acceso-msg';
      mensaje.textContent = '';
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
  }, ui.campo('Correo', email), ui.campo('Contraseña', clave), campoClave2, mensaje, boton, cambiar);
  pintarModo();
  ui.reemplazar(raiz, tarjetaAcceso(form));
}

function pantallaNoMiembro(sesion) {
  ui.reemplazar(raiz, tarjetaAcceso(
    el('p', { class: 'acceso-nota' }, `La cuenta ${sesion.email || ''} no está en la lista de miembros.`),
    el('p', { class: 'acceso-nota' }, 'Esta app es solo para Jose Luis y Héctor. Si eres uno de los dos, pide que añadan tu correo y vuelve a entrar.'),
    el('button', { class: 'btn btn-ancho', onclick: () => db.auth.salir().then(() => location.reload()) }, 'SALIR')));
}

function pantallaError(texto, e) {
  console.error(e);
  ui.reemplazar(raiz, tarjetaAcceso(
    el('p', { class: 'acceso-msg' }, texto),
    el('p', { class: 'acceso-nota' }, String(e?.message || e || '')),
    el('button', { class: 'btn btn-primario btn-ancho', onclick: () => location.reload() }, 'REINTENTAR')));
}

// ---- marco: cabecera + navegación ---------------------------------------------------------------
function montarMarco() {
  const nav = el('nav', { class: 'nav', 'aria-label': 'Secciones' },
    Object.entries(VISTAS).map(([clave, v]) => el('a', { href: `#/${clave}`, class: 'nav-item', dataset: { vista: clave } },
      ui.icono(v.icono), el('span', {}, v.titulo))));
  ui.reemplazar(raiz,
    el('div', { class: 'marco' },
      el('header', { class: 'header' },
        el('div', { class: 'header-left' },
          el('h1', {}, 'AGENDA JOSE · HÉCTOR'),
          el('span', { id: 'subtitulo' }, F.fmtDiaLargoStr(F.hoy()))),
        el('div', { class: 'header-right' },
          el('div', { id: 'presencia', class: 'presencia' }),
          el('button', { id: 'pill-agente', class: 'pill', onclick: () => navegar('ajustes') }, 'AGENTE'),
          el('span', { id: 'pill-conexion', class: 'pill' }, ''),
          el('button', { id: 'yo', class: 'yo', title: 'Ajustes y salir', onclick: () => navegar('ajustes') }))),
      nav,
      el('main', { id: 'vista', class: 'vista' }),
      el('div', { class: 'footer' }, `PROYECTO ALPHA · AGENDA JOSE · HÉCTOR · v${CONFIG.version}${db.enDemo() ? ' · MODO DEMO' : ''}`)));
  pintarConexion();
  pintarAgente();
  pintarPresencia();
  pintarYo();
}

function pintarYo() {
  const b = document.getElementById('yo');
  if (b) ui.reemplazar(b, ui.avatar(store.usuario(), 30));
}

function pintarConexion() {
  const p = document.getElementById('pill-conexion');
  if (!p) return;
  if (db.enDemo()) { p.className = 'pill pill-rosa'; p.textContent = 'DEMO'; p.title = 'Datos de ejemplo solo en este navegador'; return; }
  const [clase, texto] = conexion === 'vivo' ? ['verde', 'EN VIVO'] : conexion === 'caido' ? ['rojo', 'SIN CONEXIÓN'] : ['ambar', 'CONECTANDO…'];
  p.className = `pill pill-${clase}`;
  p.textContent = texto;
  p.title = conexion === 'vivo' ? 'Los cambios del otro se ven al instante' : 'Reconectando: lo que hagas se guarda cuando vuelva la conexión';
}

function pintarAgente() {
  const b = document.getElementById('pill-agente');
  if (!b) return;
  const a = store.fila('agente_estado', 'setups');
  let clase = 'gris';
  let texto = 'AGENTE: SIN SEÑAL';
  let titulo = 'El agente de setups (PC de Jose Luis) aún no ha dado señales.';
  if (a) {
    const min = (Date.now() - new Date(a.latido).getTime()) / 60000;
    if (min < 3) {
      if (a.mt5_ok === false) { clase = 'ambar'; texto = 'AGENTE: MT5 SIN CONEXIÓN'; }
      else if (a.reloj_ok === false) { clase = 'ambar'; texto = 'AGENTE: RELOJ DESCUADRADO'; }
      else { clase = 'verde'; texto = 'AGENTE ●'; }
    } else if (min < 15) { clase = 'ambar'; texto = `AGENTE ${F.fmtRelativo(a.latido)}`; }
    else { clase = 'rojo'; texto = `AGENTE CAÍDO desde ${F.fmtDiaHora(a.latido)}`; }
    titulo = [
      `Último latido: ${F.fmtDiaHora(a.latido)} (${F.fmtRelativo(a.latido)})`,
      `MT5: ${a.mt5_ok ? 'conectado' : 'sin conexión'} · Reloj: ${a.reloj_ok ? 'bien' : 'descuadrado'}`,
      a.ultimo_error && `Último error: ${a.ultimo_error}`,
    ].filter(Boolean).join('\n');
  }
  b.className = `pill pill-${clase}`;
  b.textContent = texto;
  b.title = titulo;
}

function pintarPresencia() {
  const caja = document.getElementById('presencia');
  if (!caja) return;
  const yo = store.usuarioId();
  const otros = presentes.filter(p => p.usuarioId !== yo);
  ui.reemplazar(caja, otros.map(p => {
    const perfil = store.perfil(p.usuarioId) || p;
    const a = ui.avatar(perfil, 26);
    a.classList.add('en-linea');
    a.title = `${perfil.nombre} está en ${VISTAS[p.vista]?.titulo || 'la app'}`;
    return a;
  }));
}

function marcarNav(nombre) {
  document.querySelectorAll('.nav-item').forEach(a => a.classList.toggle('activo', a.dataset.vista === nombre));
}

// ---- rutas --------------------------------------------------------------------------------------
function enrutar() {
  const partes = (location.hash || '').replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  const nombre = VISTAS[partes[0]] ? partes[0] : 'semana';
  montarVista(nombre, partes.slice(1));
}

async function montarVista(nombre, params) {
  const mio = ++turno;
  try { desmontar?.(); } catch (e) { console.error(e); }
  desmontar = null;
  marcarNav(nombre);
  const cont = document.getElementById('vista');
  ui.reemplazar(cont, el('div', { class: 'cargando' }, 'Cargando…'));
  let modulo;
  try { modulo = await VISTAS[nombre].cargar(); }
  catch (e) { console.error(e); ui.reemplazar(cont, ui.vacio('Esta sección aún no está lista.')); return; }
  if (mio !== turno) return;
  ui.limpiar(cont);
  document.getElementById('subtitulo').textContent = VISTAS[nombre].titulo;
  const ctx = {
    params, navegar, store, db, ui, F, config: CONFIG,
    usuario: store.usuario(),
    titulo: t => { const s = document.getElementById('subtitulo'); if (s) s.textContent = t; },
  };
  try { desmontar = modulo.montar(cont, ctx) || null; }
  catch (e) { ui.error(e, 'Error al pintar la sección: '); }
  Promise.resolve(db.presencia.actualizar({ vista: nombre })).catch(() => {});
  window.scrollTo(0, 0);
}

// ---- errores globales y PWA ---------------------------------------------------------------------
window.addEventListener('unhandledrejection', ev => ui.error(ev.reason));
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./sw.js').catch(e => console.warn('Service worker no registrado', e));
}

arrancar();
