// SETUPS de la v2 «Fluido» (tanda 4, SQL 005) = las operaciones publicadas desde el Diario del Terminal.
// Decisión de Jose Luis (7-nov): «Solo operaciones»: los setups planificados y el Winrate dejan de verse (siguen guardados).
//   · Grupos (Divisas, Cripto, Índices, Materias primas, Otros) → una carpeta por símbolo con su logo → sus operaciones.
//   · Borrar (solo quien la publicó): dos toques → papelera, con «Deshacer»; «Recuperar» las trae; volver a publicarla en el
//     Terminal también.
//   · Visor: gráfico de velas que se mueve hacia atrás (5 min de 3 días y 1 h de 15: las que guardó el Terminal) + la captura.
//   · Dibujos (solo línea, flecha, cuadro y texto): cada uno los suyos, que se guardan en Supabase; los del otro se ven y no
//     se tocan.
//   · Horas de las operaciones = las del servidor del bróker, como en MT5 y en el Terminal (se pintan en UTC).
//   · Capturas y velas en el bucket privado «capturas»: enlaces firmados de 1 h, pedidos de golpe y guardados mientras valen.
//   · Gráfico: TradingView Lightweight Charts 5.2 (vendor/, Apache 2.0), sin su logo y con el crédito en texto.
// Logos, carpetas, visor y dibujos son los de la demo Fluido (salidas/agenda-demos/6-fluido.html, revisada el 6-nov): copiados
// tal cual con un script (scratchpad generar_operaciones_js.py) y cambiados solo donde la agenda real lo pide.
import { QUIETO, EASE, DUR } from '../motor.js';

const e = s => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const PAPELERA = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>';
const fmt = (x, d = 2) => Number(x).toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d });
const $$ = s => [...document.querySelectorAll(s)];
let ST = null, DB = null, UI = null, AVISAR = () => {};
const YO = () => ST?.usuarioId();
const CLAVE_DIBPREF = 'agenda-jh-dibujos-pref';

const fNum = v => v == null ? '—' : Number(v).toLocaleString('es-ES', { maximumFractionDigits: 5 });
const fDin = (v, mon) => { try { return (v > 0 ? '+' : '') + Number(v).toLocaleString('es-ES', { style: 'currency', currency: mon || 'USD' }); } catch { return (v > 0 ? '+' : '') + fNum(v); } };
// las horas de MT5 son las del servidor del bróker: se enseñan tal cual, como en MT5 y en el gráfico
const fCuando = (t, conDia = true) => { const num = typeof t === 'number'; return new Date(num ? t * 1000 : t).toLocaleString('es-ES', { ...(conDia ? { day: 'numeric', month: 'short' } : {}), hour: '2-digit', minute: '2-digit', timeZone: num ? 'UTC' : 'Europe/Madrid' }); };

/* ---- qué es cada símbolo: grupo + logo propio ---- */
const baseSim = s => String(s || '').replace(/[._-](cash|pro|ecn|raw|std)$/i, '').replace(/[._-]?[a-z]+$/, '').toUpperCase();
const DIVISA_PAIS = { USD: 'US', EUR: 'EU', GBP: 'GB', JPY: 'JP', CHF: 'CH', AUD: 'AU', CAD: 'CA', NZD: 'NZ', CNH: 'CN', CNY: 'CN', SEK: 'SE', NOK: 'NO', DKK: 'DK', MXN: 'MX', ZAR: 'ZA', SGD: 'SG', HKD: 'HK', TRY: 'TR', PLN: 'PL' };
const CRIPTOS = { BTC: '#f7931a', ETH: '#627eea', SOL: '#9945ff', XRP: '#23292f', LTC: '#345d9d', DOGE: '#c2a633', ADA: '#0033ad', BNB: '#f3ba2f', DOT: '#e6007a', AVAX: '#e84142', LINK: '#2a5ada', BCH: '#8dc351' };
const INDICES = [[/^(US100|NAS|USTEC|NDX)/, 'US', '100'], [/^(US30|DJ|WS30|DOW)/, 'US', '30'], [/^(US500|SPX|SP500)/, 'US', '500'], [/^US2000/, 'US', '2000'],
  [/^(GER|DE30|DE40|DAX)/, 'DE', '40'], [/^(UK100|FTSE)/, 'GB', '100'], [/^(JP225|JPN225|NIK)/, 'JP', '225'], [/^(FRA40|FR40|CAC)/, 'FR', '40'],
  [/^(EU50|STOXX|ESTX)/, 'EU', '50'], [/^(AUS200|AU200)/, 'AU', '200'], [/^(HK50|HSI)/, 'HK', '50'], [/^(ES35|SPA35)/, 'ES', '35']];
const GRUPOS_OPS = [['divisas', 'Divisas'], ['cripto', 'Cripto'], ['indices', 'Índices'], ['materias', 'Materias primas'], ['otros', 'Otros']];
const nombreGrupo = g => (GRUPOS_OPS.find(x => x[0] === g) || [, 'Otros'])[1];
function infoSim(s) {
  const b = baseSim(s);
  if (/^(XAU|GOLD)/.test(b)) return { b, g: 'materias', tipo: 'oro', c: '#e6b422' };
  if (/^(XAG|SILVER)/.test(b)) return { b, g: 'materias', tipo: 'plata', c: '#b8bcc6' };
  if (/^(XPT|XPD)/.test(b)) return { b, g: 'materias', tipo: 'platino', c: '#9aa3ad' };
  if (/(OIL|WTI|BRENT|XTI|XBR)/.test(b)) return { b, g: 'materias', tipo: 'petroleo', c: '#ffb000' };
  if (/(NGAS|NATGAS|XNG)/.test(b)) return { b, g: 'materias', tipo: 'gas', c: '#0a84ff' };
  const cr = Object.keys(CRIPTOS).sort((x, y) => y.length - x.length).find(k => b.startsWith(k));
  if (cr) return { b, g: 'cripto', tipo: cr, c: CRIPTOS[cr] };
  if (/^[A-Z]{6}$/.test(b) && DIVISA_PAIS[b.slice(0, 3)] && DIVISA_PAIS[b.slice(3)]) return { b, g: 'divisas', a: b.slice(0, 3), q: b.slice(3), c: COLOR_PAIS[DIVISA_PAIS[b.slice(0, 3)]] };
  const ix = INDICES.find(([re]) => re.test(b)); if (ix) return { b, g: 'indices', pais: ix[1], num: ix[2], c: COLOR_PAIS[ix[1]] };
  let h = 0; for (const ch of b) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return { b, g: 'otros', c: `hsl(${h} 60% 50%)`, hue: h };
}
const COLOR_PAIS = { US: '#3c6be0', EU: '#2f5bd3', GB: '#c8102e', JP: '#e0334f', CH: '#e2382b', AU: '#2a55c9', CA: '#e2382b', NZ: '#2a4fb0', CN: '#de2910', SE: '#2b7fc0', NO: '#c8243a', DK: '#c8102e', MX: '#178a5a', ZA: '#1f9e5a', SG: '#ef3340', HK: '#de2910', TR: '#e30a17', PL: '#dc143c', DE: '#e8b500', FR: '#3b5fd9', ES: '#e8a800' };
// banderas en una caja de 40×40 (se recortan en círculo)
const BANDERA = {
  US: '<rect width="40" height="40" fill="#fff"/>' + [0, 2, 4, 6, 8, 10, 12].map(k => `<rect y="${(k * 40 / 13).toFixed(2)}" width="40" height="3.08" fill="#b22234"/>`).join('') + '<rect width="20" height="21.5" fill="#3c3b6e"/>' + [[5, 5], [10, 5], [15, 5], [7.5, 10.5], [12.5, 10.5], [5, 16], [10, 16], [15, 16]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.1" fill="#fff"/>`).join(''),
  EU: '<rect width="40" height="40" fill="#003399"/>' + Array.from({ length: 12 }, (_, i) => `<circle cx="${(20 + 11 * Math.cos(i * Math.PI / 6)).toFixed(2)}" cy="${(20 + 11 * Math.sin(i * Math.PI / 6)).toFixed(2)}" r="1.9" fill="#ffcc00"/>`).join(''),
  GB: '<rect width="40" height="40" fill="#012169"/><path d="M0 0L40 40M40 0L0 40" stroke="#fff" stroke-width="8"/><path d="M0 0L40 40M40 0L0 40" stroke="#c8102e" stroke-width="2.6"/><path d="M20 0V40M0 20H40" stroke="#fff" stroke-width="12"/><path d="M20 0V40M0 20H40" stroke="#c8102e" stroke-width="7"/>',
  JP: '<rect width="40" height="40" fill="#fff"/><circle cx="20" cy="20" r="10" fill="#bc002d"/>',
  CH: '<rect width="40" height="40" fill="#d52b1e"/><rect x="16" y="8" width="8" height="24" fill="#fff"/><rect x="8" y="16" width="24" height="8" fill="#fff"/>',
  AU: '<rect width="40" height="40" fill="#00247d"/><g transform="scale(.5)"><path d="M0 0L40 40M40 0L0 40" stroke="#fff" stroke-width="8"/><path d="M0 0L40 40M40 0L0 40" stroke="#c8102e" stroke-width="2.6"/><path d="M20 0V40M0 20H40" stroke="#fff" stroke-width="12"/><path d="M20 0V40M0 20H40" stroke="#c8102e" stroke-width="7"/></g>' + [[29, 11, 1.6], [34, 21, 1.6], [27, 24, 1.3], [30, 32, 1.6], [11, 30, 3]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff"/>`).join(''),
  NZ: '<rect width="40" height="40" fill="#00247d"/><g transform="scale(.5)"><path d="M0 0L40 40M40 0L0 40" stroke="#fff" stroke-width="8"/><path d="M0 0L40 40M40 0L0 40" stroke="#c8102e" stroke-width="2.6"/><path d="M20 0V40M0 20H40" stroke="#fff" stroke-width="12"/><path d="M20 0V40M0 20H40" stroke="#c8102e" stroke-width="7"/></g>' + [[29, 11], [34, 20], [26, 22], [29, 31]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.9" fill="#c8102e" stroke="#fff" stroke-width=".8"/>`).join(''),
  CA: '<rect width="40" height="40" fill="#fff"/><rect width="10" height="40" fill="#d52b1e"/><rect x="30" width="10" height="40" fill="#d52b1e"/><path d="M20 8l2 6 4-2-1 6 4-1-2 5h-5v8h-4v-8h-5l-2-5 4 1-1-6 4 2z" fill="#d52b1e"/>',
  CN: '<rect width="40" height="40" fill="#de2910"/><path d="M11 5l2.1 6.5H20l-5.5 4 2.1 6.5L11 18l-5.6 4 2.1-6.5-5.5-4h6.9z" fill="#ffde00"/>',
  SE: '<rect width="40" height="40" fill="#006aa7"/><rect x="12" width="6" height="40" fill="#fecc00"/><rect y="17" width="40" height="6" fill="#fecc00"/>',
  NO: '<rect width="40" height="40" fill="#ba0c2f"/><rect x="11" width="10" height="40" fill="#fff"/><rect y="15" width="40" height="10" fill="#fff"/><rect x="13.5" width="5" height="40" fill="#00205b"/><rect y="17.5" width="40" height="5" fill="#00205b"/>',
  DK: '<rect width="40" height="40" fill="#c8102e"/><rect x="12" width="6" height="40" fill="#fff"/><rect y="17" width="40" height="6" fill="#fff"/>',
  MX: '<rect width="14" height="40" fill="#006847"/><rect x="14" width="12" height="40" fill="#fff"/><rect x="26" width="14" height="40" fill="#ce1126"/><circle cx="20" cy="20" r="3" fill="#8c5a2b"/>',
  ZA: '<rect width="40" height="20" fill="#e03c31"/><rect y="20" width="40" height="20" fill="#001489"/><path d="M0 0L20 20L0 40" fill="#fff"/><path d="M0 4L16 20L0 36" fill="#007749"/><rect x="14" y="14" width="26" height="12" fill="#fff"/><rect x="14" y="16" width="26" height="8" fill="#007749"/><path d="M0 8L12 20L0 32" fill="#ffb612"/><path d="M0 11L9 20L0 29" fill="#000"/>',
  SG: '<rect width="40" height="20" fill="#ef3340"/><rect y="20" width="40" height="20" fill="#fff"/><circle cx="12" cy="10" r="5" fill="#fff"/><circle cx="14" cy="10" r="4.5" fill="#ef3340"/>',
  HK: '<rect width="40" height="40" fill="#de2910"/>' + Array.from({ length: 5 }, (_, i) => `<ellipse cx="${(20 + 6 * Math.cos(i * 1.2566 - 1.57)).toFixed(2)}" cy="${(20 + 6 * Math.sin(i * 1.2566 - 1.57)).toFixed(2)}" rx="2.6" ry="4.4" transform="rotate(${i * 72} ${(20 + 6 * Math.cos(i * 1.2566 - 1.57)).toFixed(2)} ${(20 + 6 * Math.sin(i * 1.2566 - 1.57)).toFixed(2)})" fill="#fff"/>`).join(''),
  TR: '<rect width="40" height="40" fill="#e30a17"/><circle cx="17" cy="20" r="10" fill="#fff"/><circle cx="19.5" cy="20" r="8" fill="#e30a17"/><circle cx="28" cy="20" r="2.6" fill="#fff"/>',
  PL: '<rect width="40" height="20" fill="#fff"/><rect y="20" width="40" height="20" fill="#dc143c"/>',
  DE: '<rect width="40" height="13.4" fill="#000"/><rect y="13.3" width="40" height="13.4" fill="#dd0000"/><rect y="26.6" width="40" height="13.4" fill="#ffce00"/>',
  FR: '<rect width="13.4" height="40" fill="#0055a4"/><rect x="13.3" width="13.4" height="40" fill="#fff"/><rect x="26.6" width="13.4" height="40" fill="#ef4135"/>',
  ES: '<rect width="40" height="40" fill="#aa151b"/><rect y="10" width="40" height="20" fill="#f1bf00"/>',
};
let nLogo = 0;
function circuloBandera(p, cx, cy, r) {
  const id = 'lb' + (++nLogo);
  return `<svg x="${cx - r}" y="${cy - r}" width="${2 * r}" height="${2 * r}" viewBox="0 0 40 40"><defs><clipPath id="${id}"><circle cx="20" cy="20" r="20"/></clipPath></defs><g clip-path="url(#${id})">${BANDERA[p] || `<rect width="40" height="40" fill="#555"/>`}</g><circle cx="20" cy="20" r="19.4" fill="none" stroke="#fff" stroke-opacity=".18" stroke-width="1.2"/></svg>`;
}
const GLIFO_CRIPTO = {
  BTC: '<text x="24" y="32.5" text-anchor="middle" font-size="25" font-weight="800" fill="#fff" transform="rotate(14 24 24)" font-family="Inter,system-ui,sans-serif">₿</text>',
  ETH: '<path d="M24 8l10 16.5-10 6-10-6z" fill="#fff"/><path d="M24 8v22.5l-10-6z" fill="#fff" opacity=".7"/><path d="M24 32.5l10-6L24 41l-10-14.5z" fill="#fff" opacity=".85"/>',
  SOL: '<path d="M16.5 14.5h19l-4 4.2h-19z M12.5 22h19l4 4.2h-19z M16.5 29.5h19l-4 4.2h-19z" fill="url(#GRAD)"/>',
  XRP: '<path d="M14 14l6.5 6.5a5 5 0 0 0 7 0L34 14M14 34l6.5-6.5a5 5 0 0 1 7 0L34 34" stroke="#fff" stroke-width="3.2" fill="none" stroke-linecap="round"/>',
};
function logoSim(s, tam = 44) {
  const i = infoSim(s), id = 'lg' + (++nLogo);
  let dentro;
  if (i.g === 'divisas') dentro = circuloBandera(DIVISA_PAIS[i.a], 18, 18, 16) + `<circle cx="32" cy="32" r="14.2" fill="var(--card)"/>` + circuloBandera(DIVISA_PAIS[i.q], 32, 32, 12.5);
  else if (i.g === 'indices') dentro = circuloBandera(i.pais, 24, 24, 22) + `<rect x="${24 - (i.num.length * 4 + 6)}" y="29" width="${i.num.length * 8 + 12}" height="15" rx="7.5" fill="#000" fill-opacity=".82"/><text x="24" y="40.3" text-anchor="middle" font-size="11" font-weight="800" fill="#fff" font-family="Inter,system-ui,sans-serif">${i.num}</text>`;
  else if (i.g === 'cripto') {
    const fondo = i.tipo === 'SOL' ? '#0d0d12' : i.c;
    const gl = (GLIFO_CRIPTO[i.tipo] || `<text x="24" y="30.5" text-anchor="middle" font-size="${i.tipo.length > 3 ? 12 : 15}" font-weight="800" fill="#fff" font-family="Inter,system-ui,sans-serif">${i.tipo}</text>`).replace('GRAD', id);
    dentro = `<defs><linearGradient id="${id}" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#9945ff"/><stop offset="1" stop-color="#14f195"/></linearGradient></defs><circle cx="24" cy="24" r="22" fill="${fondo}"/>${gl}`;
  } else if (i.g === 'materias') {
    const met = { oro: ['#ffe9a3', '#c8920f', '#8a6508'], plata: ['#ffffff', '#a9adb6', '#5d6068'], platino: ['#eef0f2', '#8f979f', '#50565c'] }[i.tipo];
    if (met) dentro = `<defs><radialGradient id="${id}" cx=".35" cy=".3" r=".9"><stop offset="0" stop-color="${met[0]}"/><stop offset="1" stop-color="${met[1]}"/></radialGradient></defs><circle cx="24" cy="24" r="22" fill="url(#${id})"/><path d="M11 31l4.5-10h17L37 31z" fill="${met[0]}" stroke="${met[2]}" stroke-width="1.6" stroke-linejoin="round"/><path d="M15.5 21l2-4.5h13l2 4.5" fill="${met[0]}" stroke="${met[2]}" stroke-width="1.6" stroke-linejoin="round" opacity=".8"/><text x="24" y="29.3" text-anchor="middle" font-size="6.5" font-weight="800" fill="${met[2]}" font-family="Inter,system-ui,sans-serif">${i.b.slice(0, 3)}</text>`;
    else if (i.tipo === 'petroleo') dentro = `<circle cx="24" cy="24" r="22" fill="#ffb000"/><path d="M24 9c0 0-10 12.5-10 19.5a10 10 0 0 0 20 0C34 21.5 24 9 24 9z" fill="#111"/><path d="M19 28a5 5 0 0 0 4 5" stroke="#fff" stroke-opacity=".5" stroke-width="2" fill="none" stroke-linecap="round"/>`;
    else dentro = `<circle cx="24" cy="24" r="22" fill="#0a84ff"/><path d="M24 9c3 6 9 9 9 17a9 9 0 0 1-18 0c0-4 2-6 4-8 0 3 1 5 3 6 0-6 2-11 2-15z" fill="#fff"/>`;
  } else dentro = `<rect x="2" y="2" width="44" height="44" rx="14" fill="hsl(${i.hue} 55% 42%)"/><text x="24" y="29" text-anchor="middle" font-size="13" font-weight="800" fill="#fff" font-family="Inter,system-ui,sans-serif">${e(i.b.slice(0, 3))}</text>`;
  return `<span class="logo" style="--t:${tam}px" title="${e(i.b)}"><svg viewBox="0 0 48 48" aria-hidden="true">${dentro}</svg></span>`;
}


/* ---- las operaciones, del almacén (SQL 005) con los nombres de la demo ---- */
const aOp = f => ({ k: f.id, s: f.simbolo, dir: f.direccion, t_entrada: f.t_entrada, t_salida: f.t_salida, entrada: f.entrada, salida: f.salida,
  volumen: f.volumen, sl0: f.sl0, tp0: f.tp0, r: f.r, resultado: f.resultado, moneda: f.moneda, motivo: f.motivo, porque: f.porque,
  etiquetas: f.etiquetas || [], temporalidad: f.temporalidad, captura: f.captura, velas: f.velas, autor: f.autor, publicada: f.publicada_en });
const OPS = () => ST.vivas('operaciones').map(aOp).sort((a, b) => (b.t_salida || b.t_entrada || 0) - (a.t_salida || a.t_entrada || 0));
const borradasMias = () => ST.filas('operaciones', f => !!f.borrado_en && f.autor === YO());
const nombreDe = id => ST.perfiles().find(p => p.id === id)?.nombre || '';
const otro = () => ST.perfiles().find(p => p.id !== YO())?.nombre || 'el otro';
// de quién es cada operación (9-nov, lo pidió Jose: ahora también publica Héctor): su inicial y su color, como en el resto
const perfilDe = id => ST.perfiles().find(p => p.id === id);
const colorDe = id => { const c = perfilDe(id)?.color; return /^#[0-9a-f]{6}$/i.test(c || '') ? c : '#6b6b8a'; };
const inicialDe = id => (nombreDe(id) || '?').trim().charAt(0).toUpperCase();
const autorHTML = (id, cls = 'op-autor') => `<span class="${cls}" style="--c:${colorDe(id)}"><i>${e(inicialDe(id))}</i>${e(nombreDe(id) || '—')}</span>`;
const CLAVE_QUIEN = 'agenda-jh-ops-quien';                 // filtro de arriba, por aparato ('' = las de los dos)
let quien = (() => { try { return localStorage.getItem(CLAVE_QUIEN) || ''; } catch { return ''; } })();
const opsVistas = () => OPS().filter(o => !quien || o.autor === quien);

/* ---- enlaces firmados de las capturas y las velas (1 h; se piden de golpe y se guardan mientras valen) ---- */
const URLS = new Map();
async function urlsDe(rutas) {
  const ya = Date.now(), faltan = [...new Set(rutas.filter(r => r && !(URLS.get(r)?.hasta > ya)))];
  if (faltan.length) {
    try { const m = await DB.archivos.urls(faltan, 3600); for (const [r, u] of Object.entries(m)) URLS.set(r, { url: u, hasta: ya + 55 * 60000 }); }
    catch { /* sin red: se queda sin imagen y se reintenta al repintar */ }
  }
  return Object.fromEntries(rutas.map(r => [r, URLS.get(r)?.url]));
}
const srcDe = r => { const c = URLS.get(r); return c && c.hasta > Date.now() ? ` src="${e(c.url)}"` : ''; };
const imgOp = (o, alt = '') => `<img data-ruta="${e(o.captura)}"${srcDe(o.captura)} alt="${e(alt)}" loading="lazy">`;
function ponerImagenes(raiz) {
  const imgs = [...raiz.querySelectorAll('img[data-ruta]')].filter(i => !i.getAttribute('src'));
  if (imgs.length) urlsDe(imgs.map(i => i.dataset.ruta)).then(m => imgs.forEach(i => { if (m[i.dataset.ruta] && i.isConnected) i.src = m[i.dataset.ruta]; }));
}

/* ---- dibujos: del almacén al formato de la demo ({id, tipo, p:[{t,p}], c, txt}) y de vuelta ---- */
const desdeFila = f => ({ id: String(f.id), tipo: f.tipo, p: (Array.isArray(f.puntos) ? f.puntos : []).map(q => ({ t: +q?.t, p: +q?.p })),
  c: colorOk(f.color) ? f.color : '#ffd60a', ...(f.tipo === 'texto' ? { txt: String(f.texto || '').slice(0, 140) } : {}) });
const dibValido = d => TIPOS_DIB.includes(d.tipo) && d.p.length === (d.tipo === 'texto' ? 1 : 2) && d.p.every(q => isFinite(q.t) && isFinite(q.p));
const dibsDe = (k, mios) => ST.vivas('operacion_dibujos', f => f.operacion_id === k && (f.autor === YO()) === mios)
  .sort((a, b) => String(a.creado_en || '').localeCompare(String(b.creado_en || ''))).map(desdeFila).filter(dibValido);
const misDibs = k => dibsDe(k, true), ajenosDe = k => dibsDe(k, false);
const normalDib = d => ({ id: d.id, tipo: d.tipo, p: d.p.map(q => ({ t: q.t, p: q.p })), c: d.c, ...(d.tipo === 'texto' ? { txt: d.txt || '' } : {}) });
const mapaDibs = L => new Map(L.map(d => [d.id, JSON.stringify(normalDib(d))]));
const firmaDibs = L => JSON.stringify([...mapaDibs(L)].sort());
// guarda la diferencia con lo último guardado: nuevos o cambiados → upsert; los que ya no están → papelera (nada se borra)
function guardarDibs(k, lista, guardado) {
  const ahoraM = mapaDibs(lista), ya = new Date().toISOString(), fallo = err => UI.error(err);
  for (const [id, j] of ahoraM) {
    if (guardado.get(id) === j) continue;
    const d = JSON.parse(j);
    ST.upsert('operacion_dibujos', { id, operacion_id: k, autor: YO(), tipo: d.tipo, puntos: d.p, color: d.c, texto: d.tipo === 'texto' ? d.txt : null,
      borrado_en: null, ...(guardado.has(id) ? {} : { creado_en: ya }) }, 'id').catch(fallo);
  }
  for (const id of guardado.keys()) if (!ahoraM.has(id)) ST.actualizar('operacion_dibujos', { id }, { borrado_en: ya }).catch(fallo);
  return ahoraM;
}
const nDibujos = k => ST.vivas('operacion_dibujos', f => f.operacion_id === k).length;
function insigniaDib(k) { const b = document.querySelector(`.op[data-op="${CSS.escape(k)}"] .op-ndib`); if (b) { const n = nDibujos(k); b.textContent = n ? `· ✎ ${n}` : ''; } }

const TF_SEG = { M5: 300, M15: 900, H1: 3600 };
function velasTF(V, tf) {
  if (tf === 'H1') return V.H1 || [];
  if (tf === 'M5') return V.M5 || [];
  const out = []; let cur = null;                       // M15 sale de juntar las de 5 min
  for (const [t, o, h, l, c] of V.M5 || []) {
    const b = Math.floor(t / 900) * 900;
    if (!cur || cur[0] !== b) { cur && out.push(cur); cur = [b, o, h, l, c]; } else { cur[2] = Math.max(cur[2], h); cur[3] = Math.min(cur[3], l); cur[4] = c; }
  }
  cur && out.push(cur); return out;
}
function cerrarVisorOp(ya) {
  const v = document.querySelector(ya ? '.visor-op' : '.visor-op:not(.cerrando)'); if (!v) return;
  if (!v._fin) {
    v._dib?.cerrar(); v._dib = null;                    // un texto a medio escribir se guarda
    v._fin = () => { if (v._acabado) return; v._acabado = true; v._quitar?.(); const c = v._chart; v._chart = null; try { c?.remove(); } catch { } v.remove(); };
  }
  if (ya || QUIETO) return v._fin();
  if (v.classList.contains('cerrando')) return;        // ya se está yendo: un segundo Esc no lo cierra otra vez
  v.classList.add('cerrando'); v.style.pointerEvents = 'none';
  v.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180, fill: 'forwards' }).onfinish = v._fin;
}
const TIPOS_DIB = ['linea', 'flecha', 'cuadro', 'texto'];
let nDib = 0;
const idDib = () => Date.now().toString(36) + (nDib++).toString(36);
const colorOk = c => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c);   // como el CHECK del SQL 005
const prefDib = { c: '#ffd60a', abierta: !matchMedia('(max-width: 820px), (pointer: coarse)').matches };
try { const g = JSON.parse(localStorage.getItem(CLAVE_DIBPREF)) || {}; if (colorOk(g.c)) prefDib.c = g.c; if (typeof g.abierta === 'boolean') prefDib.abierta = g.abierta; } catch { }
const guardarPrefDib = () => { try { localStorage.setItem(CLAVE_DIBPREF, JSON.stringify(prefDib)); } catch { } };
const COLS_DIB = ['#f5f5f7', '#ffd60a', '#ff9f0a', '#ff453a', '#30d158', '#64d2ff', '#0a84ff', '#bf5af2'];
const HERR_DIB = { mover: ['Seleccionar y mover', 'V'], linea: ['Línea (cualquier dirección)', 'L'], flecha: ['Flecha', 'F'], cuadro: ['Cuadro', 'C'], texto: ['Texto', 'T'] };
const icoDib = d => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICO_DIB = {
  lapiz: icoDib('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M14 6l4 4"/>'),
  mover: icoDib('<path d="M6 3.5l12 7.2-5.3 1.4-2.6 5.2z"/>'),
  linea: icoDib('<path d="M5.5 18.5l13-13"/><circle cx="5.5" cy="18.5" r="1.8" fill="currentColor" stroke="none"/><circle cx="18.5" cy="5.5" r="1.8" fill="currentColor" stroke="none"/>'),
  flecha: icoDib('<path d="M5 19L18 6"/><path d="M10 5.5h8.5V14"/>'),
  cuadro: icoDib('<rect x="4" y="6" width="16" height="12" rx="2.5"/>'),
  texto: icoDib('<path d="M5 7V5h14v2M12 5v14M9 19h6"/>'),
  deshacer: icoDib('<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>'),
};
let medidor;
const anchoTexto = s => { medidor ||= document.createElement('canvas').getContext('2d'); medidor.font = "700 13px Inter, system-ui, sans-serif"; return medidor.measureText(s).width; };
const r1 = n => Math.round(n * 10) / 10;
function montarDibujos(v, k, ch, se, velas, segTF, dg) {
  const lienzo = v.querySelector('.vo-lienzo'), ts = ch.timeScale(), tactil = matchMedia('(pointer: coarse)').matches;
  let lista = misDibs(k), ajenos = ajenosDe(k), guardado = mapaDibs(lista);   // del almacén: los míos se editan; los del otro solo se ven
  let herr = 'mover', sel = null, temp = null, espera = false, pulsado = null, arr = null, editando = null, hist = [], rehacer = [];
  let idTrazo = null, pellizco = null; const dedos = new Map();
  lienzo.insertAdjacentHTML('beforeend', `<svg class="dib-capa" xmlns="http://www.w3.org/2000/svg"><g class="dib-g"></g><g class="dib-asas"></g><rect class="dib-atrapa" width="100%" height="100%"/></svg>
    <div class="dib-pal ${prefDib.abierta ? 'abierta' : ''}" role="toolbar" aria-label="Dibujos sobre el gráfico">
      <button class="dp-b dp-lapiz" data-dlapiz="1" aria-expanded="${prefDib.abierta}" title="${prefDib.abierta ? 'Esconder las herramientas' : 'Dibujar'}" aria-label="Dibujar">${ICO_DIB.lapiz}</button>
      <div class="dp-herr"><div class="dp-in">
        ${Object.entries(HERR_DIB).map(([h, [n, t]], i) => `<button class="dp-b ${h === 'mover' ? 'on' : ''}" data-dherr="${h}" style="--n:${i}" title="${n} · ${t}" aria-label="${n}">${ICO_DIB[h]}</button>`).join('')}
        <i class="dp-sep" style="--n:5"></i>
        <button class="dp-b dp-col" data-dcolor="1" style="--n:6" title="Color" aria-label="Color"><i></i></button>
        <button class="dp-b" data-dundo="1" style="--n:7" title="Deshacer · Ctrl+Z" aria-label="Deshacer">${ICO_DIB.deshacer}</button>
        <button class="dp-b dp-del" data-dborrar="1" style="--n:8" aria-label="Borrar">${PAPELERA}</button>
      </div></div>
      <div class="dp-cols" hidden>${COLS_DIB.map(c => `<button class="sw" data-dcol="${c}" style="--c:${c}" aria-label="Color ${c}"></button>`).join('')}</div>
      <div class="dp-aviso" hidden>Otra vez y se borran todos</div>
    </div>`);
  const svg = lienzo.querySelector('.dib-capa'), gF = svg.querySelector('.dib-g'), gA = svg.querySelector('.dib-asas');
  const pal = lienzo.querySelector('.dib-pal'), cols = pal.querySelector('.dp-cols'), aviso = pal.querySelector('.dp-aviso'), del = pal.querySelector('[data-dborrar]');

  /* geometría: hora del servidor ↔ x (la librería solo sitúa posiciones enteras: se interpola entre dos velas), precio ↔ y */
  const xLog = l => { const a = Math.floor(l), xa = ts.logicalToCoordinate(a), xb = ts.logicalToCoordinate(a + 1); return xa == null || xb == null ? NaN : xa + (l - a) * (xb - xa); };
  const logDeT = t => { const L = velas(), n = L.length, s = segTF(); if (!n) return NaN;
    if (t <= L[0][0]) return (t - L[0][0]) / s;
    if (t >= L[n - 1][0]) return n - 1 + (t - L[n - 1][0]) / s;
    let lo = 0, hi = n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (L[m][0] <= t) lo = m; else hi = m; }
    return lo + (t - L[lo][0]) / (L[hi][0] - L[lo][0]); };
  const tDeLog = l => { const L = velas(), n = L.length, s = segTF(); if (!n || !isFinite(l)) return NaN;
    if (l <= 0) return L[0][0] + l * s;
    if (l >= n - 1) return L[n - 1][0] + (l - (n - 1)) * s;
    const a = Math.floor(l); return L[a][0] + (l - a) * (L[a + 1][0] - L[a][0]); };
  const logDeX = x => { const x0 = ts.logicalToCoordinate(0), x1 = ts.logicalToCoordinate(1); return x0 == null || x1 == null || x1 === x0 ? NaN : (x - x0) / (x1 - x0); };
  const X = t => xLog(logDeT(t)), Y = p => { const y = se.priceToCoordinate(p); return y == null ? NaN : y; };
  const punto = (x, y) => { const t = tDeLog(logDeX(x)), p = se.coordinateToPrice(y); return { t: Math.round(t), p: p == null ? NaN : +p.toFixed(dg + 2) }; };
  const valido = q => isFinite(q.t) && isFinite(q.p);
  const buscar = id => id ? lista.find(d => d.id === id) : null;
  const copia = () => JSON.stringify(lista, (key, val) => key === '_oculto' ? undefined : val);
  const plano = d => { if (d.tipo !== 'cuadro') return false; const [a, b] = d.p.map(q => [X(q.t), Y(q.p)]); return !(Math.abs(b[0] - a[0]) >= 4 && Math.abs(b[1] - a[1]) >= 4); };

  /* pintado */
  function figura(d, esSel, ajeno = false) {
    if (d._oculto) return '';
    const S = d.p.map(q => [X(q.t), Y(q.p)]); if (S.some(([a, b]) => !isFinite(a) || !isFinite(b))) return '';
    const c = colorOk(d.c) ? d.c : '#ffd60a', id = e(d.id);
    if (d.tipo === 'texto') {
      const [x, y] = S[0], w = anchoTexto(d.txt || '') + 16;
      return `<g class="dib${ajeno ? ' ajeno' : ''} dib-t" ${ajeno ? 'data-ajeno="1"' : `data-dib="${id}"`}><rect class="dt-fondo" x="${r1(x - 8)}" y="${r1(y - 12)}" width="${r1(w)}" height="24" rx="7"${esSel ? ` stroke="${c}" stroke-width="1.5" stroke-dasharray="4 3"` : ''}/><text x="${r1(x)}" y="${r1(y)}" fill="${c}" dominant-baseline="central">${e(d.txt || '')}</text></g>`;
    }
    const [[x1, y1], [x2, y2]] = S;
    if (d.tipo === 'cuadro') return `<g class="dib${ajeno ? ' ajeno' : ''}" ${ajeno ? 'data-ajeno="1"' : `data-dib="${id}"`}><rect x="${r1(Math.min(x1, x2))}" y="${r1(Math.min(y1, y2))}" width="${r1(Math.abs(x2 - x1))}" height="${r1(Math.abs(y2 - y1))}" rx="2" fill="${c}" fill-opacity="${esSel ? .2 : .13}" stroke="${c}" stroke-width="${esSel ? 2 : 1.5}"/></g>`;
    let punta = '', xf = x2, yf = y2;
    const L = Math.hypot(x2 - x1, y2 - y1);
    if (d.tipo === 'flecha' && L > 1) {
      const an = Math.atan2(y2 - y1, x2 - x1), hl = Math.min(15, L * .6), ab = .42;
      punta = `<path d="M${r1(x2)} ${r1(y2)}L${r1(x2 - hl * Math.cos(an - ab))} ${r1(y2 - hl * Math.sin(an - ab))}L${r1(x2 - hl * Math.cos(an + ab))} ${r1(y2 - hl * Math.sin(an + ab))}Z" fill="${c}"/>`;
      xf = x2 - hl * .75 * Math.cos(an); yf = y2 - hl * .75 * Math.sin(an);
    }
    return `<g class="dib${ajeno ? ' ajeno' : ''}" ${ajeno ? 'data-ajeno="1"' : `data-dib="${id}"`}><line class="dh" x1="${r1(x1)}" y1="${r1(y1)}" x2="${r1(x2)}" y2="${r1(y2)}" stroke-width="${tactil ? 30 : 14}"/>` +
      `<line x1="${r1(x1)}" y1="${r1(y1)}" x2="${r1(xf)}" y2="${r1(yf)}" stroke="${c}" stroke-width="${esSel ? 2.8 : 2}" stroke-linecap="round"/>${punta}</g>`;
  }
  // asas del seleccionado: extremos de la línea/flecha; las 4 esquinas del cuadro (0 = punto 1, 2 = punto 2)
  const esquinas = d => { if (d.tipo === 'texto') return []; const [a, b] = d.p.map(q => [X(q.t), Y(q.p)]);
    return d.tipo === 'cuadro' ? [a, [b[0], a[1]], b, [a[0], b[1]]] : [a, b]; };
  const asasHTML = d => { const c = colorOk(d.c) ? d.c : '#ffd60a';
    return esquinas(d).map(([x, y], i) => isFinite(x) && isFinite(y) ? `<g class="dib-asa" data-asa="${i}"><circle cx="${r1(x)}" cy="${r1(y)}" r="${tactil ? 18 : 9}" fill="transparent"/><circle cx="${r1(x)}" cy="${r1(y)}" r="${tactil ? 6.5 : 5}" fill="#fff" stroke="${c}" stroke-width="2"/></g>` : '').join(''); };
  function ponerAsa(d, i, q) {
    if (d.tipo !== 'cuadro') { d.p[i] = q; return; }
    const [a, b] = d.p;
    if (i === 0) { a.t = q.t; a.p = q.p; } else if (i === 1) { b.t = q.t; a.p = q.p; } else if (i === 2) { b.t = q.t; b.p = q.p; } else { a.t = q.t; b.p = q.p; }
  }
  let tam = '';
  function pintar() {
    if (!v.isConnected) return;
    const sz = ch.paneSize(), t2 = sz.width + 'x' + sz.height;
    if (t2 !== tam) { tam = t2; svg.setAttribute('width', sz.width); svg.setAttribute('height', sz.height); }
    gF.innerHTML = ajenos.map(d => figura(d, false, true)).join('') + lista.map(d => figura(d, d.id === sel)).join('') + (temp ? figura(temp, false) : '');
    const ds = buscar(sel); gA.innerHTML = ds && herr === 'mover' && !editando ? asasHTML(ds) : '';
    if (editando) colocarEditor();
  }
  let pedido = false;
  const pedirPintar = () => { if (pedido) return; pedido = true; queueMicrotask(() => { pedido = false; pintar(); }); };
  try { se.attachPrimitive({ updateAllViews: pedirPintar, paneViews: () => [] }); } catch { }
  ts.subscribeVisibleLogicalRangeChange(pedirPintar);

  /* ratón y dedos */
  const pos = ev => { const r = svg.getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top]; };
  const capturar = ev => { svg.classList.add('activo'); try { svg.setPointerCapture(ev.pointerId); } catch { } };
  const soltar = ev => { svg.classList.remove('activo'); try { svg.releasePointerCapture(ev.pointerId); } catch { } };
  const desarmar = () => { del.classList.remove('seguro'); clearTimeout(del._t); aviso.hidden = true; };
  // lo que estuviera a medio hacer (trazo, arrastre, clic-clic) se descarta; la capa deja de tapar el gráfico
  function cancelarTrazo() {
    if (arr) { if (arr.movido) lista = JSON.parse(arr.antes); arr = null; }
    temp = null; espera = false; pulsado = null; idTrazo = null; svg.classList.remove('activo');
  }
  const cruz = (x, y) => { if (tactil) return; const L = velas(), i = Math.round(logDeX(x)); if (!L.length || !isFinite(i)) return;
    const p = se.coordinateToPrice(y); if (p != null) try { ch.setCrosshairPosition(p, L[Math.max(0, Math.min(L.length - 1, i))][0], se); } catch { } };
  function restringir(x, y, shift) {   // con Mayús, la línea y la flecha van en pasos de 45° (horizontal = mismo precio)
    if (!shift || !temp || temp.tipo === 'cuadro') return punto(x, y);
    const x0 = X(temp.p[0].t), y0 = Y(temp.p[0].p), paso = Math.PI / 4, an = Math.round(Math.atan2(y - y0, x - x0) / paso) * paso, L = Math.hypot(x - x0, y - y0);
    const q = punto(x0 + L * Math.cos(an), y0 + L * Math.sin(an));
    if (Math.abs(Math.sin(an)) < 1e-6) q.p = temp.p[0].p;
    if (Math.abs(Math.cos(an)) < 1e-6) q.t = temp.p[0].t;
    return q;
  }
  // dos dedos sobre la capa (con una herramienta puesta o encima de un dibujo): acercar/alejar y desplazar, como la librería
  function empezarPellizco(ev) {
    capturar(ev);
    const [a, b] = [...dedos.values()], r = ts.getVisibleLogicalRange(); if (!r) return;
    const mx = (a[0] + b[0]) / 2, m0 = logDeX(mx); if (!isFinite(m0)) return;
    pellizco = { d0: Math.max(10, Math.hypot(a[0] - b[0], a[1] - b[1])), m0, w0: r.to - r.from };
  }
  function moverPellizco() {
    const [a, b] = [...dedos.values()], W = ch.paneSize().width || 1, mx = (a[0] + b[0]) / 2;
    const w = Math.min(4000, Math.max(5, pellizco.w0 * pellizco.d0 / Math.max(10, Math.hypot(a[0] - b[0], a[1] - b[1]))));
    const from = pellizco.m0 - (mx / W) * w; ts.setVisibleLogicalRange({ from, to: from + w });
  }
  svg.addEventListener('pointerdown', ev => {
    const [x, y] = pos(ev);
    if (ev.pointerType === 'touch') dedos.set(ev.pointerId, [x, y]);
    if (dedos.size >= 2) { cancelarTrazo(); empezarPellizco(ev); pintar(); botones(); return; }   // segundo dedo: nada de línea fantasma
    if (ev.button !== 0) return;
    if (editando) terminarTexto(true);
    cols.hidden = true; desarmar();
    if (herr !== 'mover') { ev.preventDefault(); return empezar(ev, x, y); }
    const asa = ev.target.closest('[data-asa]'), f = ev.target.closest('[data-dib]');
    const d = asa ? buscar(sel) : f ? buscar(f.dataset.dib) : null; if (!d) return;
    ev.preventDefault();
    const yaSel = sel === d.id; sel = d.id;
    if (asa) { const i = +asa.dataset.asa, [hx, hy] = esquinas(d)[i]; arr = { modo: 'asa', d, i, dx: hx - x, dy: hy - y, x0: x, y0: y, antes: copia(), movido: false }; }
    else arr = { modo: 'mover', d, orig: d.p.map(q => [X(q.t), Y(q.p)]), x0: x, y0: y, antes: copia(), movido: false, yaSel };
    idTrazo = ev.pointerId; capturar(ev); pintar(); botones();
  });
  svg.addEventListener('pointermove', ev => {
    const [x, y] = pos(ev);
    if (dedos.has(ev.pointerId)) dedos.set(ev.pointerId, [x, y]);
    if (pellizco) { if (dedos.size >= 2) moverPellizco(); return; }
    if (idTrazo !== null && ev.pointerId !== idTrazo) return;
    if (arr) {
      if (!arr.movido && Math.hypot(x - arr.x0, y - arr.y0) < 3) return;
      arr.movido = true;
      if (arr.modo === 'mover') { const nuevos = arr.orig.map(([a, b]) => punto(a + x - arr.x0, b + y - arr.y0)); if (nuevos.every(valido)) arr.d.p = nuevos; }
      else { const q = punto(x + arr.dx, y + arr.dy); if (valido(q)) ponerAsa(arr.d, arr.i, q); }
      return pintar();
    }
    if (herr === 'mover') { if (ev.pointerType === 'mouse') cruz(x, y); return; }   // encima de un dibujo, la cruz sigue al ratón
    cruz(x, y);
    if (temp && (pulsado || espera)) { const q = restringir(x, y, ev.shiftKey); if (valido(q)) { temp.p[1] = q; pintar(); } }
  });
  const finPuntero = (ev, cancelado) => {
    dedos.delete(ev.pointerId);
    if (pellizco) { if (dedos.size < 2) pellizco = null; if (!dedos.size) soltar(ev); return; }
    if (idTrazo !== null && ev.pointerId !== idTrazo) return;
    soltarPuntero(ev, cancelado);
  };
  svg.addEventListener('pointerup', ev => finPuntero(ev, false));
  svg.addEventListener('pointercancel', ev => finPuntero(ev, true));
  svg.addEventListener('pointerleave', ev => { if (herr !== 'mover' || ev.pointerType === 'mouse') try { ch.clearCrosshairPosition(); } catch { } });
  function soltarPuntero(ev, cancelado) {
    soltar(ev); idTrazo = null;                      // pase lo que pase, la capa deja de tapar el gráfico
    if (arr) {
      const a = arr; arr = null;
      if ((cancelado || plano(a.d)) && a.movido) lista = JSON.parse(a.antes);      // un cuadro aplastado hasta 0 vuelve como estaba
      else if (a.movido) { empujar(a.antes); guardar(); }
      else if (a.yaSel && a.d.tipo === 'texto') { pintar(); return editarTexto(a.d, false); }   // otro toque en un texto ya elegido = escribir
      pintar(); botones(); return;
    }
    if (!pulsado) return;
    const p0 = pulsado; pulsado = null;
    if (cancelado) { temp = null; espera = false; return pintar(); }
    const [x, y] = pos(ev);
    if (Math.hypot(x - p0[0], y - p0[1]) < 6) { espera = true; return; }      // clic sin arrastrar: el otro extremo, con otro clic
    const q = restringir(x, y, ev.shiftKey); if (valido(q)) temp.p[1] = q;
    terminarFigura();
  }
  function empezar(ev, x, y) {
    const q = punto(x, y); if (!valido(q)) return;
    if (herr === 'texto') { const d = { id: idDib(), tipo: 'texto', p: [q], c: prefDib.c, txt: '' }; ponerHerr('mover'); return editarTexto(d, true); }
    if (espera && temp) { const q2 = restringir(x, y, ev.shiftKey); if (valido(q2)) temp.p[1] = q2; return terminarFigura(); }
    temp = { id: idDib(), tipo: herr, p: [q, { ...q }], c: prefDib.c }; pulsado = [x, y]; idTrazo = ev.pointerId; capturar(ev); pintar();
  }
  function terminarFigura() {
    const d = temp; temp = null; espera = false;
    const [a, b] = d.p.map(q => [X(q.t), Y(q.p)]);
    if (d.tipo === 'cuadro' ? plano(d) : !(Math.hypot(b[0] - a[0], b[1] - a[1]) >= 4)) return pintar();   // sin tamaño (o cuadro plano) no se guarda
    empujar(copia()); lista.push(d); guardar(); ponerHerr('mover'); sel = d.id; pintar(); botones();
  }
  // la rueda encima de la capa (un dibujo, o todo el gráfico con una herramienta puesta) se le pasa a la librería
  svg.addEventListener('wheel', ev => {
    const t = document.elementsFromPoint(ev.clientX, ev.clientY).find(el => el !== svg && !svg.contains(el) && lienzo.contains(el) && !pal.contains(el) && !el.classList?.contains('dib-input'));
    if (!t) return;
    ev.preventDefault();
    t.dispatchEvent(new WheelEvent('wheel', { deltaX: ev.deltaX, deltaY: ev.deltaY, deltaMode: ev.deltaMode, clientX: ev.clientX, clientY: ev.clientY, screenX: ev.screenX, screenY: ev.screenY, ctrlKey: ev.ctrlKey, shiftKey: ev.shiftKey, altKey: ev.altKey, metaKey: ev.metaKey, bubbles: true, cancelable: true }));
  }, { passive: false });
  // un toque en el gráfico vacío quita la selección (por el camino del evento: al elegir un dibujo la capa se repinta)
  lienzo.addEventListener('pointerdown', ev => {
    const camino = ev.composedPath(); if (camino.includes(svg) || camino.includes(pal) || ev.target.closest?.('.dib-input')) return;
    cols.hidden = true; desarmar();
    if (editando) terminarTexto(true);
    if (sel) { sel = null; pintar(); botones(); }
  });

  /* texto: se escribe en un campo encima del gráfico; Enter guarda, Esc cancela; vacío = no se guarda (o se borra) */
  function editarTexto(d, nuevo) {
    if (editando) terminarTexto(true);
    const inp = document.createElement('input');
    inp.className = 'dib-input'; inp.value = d.txt || ''; inp.maxLength = 140; inp.placeholder = 'Escribe y pulsa Enter'; inp.spellcheck = false;
    inp.setAttribute('aria-label', 'Texto del dibujo'); inp.style.setProperty('--c', colorOk(d.c) ? d.c : '#ffd60a');
    editando = { d, nuevo, inp, antes: copia() };
    if (!nuevo) d._oculto = true;
    lienzo.append(inp); medirEditor(); pintar(); botones();
    inp.focus({ preventScroll: true }); if (!nuevo) inp.select();
    inp.addEventListener('keydown', ev => { ev.stopPropagation(); if (ev.key === 'Enter') { ev.preventDefault(); terminarTexto(true); } else if (ev.key === 'Escape') { ev.preventDefault(); terminarTexto(false); } });
    inp.addEventListener('input', medirEditor);
    inp.addEventListener('blur', () => terminarTexto(true));
  }
  // el campo nunca pasa del borde del gráfico (si pasaba, el navegador desplazaba todo el visor para seguir el cursor)
  function medirEditor() { const i = editando?.inp; if (!i) return; const W = ch.paneSize().width; i.style.width = Math.min(Math.max(150, anchoTexto(i.value || i.placeholder) + 34), Math.max(120, W - 8)) + 'px'; colocarEditor(); }
  function colocarEditor() {
    const { d, inp } = editando, x = X(d.p[0].t), y = Y(d.p[0].p); if (!isFinite(x) || !isFinite(y)) return;
    const { width: W, height: H } = ch.paneSize(), w = parseFloat(inp.style.width) || 150;
    inp.style.left = Math.max(4, Math.min(x - 9, W - w - 4)) + 'px'; inp.style.top = Math.max(4, Math.min(y - 15, H - 34)) + 'px';
  }
  function terminarTexto(ok) {
    if (!editando) return;
    const { d, nuevo, inp, antes } = editando; editando = null; delete d._oculto;
    const s = inp.value.trim(); inp.remove();
    if (ok && s) { if (nuevo) { empujar(antes); d.txt = s; lista.push(d); sel = d.id; } else if (s !== d.txt) { empujar(antes); d.txt = s; } }
    else if (ok && !s && !nuevo) { empujar(antes); lista = lista.filter(z => z !== d); if (sel === d.id) sel = null; }
    guardar(); pintar(); botones();
  }

  /* paleta */
  function ponerHerr(h) {
    cancelarTrazo(); herr = h;
    svg.classList.toggle('dibujando', h !== 'mover');
    pal.querySelectorAll('[data-dherr]').forEach(b => b.classList.toggle('on', b.dataset.dherr === h));
    if (h !== 'mover') sel = null;
    try { ch.clearCrosshairPosition(); } catch { }
    pintar(); botones();
  }
  function abrirPaleta(si) {
    prefDib.abierta = si; guardarPrefDib(); pal.classList.toggle('abierta', si);
    const b = pal.querySelector('[data-dlapiz]'); b.setAttribute('aria-expanded', String(si)); b.title = si ? 'Esconder las herramientas' : 'Dibujar';
    if (!si) { cols.hidden = true; desarmar(); ponerHerr('mover'); }
  }
  function botones() {
    pal.querySelector('[data-dundo]').disabled = !hist.length;
    del.disabled = !sel && !lista.length;
    del.title = sel ? 'Borrar el dibujo · Supr' : 'Borrar todos los dibujos';
    if (sel || !lista.length) desarmar();
    const ds = buscar(sel); pal.querySelector('.dp-col i').style.background = ds ? ds.c : prefDib.c;
    insigniaDib(k);
  }
  // globo junto a un botón de la paleta: a la derecha si la paleta va en columna, debajo si va en fila (gráfico bajito)
  const flotar = (el, b) => {
    const rb = b.getBoundingClientRect(), rp = pal.getBoundingClientRect(), fila = getComputedStyle(pal).flexDirection === 'row';
    Object.assign(el.style, fila ? { top: 'calc(100% + 8px)', left: (rb.left - rp.left + rb.width / 2) + 'px', transform: 'translateX(-50%)' } : { top: (rb.top - rp.top + rb.height / 2) + 'px', left: '', transform: '' });
    el.hidden = false;
    if (!QUIETO) el.animate([{ opacity: 0, scale: .9 }, { opacity: 1, scale: 1 }], { duration: DUR(), easing: EASE() });
  };
  function verColores() {
    desarmar();
    if (!cols.hidden) { cols.hidden = true; return; }
    const act = buscar(sel)?.c || prefDib.c;
    cols.querySelectorAll('.sw').forEach(s => s.classList.toggle('on', s.dataset.dcol === act));
    flotar(cols, pal.querySelector('[data-dcolor]'));
  }
  function ponerColor(c) { if (!colorOk(c)) return; prefDib.c = c; guardarPrefDib(); const d = buscar(sel); if (d && d.c !== c) { empujar(copia()); d.c = c; guardar(); } cols.hidden = true; pintar(); botones(); }
  function guardar() { guardado = guardarDibs(k, lista, guardado); }
  function empujar(antes) { hist.push(antes); if (hist.length > 80) hist.shift(); rehacer = []; }
  function deshacerDib() { if (editando) terminarTexto(false); if (!hist.length) return; rehacer.push(copia()); lista = JSON.parse(hist.pop()); if (!buscar(sel)) sel = null; guardar(); pintar(); botones(); }
  function rehacerDib() { if (!rehacer.length) return; hist.push(copia()); lista = JSON.parse(rehacer.pop()); if (!buscar(sel)) sel = null; guardar(); pintar(); botones(); }
  function borrarSel() { if (!sel) return; empujar(copia()); lista = lista.filter(d => d.id !== sel); sel = null; guardar(); pintar(); botones(); }
  function borrarTodos() {      // sin nada elegido, la papelera borra todos: primero avisa, el segundo toque borra
    if (!del.classList.contains('seguro')) { cols.hidden = true; del.classList.add('seguro'); flotar(aviso, del); clearTimeout(del._t); del._t = setTimeout(desarmar, 3000); return; }
    desarmar(); empujar(copia()); lista = []; sel = null; guardar(); pintar(); botones();
  }
  pal.addEventListener('pointerdown', ev => ev.stopPropagation());
  pal.addEventListener('click', ev => {
    ev.stopPropagation();
    const b = ev.target.closest('button'); if (!b || b.disabled) return;
    if (b.dataset.dlapiz) return abrirPaleta(!pal.classList.contains('abierta'));
    if (b.dataset.dherr) { cols.hidden = true; desarmar(); return ponerHerr(b.dataset.dherr === herr ? 'mover' : b.dataset.dherr); }
    if (b.dataset.dcolor) return verColores();
    if (b.dataset.dcol) return ponerColor(b.dataset.dcol);
    if (b.dataset.dundo) { desarmar(); return deshacerDib(); }
    if (b.dataset.dborrar) return sel ? borrarSel() : borrarTodos();
  });
  // al pasar a «Captura» (o antes de cualquier cosa que esconda el gráfico): nada a medias ni elegido
  function reposo() { if (editando) terminarTexto(true); cancelarTrazo(); cols.hidden = true; desarmar(); if (herr !== 'mover') ponerHerr('mover'); if (sel) { sel = null; pintar(); botones(); } }

  /* teclas (las pasa el visor): Esc va de dentro afuera; Supr borra; Ctrl+Z / Ctrl+Y; V L F C T eligen herramienta.
     Con «Captura» a la vista no tocan los dibujos (no se ven) y Esc cierra el visor. */
  function tecla(ev) {
    if (v.querySelector('.vo-graf')?.hidden) return false;
    const mod = ev.ctrlKey || ev.metaKey, kk = ev.key.length === 1 ? ev.key.toLowerCase() : ev.key;
    if (mod && kk === 'z' && !ev.shiftKey) { deshacerDib(); return true; }
    if (mod && (kk === 'y' || (kk === 'z' && ev.shiftKey))) { rehacerDib(); return true; }
    if (mod || ev.altKey) return false;
    if (ev.key === 'Escape') {
      if (temp || espera || pulsado || arr) { cancelarTrazo(); pintar(); botones(); return true; }
      if (!cols.hidden || !aviso.hidden || del.classList.contains('seguro')) { cols.hidden = true; desarmar(); return true; }
      if (herr !== 'mover') { ponerHerr('mover'); return true; }
      if (sel) { sel = null; pintar(); botones(); return true; }
      return false;
    }
    if ((ev.key === 'Delete' || ev.key === 'Backspace') && sel && !arr) { borrarSel(); return true; }
    const h = { v: 'mover', l: 'linea', f: 'flecha', c: 'cuadro', t: 'texto' }[kk];
    if (h) { if (!pal.classList.contains('abierta')) abrirPaleta(true); ponerHerr(h); return true; }   // ponerHerr suelta lo que estuviera a medias
    return false;
  }
  // lo que llega del almacén (el otro dibuja, o tú desde otro aparato, o una escritura que la base rechazó): los del otro
  // siempre; los míos solo si no estoy a medias (un trazo, un arrastre o un texto no se pisan)
  function refrescar() {
    ajenos = ajenosDe(k);
    if (!arr && !temp && !editando && !pulsado && !espera) {
      const mios = misDibs(k);
      if (firmaDibs(mios) !== firmaDibs(lista)) { lista = mios; guardado = mapaDibs(mios); if (!buscar(sel)) sel = null; }
    }
    pintar(); botones();
  }
  pintar(); botones();
  return { tecla, reposo, refrescar, cerrar: () => { if (editando) terminarTexto(true); cancelarTrazo(); }, _X: X, _Y: Y, _lista: () => lista };
}
function pintarGrafico(v, o, VD) {
  const LC = window.LightweightCharts, el = v.querySelector('.vo-lienzo'), cs = getComputedStyle(document.documentElement);
  const ok = cs.getPropertyValue('--ok').trim() || '#30d158', mal = cs.getPropertyValue('--mal').trim() || '#ff453a', fondo = cs.getPropertyValue('--card').trim() || '#0e0e10', dg = VD.digits ?? 5;
  el.querySelector('.vo-carga')?.remove();
  const ch = LC.createChart(el, { autoSize: true,
    layout: { background: { type: 'solid', color: fondo }, textColor: '#8e8e96', fontFamily: 'Inter, system-ui, sans-serif', attributionLogo: false },
    grid: { vertLines: { color: '#ffffff08' }, horzLines: { color: '#ffffff08' } },
    rightPriceScale: { borderColor: '#ffffff14' }, timeScale: { borderColor: '#ffffff14', timeVisible: true, secondsVisible: false, rightOffset: 4 },
    crosshair: { mode: LC.CrosshairMode.Normal }, localization: { locale: 'es-ES', priceFormatter: p => p.toFixed(dg) } });
  v._chart = ch;
  const se = ch.addSeries(LC.CandlestickSeries, { upColor: ok, downColor: mal, wickUpColor: ok, wickDownColor: mal, borderVisible: false, priceFormat: { type: 'price', precision: dg, minMove: 1 / 10 ** dg } });
  const lar = o.dir === 'largo';
  [[o.entrada, '#f5f5f7', 'Entrada', 2], [o.sl0, mal, 'Stop', 2], [o.tp0, ok, 'Objetivo', 2], [o.salida, (o.resultado || 0) >= 0 ? ok : mal, 'Salida', 0]]
    .forEach(([p, color, title, lineStyle]) => p != null && se.createPriceLine({ price: p, color, lineWidth: 1, lineStyle, axisLabelVisible: true, title }));
  const marcas = LC.createSeriesMarkers(se, []);
  let tf = 'M5', L = [];
  const dur = Math.max(1800, (o.t_salida || o.t_entrada + 3600) - o.t_entrada);
  const rangoOp = () => { const m = TF_SEG[tf] * 30; return { from: o.t_entrada - Math.max(dur * 1.5, m), to: (o.t_salida || o.t_entrada) + Math.max(dur * .8, m * .6) }; };
  v._ponerTF = (nuevo, rango) => {
    const r = rango || ch.timeScale().getVisibleRange(); tf = nuevo;
    L = velasTF(VD, tf); const seg = TF_SEG[tf], barra = t => Math.floor(t / seg) * seg;
    se.setData(L.map(([time, open, high, low, close]) => ({ time, open, high, low, close })));
    marcas.setMarkers([{ time: barra(o.t_entrada), position: lar ? 'belowBar' : 'aboveBar', color: lar ? ok : mal, shape: lar ? 'arrowUp' : 'arrowDown', text: 'Entrada' },
      ...(o.t_salida ? [{ time: barra(o.t_salida), position: lar ? 'aboveBar' : 'belowBar', color: '#f5f5f7', shape: 'circle', text: 'Salida ' + fDin(o.resultado, o.moneda) }] : [])]
      .sort((a, b) => a.time - b.time));
    if (r) ch.timeScale().setVisibleRange(r);
  };
  v._mover = s => { const r = ch.timeScale().getVisibleRange(); if (r) ch.timeScale().setVisibleRange({ from: r.from + s, to: r.to + s }); };
  v._volver = () => ch.timeScale().setVisibleRange(rangoOp());
  v._ponerTF('M5', rangoOp());
  v._dib = montarDibujos(v, o.k, ch, se, () => L, () => TF_SEG[tf], dg);
  if (VD.fuente) { const p = v.querySelector('.vo-pista'); p.classList.remove('tuto'); p.textContent = 'Velas de otra cuenta (otro bróker), puestas a su hora · arrastra para ir atrás'; p.title = VD.fuente; }
}

/* ---- carpetas y tarjetas (como la demo; las capturas, por enlace firmado) ---- */
let carpetaSel = null;                                // símbolo (base) abierto; se recuerda al volver a la pestaña
function porCarpeta() {
  const m = new Map();
  for (const o of opsVistas()) { const i = infoSim(o.s); if (!m.has(i.b)) m.set(i.b, { ...i, ops: [] }); m.get(i.b).ops.push(o); }
  return m;
}
const sumaOps = L => { const gan = L.filter(o => (o.resultado || 0) > 0).length;
  return { n: L.length, net: L.reduce((a, o) => a + (o.resultado || 0), 0), wr: L.length ? Math.round(gan / L.length * 100) : 0, r: L.reduce((a, o) => a + (o.r || 0), 0), mon: L[0]?.moneda }; };
const totHTML = (s, conN) => `<div class="ops-tot">${conN ? `<span><b>${s.n}</b>operaci${s.n === 1 ? 'ón' : 'ones'}</span>` : ''}<span><b class="${s.net >= 0 ? 'pos' : 'neg'}">${fDin(s.net, s.mon)}</b>resultado</span><span><b>${s.wr}%</b>ganadoras</span><span><b>${s.r > 0 ? '+' : ''}${fmt(s.r, 2)}R</b>en total</span></div>`;
function quienHTML(todas) {
  const ps = ST.perfiles(); if (ps.length < 2) return '';
  const n = id => todas.filter(o => !id || o.autor === id).length;
  return `<div class="ops-quien" role="group" aria-label="De quién son">${[['', 'Todas'], ...ps.map(p => [p.id, p.nombre])].map(([id, nom]) =>
    `<button class="${id === quien ? 'on' : ''}" data-quien="${e(id)}">${id ? `<i style="--c:${colorDe(id)}">${e(inicialDe(id))}</i>` : ''}${e(nom)}<small>${n(id)}</small></button>`).join('')}</div>`;
}
function quienesHTML(L) {                              // en la carpeta: quién tiene operaciones dentro
  const m = new Map(); L.forEach(o => m.set(o.autor, (m.get(o.autor) || 0) + 1));
  return `<span class="cp-quien" title="${e([...m].map(([id, k]) => `${nombreDe(id) || '—'}: ${k}`).join(' · '))}">${[...m.keys()].map(id => `<i style="--c:${colorDe(id)}">${e(inicialDe(id))}</i>`).join('')}</span>`;
}
function opsHTML() {
  if (quien && !perfilDe(quien)) quien = '';
  const todas = OPS(), L = opsVistas(), borr = borradasMias().length;
  const recup = borr ? `<button class="pastilla recup" data-recuperar="1">Recuperar ${borr} borrada${borr === 1 ? '' : 's'}</button>` : '';
  if (todas.length && !L.length) return `<div class="card big ops-cab"><div class="etq">Setups · operaciones publicadas</div><h2>${e(nombreDe(quien))} aún no ha publicado ninguna</h2>
      ${quienHTML(todas)}</div>`;
  if (!L.length) return `<div class="card libre-ops"><b>${borr ? 'No queda ninguna operación' : 'Aún no hay operaciones publicadas'}</b>En el Terminal: <b>Diario</b> → abre una operación → <b>Publicar en la agenda</b>. Aparece aquí sola.${borr ? `<br><span style="display:inline-block;margin-top:14px">${recup}</span>` : ''}</div>`;
  const C = porCarpeta();
  if (carpetaSel && !C.has(carpetaSel)) carpetaSel = null;
  if (carpetaSel) return carpetaHTML(C.get(carpetaSel));
  return `<div class="card big ops-cab"><div class="etq">Setups · operaciones publicadas</div><h2>${L.length} operaci${L.length === 1 ? 'ón' : 'ones'} en ${C.size} carpeta${C.size === 1 ? '' : 's'}</h2>
      ${totHTML(sumaOps(L))}${recup}${quienHTML(todas)}</div>
    ${GRUPOS_OPS.map(([k, n]) => { const cs = [...C.values()].filter(c => c.g === k); if (!cs.length) return ''; const s = sumaOps(cs.flatMap(c => c.ops));
      return `<section class="ops-grupo"><h3>${n}<small>${cs.length} carpeta${cs.length === 1 ? '' : 's'} · ${s.n} op.</small><span class="${s.net >= 0 ? 'pos' : 'neg'}">${fDin(s.net, s.mon)}</span></h3>
        <div class="carpetas">${cs.map(carpetaTile).join('')}</div></section>`; }).join('')}`;
}
function carpetaTile(c) {
  const s = sumaOps(c.ops), caps = c.ops.filter(o => o.captura).slice(0, 3).reverse();
  return `<button class="carpeta" data-carp="${e(c.b)}" style="--c:${c.c}" aria-label="Abrir la carpeta ${e(c.b)}">
    <span class="cp-atras"></span>
    <span class="cp-hojas">${caps.map((o, i) => imgOp(o).replace('<img ', `<img style="--i:${caps.length - 1 - i}" `)).join('') || '<i></i>'}</span>
    <span class="cp-frente">${logoSim(c.b, 44)}<span class="cp-nom"><b>${e(c.b)}</b><small>${s.n} op. · ${s.wr}%<span class="cp-gan"> ganadoras</span></small></span>${quienesHTML(c.ops)}
      <span class="cp-pie"><span class="cp-rastro">${c.ops.slice(0, 14).reverse().map(o => `<i class="${(o.resultado || 0) >= 0 ? 'pos' : 'neg'}"></i>`).join('')}</span><span class="cp-res ${s.net >= 0 ? 'pos' : 'neg'}">${fDin(s.net, s.mon)}</span></span></span></button>`;
}
function carpetaHTML(c) {
  return `<div class="card big carp-cab" style="--c:${c.c}"><button class="pastilla volver-carp" data-carpvolver="1">‹ ${nombreGrupo(c.g)}</button>
      <div class="cc-fila">${logoSim(c.b, 64)}<div><div class="etq">Setups · ${nombreGrupo(c.g)}</div><h2>${e(c.b)}</h2></div></div>
      ${totHTML(sumaOps(c.ops), true)}</div>
    <div class="rej">${c.ops.map(opCardHTML).join('')}</div>`;
}
function opCardHTML(o) {
  const lar = o.dir === 'largo', pos = (o.resultado || 0) >= 0, k = o.k, mia = o.autor === YO(), n = nDibujos(k);
  return `<div class="card op" data-op="${e(k)}"><div class="op-img" ${o.captura || o.velas ? `data-verop="${e(k)}"` : ''}>${o.captura ? imgOp(o, 'Captura de la operación') : `<span class="op-sin">${o.velas ? 'sin captura · abre el gráfico' : 'sin captura'}</span>`}
      ${autorHTML(o.autor)}
      ${o.velas ? `<span class="op-mov"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l-6 6 6 6M15 6l6 6-6 6"/></svg>Gráfico<b class="op-ndib">${n ? `· ✎ ${n}` : ''}</b></span>` : ''}
      <span class="op-res ${pos ? 'pos' : 'neg'}">${o.r != null ? fmt(o.r, 2) + 'R · ' : ''}${fDin(o.resultado, o.moneda)}</span>
      ${mia ? `<button class="op-del" data-delop="${e(k)}" title="Borrar la operación" aria-label="Borrar la operación">${PAPELERA}<span>¿Borrar?</span></button>` : ''}</div>
    <div class="op-c"><div class="stc">${logoSim(o.s, 40)}<div><b>${e(o.s)}</b><small>${fCuando(o.t_entrada)}${o.t_salida ? ' → ' + fCuando(o.t_salida, false) : ' · en curso'}${o.temporalidad ? ' · ' + e(o.temporalidad) : ''}</small></div><span class="dir" style="--c:${lar ? 'var(--ok)' : 'var(--mal)'}">${lar ? '↑ Largo' : '↓ Corto'}</span></div>
      <div class="op-niv"><span>Entrada <b>${fNum(o.entrada)}</b></span><span>Salida <b>${fNum(o.salida)}</b></span><span>Stop <b>${fNum(o.sl0)}</b></span><span>Lote <b>${fNum(o.volumen)}</b></span></div>
      ${o.porque ? `<p class="op-pq">${e(o.porque)}</p>` : ''}
      ${(o.etiquetas || []).length ? `<div class="op-et">${o.etiquetas.map(x => `<span>${e(x)}</span>`).join('')}</div>` : ''}
      <div class="op-pie">Publicada por ${e(nombreDe(o.autor) || '—')} · ${fCuando(o.publicada)}${o.motivo ? ' · salió por ' + e(o.motivo) : ''} · ${mia ? `${e(otro())} solo la ve` : 'solo para verla'}</div></div></div>`;
}

/* ---- visor: el gráfico que se mueve (al menos 3 días hacia atrás) + la captura ---- */
const cargado = {};
const cargarScript = src => cargado[src] ||= new Promise((ok, mal) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => { delete cargado[src]; mal(new Error(src)); }; document.head.append(s); });
async function verOperacion(k) {
  const o = OPS().find(x => x.k === k); if (!o) return;
  cerrarVisorOp(true);
  const lar = o.dir === 'largo', pos = (o.resultado || 0) >= 0, conG = !!o.velas, conC = !!o.captura;
  const v = document.createElement('div'); v.className = 'visor-op';
  v.innerHTML = `<div class="vo-caja" role="dialog" aria-label="Operación ${e(o.s)}"><div class="vo-cab">${logoSim(o.s, 40)}
      <div class="vo-tit"><b>${e(baseSim(o.s))}<span class="dir" style="--c:${lar ? 'var(--ok)' : 'var(--mal)'}">${lar ? '↑ Largo' : '↓ Corto'}</span><span class="vo-res ${pos ? 'pos' : 'neg'}">${fDin(o.resultado, o.moneda)}</span>${autorHTML(o.autor, 'vo-autor')}</b>
        <small>${fCuando(o.t_entrada)}${o.t_salida ? ' → ' + fCuando(o.t_salida, false) : ''} · entrada ${fNum(o.entrada)}${o.salida != null ? ' · salida ' + fNum(o.salida) : ''}</small></div>
      ${conG && conC ? '<div class="vo-seg"><button data-vom="graf" class="on">Gráfico</button><button data-vom="cap">Captura</button></div>' : ''}
      <button class="redondo" data-vocerrar="1" aria-label="Cerrar">×</button></div>
    <div class="vo-cuerpo">${conG ? `<div class="vo-graf"><div class="vo-lienzo"><div class="vo-carga">Cargando velas…</div></div>
        <div class="vo-barra"><div class="vo-tf">${Object.keys(TF_SEG).map(t => `<button class="op2 ${t === 'M5' ? 'on' : ''}" data-votf="${t}">${{ M5: '5 min', M15: '15 min', H1: '1 h' }[t]}</button>`).join('')}</div>
          <button class="pastilla" data-voatras="1">◂ 1 día antes</button><button class="pastilla" data-vovolver="1">Volver a la operación</button><span class="vo-pista tuto">Arrastra para ir atrás · rueda para acercar · ✎ para dibujar</span>
          <a class="vo-cred" href="https://www.tradingview.com/lightweight-charts/" target="_blank" rel="noopener">Gráfico: TradingView Lightweight Charts™</a></div></div>` : ''}
      ${conC ? `<div class="vo-cap" ${conG ? 'hidden' : ''}>${imgOp(o, 'Captura de la operación').replace(' loading="lazy"', '')}</div>` : ''}</div></div>`;
  document.body.append(v);
  ponerImagenes(v);
  v.addEventListener('click', ev => {
    if (ev.target === v || ev.target.closest('[data-vocerrar]')) return cerrarVisorOp();
    const m = ev.target.closest('[data-vom]');
    if (m) { if (m.dataset.vom === 'cap') v._dib?.reposo(); v.querySelectorAll('[data-vom]').forEach(b => b.classList.toggle('on', b === m)); v.querySelector('.vo-graf').hidden = m.dataset.vom !== 'graf'; v.querySelector('.vo-cap').hidden = m.dataset.vom !== 'cap'; return; }
    const t = ev.target.closest('[data-votf]'); if (t && v._ponerTF) { v.querySelectorAll('[data-votf]').forEach(b => b.classList.toggle('on', b === t)); return v._ponerTF(t.dataset.votf); }
    if (ev.target.closest('[data-voatras]') && v._mover) return v._mover(-86400);
    if (ev.target.closest('[data-vovolver]') && v._volver) return v._volver();
  });
  if (!QUIETO) v.querySelector('.vo-caja').animate([{ opacity: 0, transform: 'scale(.94) translateY(12px)' }, { opacity: 1, transform: 'none' }], { duration: DUR(), easing: EASE() });
  if (!conG) return;
  let VD = null;
  try {
    const [, url] = await Promise.all([cargarScript('vendor/lightweight-charts.standalone.production.js'), urlsDe([o.velas]).then(m => m[o.velas])]);
    if (!url) throw new Error('sin enlace');
    VD = await (await fetch(url)).json();
  } catch { const c = v.querySelector('.vo-carga'); if (c) c.textContent = 'No se pudieron cargar las velas'; return; }
  if (!v.isConnected) return;
  if (!VD || !(VD.M5?.length || VD.H1?.length)) { v.querySelector('.vo-carga').textContent = 'Esta operación no trae velas'; return; }
  pintarGrafico(v, o, VD);
  // lo que dibuja el otro (o tú desde otro aparato) llega en vivo
  v._quitar = ST.on(['operacion_dibujos'], () => v._dib?.refrescar());
}

/* ---- la pestaña ---- */
export function montar(cont, ctx) {
  ST = ctx.store; DB = ctx.db; UI = ctx.ui; AVISAR = ctx.avisar;
  const hayTabla = () => !ST.disponible || ST.disponible('operaciones');
  const conocidas = new Set(ST.filas('operaciones').map(f => f.id));
  const raiz = document.createElement('div'); raiz.className = 'v-ops'; cont.replaceChildren(raiz);
  const pintar = () => {
    raiz.innerHTML = hayTabla() ? opsHTML()
      : '<div class="card libre-ops"><b>Las operaciones aún no están activadas</b>Falta aplicar en la base de datos el SQL 005 de la agenda; hasta entonces aquí no sale ninguna.</div>';
    ponerImagenes(raiz);
  };
  function abrirCarpeta(btn) {
    const r0 = btn.getBoundingClientRect();
    carpetaSel = btn.dataset.carp; pintar(); scrollTo({ top: 0, behavior: 'instant' });
    const cab = raiz.querySelector('.carp-cab'); if (!cab || QUIETO) return;
    const r1 = cab.getBoundingClientRect();
    cab.animate([{ transformOrigin: '0 0', transform: `translate(${r0.left - r1.left}px,${r0.top - r1.top}px) scale(${r0.width / r1.width},${r0.height / r1.height})`, opacity: .35 },
      { transformOrigin: '0 0', transform: 'none', opacity: 1 }], { duration: DUR() * 1.1, easing: EASE() });
  }
  function cerrarCarpeta() {
    const viejo = carpetaSel, cab = raiz.querySelector('.carp-cab'), r0 = cab?.getBoundingClientRect();
    carpetaSel = null; pintar();
    const t = raiz.querySelector(`.carpeta[data-carp="${CSS.escape(viejo || '')}"]`); if (!t || !r0 || QUIETO) return;
    t.scrollIntoView({ block: 'center', behavior: 'instant' });
    const r1 = t.getBoundingClientRect();
    t.animate([{ transformOrigin: '0 0', transform: `translate(${r0.left - r1.left}px,${r0.top - r1.top}px) scale(${r0.width / r1.width},${Math.min(3, r0.height / r1.height)})`, opacity: .3 },
      { transformOrigin: '0 0', transform: 'none', opacity: 1 }], { duration: DUR(), easing: EASE() });
  }
  // borrar: el primer toque arma la papelera («¿Borrar?»), el segundo borra; «Deshacer» en la isla. Solo quien la publicó.
  function pedirBorrarOp(btn) {
    if (!btn.classList.contains('seguro')) {
      $$('.op-del.seguro').forEach(b => b.classList.remove('seguro'));
      btn.classList.add('seguro'); clearTimeout(btn._t); btn._t = setTimeout(() => btn.classList.remove('seguro'), 3000); return;
    }
    const k = btn.dataset.delop, o = OPS().find(x => x.k === k); if (!o) return;
    const card = btn.closest('.op'), antes = carpetaSel;
    const hecho = () => {
      ST.papelera('operaciones', k).catch(err => UI.error(err));
      AVISAR(`Borrada · ${baseSim(o.s)} ${o.dir}`, fDin(o.resultado, o.moneda), '#8e8e96', () => { carpetaSel = antes; ST.restaurar('operaciones', k).catch(err => UI.error(err)); });
    };
    if (card && !QUIETO) card.animate([{ opacity: 1, transform: 'none', filter: 'blur(0)' }, { opacity: 0, transform: 'scale(.92)', filter: 'blur(6px)' }], { duration: 220, easing: 'ease-in', fill: 'forwards' }).onfinish = hecho; else hecho();
  }
  function recuperarOps() {
    const ids = borradasMias().map(f => f.id); if (!ids.length) return;
    Promise.all(ids.map(id => ST.restaurar('operaciones', id))).catch(err => UI.error(err));
    AVISAR(`Operaci${ids.length === 1 ? 'ón recuperada' : 'ones recuperadas'}`, String(ids.length), 'var(--ok)', () => Promise.all(ids.map(id => ST.papelera('operaciones', id))).catch(err => UI.error(err)));
  }
  const alClic = ev => {
    const d = ev.target.closest('[data-delop]'); if (d) { ev.stopPropagation(); return pedirBorrarOp(d); }
    const c = ev.target.closest('[data-carp]'); if (c) return abrirCarpeta(c);
    if (ev.target.closest('[data-carpvolver]')) return cerrarCarpeta();
    const v = ev.target.closest('[data-verop]'); if (v) return verOperacion(v.dataset.verop);
    if (ev.target.closest('[data-recuperar]')) return recuperarOps();
    const q = ev.target.closest('[data-quien]');
    if (q) { quien = q.dataset.quien; try { localStorage.setItem(CLAVE_QUIEN, quien); } catch { /* nada */ } return pintar(); }
  };
  raiz.addEventListener('click', alClic);
  // con el visor abierto, las teclas son suyas (dibujos primero; Esc lo cierra; los números no cambian de pestaña por debajo).
  // Sin visor, Esc cierra la carpeta.
  const alTecla = ev => {
    const v = document.querySelector('.visor-op:not(.cerrando)');
    if (v) {
      if (ev.target.closest?.('.dib-input')) return;
      if (v._dib?.tecla(ev)) { ev.preventDefault(); ev.stopPropagation(); return; }
      if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); return cerrarVisorOp(); }
      if (/^[0-9]$/.test(ev.key)) ev.stopPropagation();
      return;
    }
    if (ev.key === 'Escape' && carpetaSel && !ev.target.closest?.('input, textarea, [contenteditable]') && raiz.isConnected) { ev.preventDefault(); cerrarCarpeta(); }
  };
  document.addEventListener('keydown', alTecla, true);
  const quitarOps = ST.on(['operaciones', 'perfiles'], () => {
    const nuevas = ST.vivas('operaciones').filter(f => !conocidas.has(f.id));
    ST.filas('operaciones').forEach(f => conocidas.add(f.id));
    if (nuevas.length) { const o = aOp(nuevas[0]); AVISAR(`Operación publicada · ${baseSim(o.s)} ${o.dir}`, o.r != null ? fmt(o.r, 2) + 'R' : '', (o.resultado || 0) >= 0 ? 'var(--ok)' : 'var(--mal)'); }
    pintar();
  });
  const quitarDibs = ST.on(['operacion_dibujos'], () => raiz.querySelectorAll('.op[data-op]').forEach(x => insigniaDib(x.dataset.op)));
  pintar();
  return () => {
    cerrarVisorOp(true);
    document.removeEventListener('keydown', alTecla, true);
    raiz.removeEventListener('click', alClic);
    quitarOps(); quitarDibs();
  };
}

