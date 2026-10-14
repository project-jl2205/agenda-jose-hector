// Piezas de interfaz comunes. REGLA: el texto de usuario se pinta SIEMPRE como texto
// (textContent), nunca con innerHTML. Solo los iconos (constantes de este fichero) usan innerHTML.

/**
 * Crea un elemento.  el('div', { class: 'card', onclick: fn, dataset: {id: 1} }, 'texto', otroNodo, [lista])
 * Atributos: class, style (texto u objeto), dataset, on<evento> (función), value, checked, disabled,
 * y cualquier otro como atributo HTML. Hijos: texto, nodos, arrays; null/false/undefined se ignoran.
 */
export function el(tag, attrs = {}, ...hijos) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'style' && typeof v === 'object') {
      // las variables CSS (--c) solo se ponen con setProperty
      for (const [p, val] of Object.entries(v)) {
        if (p.startsWith('--')) n.style.setProperty(p, val); else n.style[p] = val;
      }
    }
    else if (k === 'dataset') Object.assign(n.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else if (k === 'value') n.value = v;
    else if (k === 'checked') n.checked = !!v;
    else if (k === 'disabled') n.disabled = !!v;
    else if (k === 'html') throw new Error('ui.el: html no permitido (usa texto o nodos)');
    else n.setAttribute(k, v === true ? '' : v);
  }
  poner(n, hijos);
  return n;
}

function poner(n, hijos) {
  for (const h of hijos.flat(Infinity)) {
    if (h === null || h === undefined || h === false || h === '') continue;
    n.append(h instanceof Node ? h : document.createTextNode(String(h)));
  }
}

export function limpiar(nodo) { while (nodo.firstChild) nodo.firstChild.remove(); return nodo; }
export function reemplazar(nodo, ...hijos) { limpiar(nodo); poner(nodo, hijos); return nodo; }

// ---- iconos (SVG constantes) ------------------------------------------------------------------
const SVG = {
  check: '<svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  checkPeq: '<svg width="8" height="6" viewBox="0 0 8 6" fill="none"><path d="M1 3L3 5L7 1" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  chevron: '<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 4L6 8L10 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  izq: '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M9 2L4 7L9 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  der: '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M5 2L10 7L5 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  semana: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/></svg>',
  dia: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  mercado: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3v18M17 3v18"/><rect x="4.5" y="7" width="5" height="9" rx="1"/><rect x="14.5" y="5" width="5" height="7" rx="1"/></svg>',
  setups: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></svg>',
  winrate: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 20h18M6 16l4-5 3 3 5-7"/></svg>',
  ajustes: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  mas: '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 2v10M2 7h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  cerrar: '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  candado: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
  imagen: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-5-5L5 21"/></svg>',
  comentario: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
};

/** Icono SVG por nombre (solo constantes de este fichero). */
export function icono(nombre, clase = '') {
  const s = el('span', { class: `icono ${clase}`.trim(), 'aria-hidden': 'true' });
  s.innerHTML = SVG[nombre] || '';
  return s;
}

// ---- avisos (toast) -----------------------------------------------------------------------------
let tToast = null;
/** toast('Guardado') · toast('Error…', 'err') · toast('Tarea borrada', 'ok', {accion: fn, texto: 'DESHACER'}) */
export function toast(mensaje, tipo = 'ok', { accion = null, texto = 'DESHACER', ms } = {}) {
  let t = document.getElementById('toast');
  if (!t) { t = el('div', { id: 'toast', class: 'toast', role: 'status', 'aria-live': 'polite' }); document.body.append(t); }
  clearTimeout(tToast);
  reemplazar(t, el('span', {}, mensaje),
    accion && el('button', { class: 'toast-undo', onclick: () => { t.className = 'toast'; accion(); } }, texto));
  t.className = `toast ${tipo} show`;
  tToast = setTimeout(() => { t.className = 'toast'; }, ms || (accion ? 8000 : 2800));
}

/** Muestra un error de forma uniforme (y lo deja en consola). */
export function error(e, prefijo = '') {
  console.error(e);
  toast(`${prefijo}${e?.message || e}`, 'err', { ms: 6000 });
}

// ---- modal --------------------------------------------------------------------------------------
/**
 * modal({ titulo, cuerpo: Node|[Node], botones: [{ texto, tipo: 'primario'|'normal'|'peligro', accion }], ancho })
 * Si accion devuelve false (o lanza) el modal NO se cierra. Esc y clic fuera cierran.
 * Devuelve { cerrar, nodo }.
 */
export function modal({ titulo, cuerpo, botones = [], ancho = 520, alCerrar = null }) {
  const fondo = el('div', { class: 'modal-bg open' });
  const cerrar = () => { fondo.remove(); document.removeEventListener('keydown', tecla); alCerrar?.(); };
  const tecla = e => { if (e.key === 'Escape') cerrar(); };
  const pie = botones.length ? el('div', { class: 'modal-footer' }, botones.map(b => el('button', {
    class: b.tipo === 'primario' ? 'btn btn-primario' : b.tipo === 'peligro' ? 'btn btn-peligro' : 'btn',
    onclick: async ev => {
      const boton = ev.currentTarget;
      if (!b.accion) return cerrar();
      boton.disabled = true;
      try { const r = await b.accion(); if (r !== false) cerrar(); }
      catch (e) { error(e); }
      finally { boton.disabled = false; }
    },
  }, b.texto))) : null;
  const caja = el('div', { class: 'modal', style: { width: `min(${ancho}px, 96vw)` }, role: 'dialog', 'aria-modal': 'true' },
    el('div', { class: 'modal-cab' },
      el('h3', {}, titulo),
      el('button', { class: 'row-btn', title: 'Cerrar', onclick: cerrar }, icono('cerrar'))),
    el('div', { class: 'modal-cuerpo' }, cuerpo),
    pie);
  fondo.append(caja);
  fondo.addEventListener('mousedown', e => { if (e.target === fondo) cerrar(); });
  document.addEventListener('keydown', tecla);
  document.body.append(fondo);
  const primero = caja.querySelector('input, textarea, select');
  if (primero) setTimeout(() => primero.focus(), 30);
  return { cerrar, nodo: caja };
}

/** Confirmación propia (no window.confirm). Resuelve true/false. */
export function confirmar(texto, { si = 'Sí', no = 'Cancelar', peligro = false, titulo = 'Confirmar' } = {}) {
  return new Promise(res => {
    let decidido = false;
    modal({
      titulo, ancho: 420,
      cuerpo: el('p', { class: 'texto-modal' }, texto),
      botones: [
        { texto: no, accion: () => { decidido = true; res(false); } },
        { texto: si, tipo: peligro ? 'peligro' : 'primario', accion: () => { decidido = true; res(true); } },
      ],
      alCerrar: () => { if (!decidido) res(false); },
    });
  });
}

/** Pedir un texto (sustituye a window.prompt). Resuelve el texto o null. */
export function pedirTexto(titulo, valor = '', { etiqueta = '', multilinea = false, aceptar = 'Guardar' } = {}) {
  return new Promise(res => {
    let decidido = false;
    const entrada = multilinea
      ? el('textarea', { rows: 4, value: valor })
      : el('input', { type: 'text', value: valor });
    const m = modal({
      titulo, ancho: 460,
      cuerpo: campo(etiqueta, entrada),
      botones: [
        { texto: 'Cancelar', accion: () => { decidido = true; res(null); } },
        { texto: aceptar, tipo: 'primario', accion: () => { decidido = true; res(entrada.value.trim()); } },
      ],
      alCerrar: () => { if (!decidido) res(null); },
    });
    if (!multilinea) entrada.addEventListener('keydown', e => {
      if (e.key === 'Enter') { decidido = true; res(entrada.value.trim()); m.cerrar(); }
    });
  });
}

// ---- formularios --------------------------------------------------------------------------------
/** Campo con etiqueta al estilo del panel. */
export function campo(etiqueta, control, ayuda = '') {
  return el('div', { class: 'field' },
    etiqueta && el('label', {}, etiqueta),
    control,
    ayuda && el('div', { class: 'ayuda' }, ayuda));
}

export function selector(opciones, valor, attrs = {}) {
  return el('select', attrs, opciones.map(o => {
    const [v, t] = Array.isArray(o) ? o : [o, o];
    return el('option', { value: v, selected: String(v) === String(valor) ? 'selected' : null }, t);
  }));
}

// ---- piezas visuales ----------------------------------------------------------------------------
export function chip(texto, color = '#6366f1', attrs = {}) {
  return el('span', { class: 'chip', style: { '--c': color }, ...attrs }, texto);
}

export function pildoraPrioridad(prioridad) {
  return prioridad ? el('span', { class: `obj-pri pri-${prioridad}` }, prioridad) : null;
}

/** Punto con la inicial de una persona, en su color. */
export function avatar(perfil, tam = 22) {
  const nombre = perfil?.nombre || '?';
  return el('span', {
    class: 'avatar', title: nombre,
    style: { '--c': perfil?.color || '#6b6b8a', width: `${tam}px`, height: `${tam}px`, fontSize: `${Math.round(tam * 0.5)}px` },
  }, nombre.trim().charAt(0).toUpperCase());
}

export function vacio(texto) { return el('div', { class: 'vacio' }, texto); }

export function seccion(titulo, ...extra) { return el('div', { class: 'sec' }, el('span', {}, titulo), ...extra); }

/** Barra de progreso del panel. */
export function progreso(pct, color) {
  return el('div', { class: 'pt' }, el('div', { class: 'pf', style: { width: `${pct}%`, background: color } }));
}

export function debounce(fn, ms = 600) {
  let t = null;
  const f = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  f.ya = (...a) => { clearTimeout(t); fn(...a); };
  return f;
}

/** Número con los decimales justos (sin ceros inútiles), con separador español. */
export function numero(n, maxDec = 5) {
  if (n === null || n === undefined || n === '') return '—';
  return Number(n).toLocaleString('es-ES', { maximumFractionDigits: maxDec });
}

/** Porcentaje entero. */
export const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

/** Lee un fichero de imagen y lo reduce a WebP (lado mayor ≤ max). Devuelve Blob. */
export async function comprimirImagen(fichero, max = 1600, calidad = 0.85) {
  const bmp = await createImageBitmap(fichero);
  const escala = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const lienzo = document.createElement('canvas');
  lienzo.width = Math.round(bmp.width * escala);
  lienzo.height = Math.round(bmp.height * escala);
  lienzo.getContext('2d').drawImage(bmp, 0, 0, lienzo.width, lienzo.height);
  bmp.close?.();
  return await new Promise((res, rej) => lienzo.toBlob(b => (b ? res(b) : rej(new Error('No se pudo comprimir la imagen'))), 'image/webp', calidad));
}

/** Visor a pantalla completa para una imagen (url). */
export function verImagen(url, pie = '') {
  const fondo = el('div', { class: 'visor', onclick: () => fondo.remove() },
    el('img', { src: url, alt: pie || 'imagen' }),
    pie && el('div', { class: 'visor-pie' }, pie));
  document.body.append(fondo);
}
