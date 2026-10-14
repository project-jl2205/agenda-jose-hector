// MODO DEMO: la app sin servidor. Datos de ejemplo en memoria, guardados en localStorage, y
// "tiempo real" entre pestañas con BroadcastChannel: cada pestaña puede entrar como una persona
// (Jose Luis en una, Héctor en otra) y ver los cambios de la otra al instante.
// Imita lo que hace Supabase (valores por defecto, reglas de setups, papelera) para poder probar.

import { hoy, sumarDias, semanaActual, madridAInstante, lunesDe } from './fechas.js';

const CLAVE = 'agenda-jh-demo-v1';
const SESION = 'agenda-jh-demo-usuario';
let db = null;
let canal = null;
const oyentes = new Set();
const oyentesAuth = new Set();
const blobs = new Map();
const ahora = () => new Date().toISOString();
const uid = () => crypto.randomUUID();

const PK = { tareas_hechas: ['tarea_id', 'ocurrencia'], notas_semana: ['semana', 'slot'], setup_marcas: ['setup_id', 'paso'], setup_estado: ['setup_id'], simbolos: ['simbolo'] };
const pk = t => PK[t] || ['id'];
const mismaClave = (t, a, b) => pk(t).every(k => String(a[k]) === String(b[k]));

function guardar() { try { localStorage.setItem(CLAVE, JSON.stringify(db)); } catch { /* sin almacenamiento */ } }
function cargar() { try { return JSON.parse(localStorage.getItem(CLAVE) || 'null'); } catch { return null; } }
const usuario = () => { try { return sessionStorage.getItem(SESION); } catch { return null; } };

export async function iniciar() {
  db = cargar() || semillas();
  guardar();
  if ('BroadcastChannel' in window) {
    canal = new BroadcastChannel('agenda-jh-demo');
    canal.onmessage = ev => {
      const m = ev.data;
      if (m?.tipo === 'cambio') { aplicarLocal(m.cambio); oyentes.forEach(cb => cb(m.cambio)); }
      else if (m?.tipo === 'presencia') recibirPresencia(m);
    };
  }
  latidoAgente();
  setInterval(latidoAgente, 30000);
}

function aplicarLocal({ tabla, tipo, nueva, vieja }) {
  const filas = db[tabla] || (db[tabla] = []);
  const i = filas.findIndex(f => mismaClave(tabla, f, tipo === 'DELETE' ? vieja : nueva));
  if (tipo === 'DELETE') { if (i >= 0) filas.splice(i, 1); }
  else if (i >= 0) filas[i] = nueva; else filas.push(nueva);
  guardar();
}

function difundir(cambio) {
  aplicarLocal(cambio);
  oyentes.forEach(cb => cb(cambio));
  canal?.postMessage({ tipo: 'cambio', cambio });
}

// El "agente" del demo solo deja el latido al día (no lee MT5).
function latidoAgente() {
  const fila = { id: 'setups', latido: ahora(), mt5_ok: true, reloj_ok: true, version: 'demo', ultimo_error: null, ultimo_error_en: null, detalle: { nota: 'Modo demo: no hay agente leyendo MT5.' } };
  const existe = (db.agente_estado || []).some(f => f.id === 'setups');
  difundir({ tabla: 'agente_estado', tipo: existe ? 'UPDATE' : 'INSERT', nueva: fila, vieja: fila });
}

// ---- autenticación ----
export const auth = {
  sesion() { const id = usuario(); return id ? { usuarioId: id, email: db.perfiles.find(p => p.id === id)?.email } : null; },
  entrar(email) {
    const p = db.perfiles.find(x => x.email === String(email).trim().toLowerCase());
    if (!p) throw new Error('En el demo solo existen jose@demo y hector@demo.');
    sessionStorage.setItem(SESION, p.id);
    oyentesAuth.forEach(cb => cb({ usuarioId: p.id, email: p.email }));
  },
  salir() { sessionStorage.removeItem(SESION); oyentesAuth.forEach(cb => cb(null)); },
  alCambiar(cb) { oyentesAuth.add(cb); return () => oyentesAuth.delete(cb); },
};

// ---- valores por defecto y reglas (imitan el SQL) ----
const DEF = {
  etiquetas: u => ({ color: '#6366f1', ambito: 'todas', creado_por: u, creado_en: ahora(), borrado_en: null }),
  grupos: u => ({ prioridad: 'ALTA', color: '#f59e0b', orden: 0, persona: null, origen_grupo_id: null, creado_por: u, creado_en: ahora(), actualizado_en: ahora(), borrado_en: null }),
  tareas: u => ({ notas: null, grupo_id: null, persona: null, prioridad: null, etiquetas: [], tipo: 'puntual', fecha: null, hora: null, duracion_min: null, rrule: null, hasta: null, orden: 0, origen_tarea_id: null, creado_por: u, creado_en: ahora(), actualizado_en: ahora(), borrado_en: null }),
  tareas_hechas: u => ({ ocurrencia: '1970-01-01', hecha_por: u, hecha_en: ahora() }),
  notas_semana: u => ({ texto: '', editado_por: u, editado_en: ahora() }),
  herramientas: () => ({ categoria: null, gastado: 0, presupuesto: 0, moneda: '€', estado: 'ACTIVO', color: '#6366f1', orden: 0, actualizado_en: ahora(), borrado_en: null }),
  anotaciones: u => ({ importancia: 2, pais: null, simbolos: [], etiquetas: [], antes: null, despues: null, serie_id: null, creado_por: u, creado_en: ahora(), actualizado_en: ahora(), borrado_en: null }),
  comentarios: u => ({ autor: u, creado_en: ahora(), editado_en: null, borrado_en: null }),
  simbolos: u => ({ nombre: null, mercado: null, digitos: null, descripcion: null, verificado: 'pendiente', verificado_en: null, activo: true, anadido_por: u, anadido_en: ahora() }),
  setups: u => ({ modo: 'tiempo', condiciones: null, porque: null, etiquetas: [], anotacion_id: null, autor: u, creado_en: ahora(), actualizado_en: ahora(), anulado_en: null, anulado_motivo: null, borrado_en: null }),
  setup_marcas: u => ({ marcado_por: u, marcado_en: ahora() }),
  setup_capturas: u => ({ subida_por: u, subida_en: ahora(), borrado_en: null }),
};

function validar(tabla, f, antes) {
  if (tabla === 'tareas') {
    if (f.tipo !== 'puntual' && (!f.rrule || !f.fecha)) throw new Error('Una tarea que se repite necesita fecha de inicio y repetición.');
    if (f.tipo === 'temporal' && !f.hasta) throw new Error('Una tarea temporal necesita fecha de fin.');
  }
  if (tabla === 'setups') {
    const e = +f.entrada, s = +f.sl, t = +f.tp;
    const ok = f.direccion === 'largo' ? s < e && e < t : t < e && e < s;
    if (!ok) throw new Error('Los niveles no cuadran: en un largo SL < entrada < TP; en un corto TP < entrada < SL.');
    if (antes) {
      if (antes.autor !== usuario()) throw new Error('No tienes permiso para esto.');
      const congelados = ['simbolo', 'direccion', 'entrada', 'sl', 'tp', 'temporalidad', 't0', 'modo', 'condiciones'];
      const cambia = congelados.some(k => JSON.stringify(antes[k]) !== JSON.stringify(f[k]));
      const limite = Math.max(new Date(antes.t0).getTime(), new Date(antes.creado_en).getTime() + 600000);
      if (cambia && Date.now() > limite) throw new Error('El setup ya está en juego: sus niveles, hora y condiciones no se pueden cambiar. Anúlalo y crea otro.');
    } else if (f.autor !== usuario()) throw new Error('No tienes permiso para esto.');
  }
  if (tabla === 'comentarios' && antes && antes.autor !== usuario()) throw new Error('No tienes permiso para esto.');
}

export function seleccionar(tabla) { return structuredClone(db[tabla] || []); }

export function insertar(tabla, filas) {
  const u = usuario();
  return filas.map(f => {
    const nueva = { ...(DEF[tabla]?.(u) || {}), ...f };
    if (pk(tabla)[0] === 'id' && !nueva.id) nueva.id = uid();
    validar(tabla, nueva, null);
    if ((db[tabla] || []).some(x => mismaClave(tabla, x, nueva))) throw new Error('Eso ya existe.');
    difundir({ tabla, tipo: 'INSERT', nueva, vieja: null });
    if (tabla === 'setups') estadoInicialDemo(nueva);
    return structuredClone(nueva);
  });
}

export function actualizar(tabla, claveObj, cambios) {
  const antes = (db[tabla] || []).find(x => mismaClave(tabla, x, claveObj));
  if (!antes) return [];
  const nueva = { ...antes, ...cambios };
  if ('actualizado_en' in antes) nueva.actualizado_en = ahora();
  if (tabla === 'notas_semana') { nueva.editado_en = ahora(); nueva.editado_por = usuario(); }
  validar(tabla, nueva, antes);
  difundir({ tabla, tipo: 'UPDATE', nueva, vieja: antes });
  return [structuredClone(nueva)];
}

export function upsert(tabla, filas, onConflict) {
  return filas.flatMap(f => {
    const antes = (db[tabla] || []).find(x => mismaClave(tabla, x, f));
    return antes ? actualizar(tabla, f, f) : insertar(tabla, [f]);
  });
}

export function borrar(tabla, claveObj) {
  const vieja = (db[tabla] || []).find(x => mismaClave(tabla, x, claveObj));
  if (vieja) difundir({ tabla, tipo: 'DELETE', nueva: null, vieja });
}

export function rpc(nombre, args) {
  if (nombre !== 'arrastrar_semana') throw new Error(`Función desconocida: ${nombre}`);
  const { p_origen, p_destino } = args;
  let n = 0;
  const hecha = t => db.tareas_hechas.some(h => h.tarea_id === t.id);
  for (const g of db.grupos.filter(x => x.semana === p_origen && !x.borrado_en).sort((a, b) => a.orden - b.orden)) {
    const pend = db.tareas.filter(t => t.grupo_id === g.id && !t.borrado_en && !hecha(t));
    if (!pend.length) continue;
    let nuevo = db.grupos.find(x => x.semana === p_destino && x.origen_grupo_id === g.id);
    if (!nuevo) [nuevo] = insertar('grupos', [{ semana: p_destino, nombre: g.nombre, persona: g.persona, prioridad: g.prioridad, color: g.color, orden: g.orden, origen_grupo_id: g.id }]);
    for (const t of pend) {
      if (db.tareas.some(x => x.grupo_id === nuevo.id && x.origen_tarea_id === t.id)) continue;
      insertar('tareas', [{ titulo: t.titulo, notas: t.notas, grupo_id: nuevo.id, persona: t.persona, prioridad: t.prioridad, etiquetas: t.etiquetas, orden: t.orden, origen_tarea_id: t.id }]);
      n++;
    }
  }
  return n;
}

function estadoInicialDemo(s) {
  const futuro = new Date(s.t0) > new Date();
  difundir({ tabla: 'setup_estado', tipo: 'INSERT', vieja: null, nueva: { setup_id: s.id, estado: futuro ? 'pendiente' : 'esperando', validacion: 'pendiente', validacion_en: null, validacion_motivo: null, checkpoint_en: null, activado_en: null, resultado: null, resultado_en: null, ambiguo: false, mfe_r: null, mae_r: null, pasos: [], evaluado_hasta: null, agente_version: 'demo', actualizado_en: ahora() } });
  difundir({ tabla: 'setup_eventos', tipo: 'INSERT', vieja: null, nueva: { id: uid(), setup_id: s.id, tipo: 'aviso', clave: 'aviso:demo', en: ahora(), texto: 'Modo demo: no hay agente leyendo MT5, así que el estado de este setup no avanzará.', imagen: null, datos: null, creado_en: ahora() } });
}

// ---- tiempo real y presencia ----
export function suscribir(alCambio, alEstado) {
  oyentes.add(alCambio);
  setTimeout(() => alEstado('vivo'), 0);
  return () => oyentes.delete(alCambio);
}

const pares = new Map();
let miPresencia = null;
let alPresencia = null;
function recibirPresencia(m) { pares.set(m.usuarioId, { ...m.estado, usuarioId: m.usuarioId, ts: Date.now() }); avisarPresencia(); }
function avisarPresencia() {
  if (!alPresencia) return;
  const vivos = [...pares.values()].filter(p => Date.now() - p.ts < 25000);
  if (miPresencia) vivos.push(miPresencia);
  alPresencia(vivos);
}
export const presencia = {
  unirse(usuarioId, estado, alCambio) {
    miPresencia = { ...estado, usuarioId };
    alPresencia = alCambio;
    const latir = () => { canal?.postMessage({ tipo: 'presencia', usuarioId, estado: miPresencia }); avisarPresencia(); };
    latir();
    setInterval(latir, 10000);
  },
  actualizar(estado) {
    miPresencia = { ...miPresencia, ...estado };
    canal?.postMessage({ tipo: 'presencia', usuarioId: miPresencia.usuarioId, estado: miPresencia });
    avisarPresencia();
  },
};

export const archivos = {
  subir(ruta, blob) { blobs.set(ruta, URL.createObjectURL(blob)); return ruta; },
  url(ruta) {
    return blobs.get(ruta) || 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="340"><rect width="100%" height="100%" fill="#12121a"/>' +
      '<text x="50%" y="50%" fill="#6b6b8a" font-family="Segoe UI" font-size="18" text-anchor="middle">Imagen no disponible en el modo demo</text></svg>');
  },
};

// ---- datos de ejemplo (sacados del panel «AGENDA JOSE · HÉCTOR» y de la nota del vault) ----
function semillas() {
  const J = uid(), H = uid();
  const sem = semanaActual();
  const d = hoy();
  const lunes = lunesDe(sem);
  const t = (dia, hora) => madridAInstante(dia, hora).toISOString();
  const base = { creado_en: ahora(), actualizado_en: ahora(), borrado_en: null };
  const et = (nombre, color, ambito) => ({ id: uid(), nombre, color, ambito, creado_por: J, creado_en: ahora(), borrado_en: null });
  const E = {
    trading: et('Trading', '#10b981', 'todas'), estudio: et('Estudio', '#3b82f6', 'tareas'),
    codigo: et('Código', '#6366f1', 'tareas'), bots: et('Bots', '#ec4899', 'tareas'), personal: et('Personal', '#f59e0b', 'tareas'),
    ipc: et('IPC', '#ef4444', 'mercado'), crudo: et('Crudo', '#f97316', 'mercado'), fed: et('Fed', '#6366f1', 'mercado'),
    retesteo: et('Retesteo', '#3b82f6', 'setups'), barrido: et('Barrido', '#ec4899', 'setups'),
  };
  const gJ = { id: uid(), semana: sem, nombre: 'JUEVES JOSE LUIS', persona: J, prioridad: 'ALTA', color: '#f59e0b', orden: 0, origen_grupo_id: null, creado_por: J, ...base };
  const gH = { id: uid(), semana: sem, nombre: 'HÉCTOR', persona: H, prioridad: 'ALTA', color: '#6366f1', orden: 1, origen_grupo_id: null, creado_por: J, ...base };
  const tarea = (titulo, g, orden, extra = {}) => ({ id: uid(), titulo, notas: null, grupo_id: g?.id || null, persona: g?.persona || null, prioridad: null, etiquetas: [], tipo: 'puntual', fecha: null, hora: null, duracion_min: null, rrule: null, hasta: null, orden, origen_tarea_id: null, creado_por: J, ...base, ...extra });
  const tJ = ['METER BOTS MT5', 'VERIFICAR', 'BUSCAR OPCIONES PARA LA APP', 'LISTAR', 'APP DESCARGABLE', 'EDITAR FLUIDEZ Y COMPORTAMIENTO VENTANAS', 'INVESTIGAR VENTANA DE IA PROPIA', 'MAKEAR GRÁFICO EN VIVO Y MONTECARLO', 'INVESTIGAR OBSIDIAN EN LA TERMINAL MULTIAGENTE', 'TRADEAR'].map((x, i) => tarea(x, gJ, i));
  const tH = ['EXTRAER CUADERNOS', 'CREAR GEMA', 'EXTRAER Y GUARDAR TODA LA INFO PERSONALIDADES', 'SOLUCIONAR PROBLEMA CAMBIAR DE GRÁFICA', 'TEST DE FUNCIONAMIENTO Y CREAR INSTRUCCIONES', 'COMPROBAR QUE TODO FUNCIONA CORRECTAMENTE Y PONER A OPERAR AL BOT CON REAL', 'EXTRACCIÓN FUENTES ALEJO ROLLS', 'GUARDAR OBSIDIAN ARCHIVOS'].map((x, i) => tarea(x, gH, i));
  const calendario = [
    tarea('Revisión pre-Londres', null, 0, { persona: J, etiquetas: [E.trading.id], tipo: 'permanente', fecha: sumarDias(d, -20), hora: '08:30:00', duracion_min: 30, rrule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR' }),
    tarea('Gimnasio', null, 1, { persona: J, etiquetas: [E.personal.id], tipo: 'periodica', fecha: sumarDias(d, -14), hora: '19:00:00', duracion_min: 60, rrule: 'FREQ=WEEKLY;BYDAY=TU,TH' }),
    tarea('Curso de order flow', null, 2, { persona: H, etiquetas: [E.estudio.id], tipo: 'temporal', fecha: sumarDias(d, -2), hasta: sumarDias(d, 12), hora: '18:00:00', duracion_min: 45, rrule: 'FREQ=DAILY' }),
    tarea('Revisión semanal del vault', null, 3, { persona: J, etiquetas: [E.estudio.id], tipo: 'periodica', fecha: sumarDias(lunes, 6), hora: '11:00:00', duracion_min: 60, rrule: 'FREQ=WEEKLY;BYDAY=SU' }),
    tarea('Llamada Jose · Héctor', null, 4, { etiquetas: [E.personal.id], fecha: d, hora: '17:00:00', duracion_min: 30 }),
    tarea('Subir cleanupPeriodDays a 365 en ~/.claude/settings.json', null, 5, { etiquetas: [E.codigo.id], prioridad: 'URGENTE' }),
    tarea('Rotar y sacar las API keys de INICIAR CEREBRO.bat', null, 6, { etiquetas: [E.codigo.id] }),
    tarea('Mapa de liquidaciones REALES SOL/BTC/ETH', null, 7, { etiquetas: [E.bots.id] }),
  ];
  const hechas = [[tJ[0], J], [tJ[1], J], [tJ[9], J], [tH[0], H], [tH[1], H]].map(([x, quien]) => ({ tarea_id: x.id, ocurrencia: '1970-01-01', hecha_por: quien, hecha_en: ahora() }));
  hechas.push({ tarea_id: calendario[0].id, ocurrencia: sumarDias(d, -1), hecha_por: J, hecha_en: ahora() });
  const herr = (nombre, categoria, gastado, presupuesto, estado, color, orden) => ({ id: uid(), nombre, categoria, gastado, presupuesto, moneda: '€', estado, color, orden, actualizado_en: ahora(), borrado_en: null });
  const anot = (titulo, fecha_hora, importancia, simbolos, etiquetas, antes, despues = null) => ({ id: uid(), titulo, fecha_hora, importancia, pais: 'EE. UU.', simbolos, etiquetas, antes, despues, serie_id: null, creado_por: J, ...base });
  const a1 = anot('IPC EE. UU. (septiembre)', t(sumarDias(lunes, 2), '14:30'), 3, ['XAUUSD', 'US100.cash', 'EURUSD'], [E.ipc.id], 'Esperamos dato caliente. El oro viene débil antes del dato; si sale por encima, buscamos ventas en el retesteo.');
  const a2 = anot('Inventarios de crudo (EIA)', t(sumarDias(lunes, 2), '16:30'), 2, ['USOIL.cash'], [E.crudo.id], 'Tres semanas seguidas de salidas; el mercado espera otra.');
  const a3 = anot('Actas de la Fed', t(sumarDias(lunes, -5), '20:00'), 2, ['US100.cash', 'XAUUSD'], [E.fed.id], 'Tono duro esperado.', 'Más suaves de lo esperado: el Nasdaq subió en la primera hora.');
  const a4 = anot('Nóminas no agrícolas', t(sumarDias(lunes, -3), '14:30'), 3, ['XAUUSD', 'EURUSD'], [E.ipc.id], 'Sin sesgo claro; esperamos al primer minuto.');
  const simb = (simbolo, nombre, mercado, digitos, verificado = 'ok') => ({ simbolo, nombre, mercado, digitos, descripcion: null, verificado, verificado_en: verificado === 'ok' ? ahora() : null, activo: true, anadido_por: J, anadido_en: ahora() });
  const setup = (o) => ({ id: uid(), condiciones: null, etiquetas: [], anotacion_id: null, anulado_en: null, anulado_motivo: null, ...base, creado_en: o.t0, ...o });
  const s1 = setup({ simbolo: 'BTCUSD', direccion: 'largo', entrada: 62000, sl: 61500, tp: 63000, temporalidad: '4h', t0: t(sumarDias(d, -1), '10:00'), modo: 'tiempo', porque: 'Barrido de los mínimos de Asia y vuelta al rango. Entrada en el retesteo del mínimo barrido.', etiquetas: [E.barrido.id], autor: J });
  const s2 = setup({ simbolo: 'XAUUSD', direccion: 'corto', entrada: 2650, sl: 2662, tp: 2626, temporalidad: '1h', t0: t(sumarDias(d, -1), '15:00'), modo: 'tiempo', porque: 'Rechazo en la resistencia diaria antes del IPC.', anotacion_id: a1.id, autor: H });
  const s3 = setup({ simbolo: 'US100.cash', direccion: 'largo', entrada: 18500, sl: 18440, tp: 18650, temporalidad: '15m', t0: t(d, '15:30'), modo: 'condiciones', autor: H, etiquetas: [E.retesteo.id],
    condiciones: { plantilla: 'recupera_retestea_compra', pasos: [{ tipo: 'toca', nivel: 18500 }, { tipo: 'cierre', tf: '15m', lado: 'encima', nivel: 18500 }, { tipo: 'toca_desde', nivel: 18500, desde: 'arriba' }, { tipo: 'manual', texto: 'Volumen creciente en el retesteo' }], limite: t(d, '21:00') },
    porque: 'Recupera el nivel de la apertura de Nueva York; compra en el retesteo desde arriba.' });
  const s4 = setup({ simbolo: 'USOIL.cash', direccion: 'corto', entrada: 74.2, sl: 74.9, tp: 72.8, temporalidad: '4h', t0: t(sumarDias(d, -3), '16:30'), modo: 'tiempo', anotacion_id: a2.id, porque: 'Esperábamos salida de inventarios y caída.', autor: J });
  const s5 = setup({ simbolo: 'EURUSD', direccion: 'corto', entrada: 1.0855, sl: 1.0880, tp: 1.0800, temporalidad: '4h', t0: t(sumarDias(d, 1), '10:00'), modo: 'tiempo', porque: 'Doble techo en 4h; validación mañana en la apertura de Londres.', autor: J });
  const est = (s, o) => ({ setup_id: s.id, estado: 'pendiente', validacion: 'pendiente', validacion_en: null, validacion_motivo: null, checkpoint_en: null, activado_en: null, resultado: null, resultado_en: null, ambiguo: false, mfe_r: null, mae_r: null, pasos: [], evaluado_hasta: ahora(), agente_version: 'demo', actualizado_en: ahora(), ...o });
  const mas = (iso, min) => new Date(new Date(iso).getTime() + min * 60000).toISOString();
  const ev = (s, tipo, clave, en, texto) => ({ id: uid(), setup_id: s.id, tipo, clave, en, texto, imagen: null, datos: null, creado_en: ahora() });
  return {
    perfiles: [
      { id: J, email: 'jose@demo', nombre: 'Jose Luis', color: '#f59e0b', jornada_inicio: '09:00:00', jornada_fin: null, creado_en: ahora() },
      { id: H, email: 'hector@demo', nombre: 'Héctor', color: '#6366f1', jornada_inicio: '09:00:00', jornada_fin: null, creado_en: ahora() },
    ],
    etiquetas: Object.values(E),
    grupos: [gJ, gH],
    tareas: [...tJ, ...tH, ...calendario],
    tareas_hechas: hechas,
    notas_semana: [
      { semana: sem, slot: 1, texto: 'Agenda semanal Jose Luis & Héctor.', editado_por: J, editado_en: ahora() },
      { semana: sem, slot: 2, texto: 'Marca cada tarea al completarla; el progreso se reparte por igual.', editado_por: J, editado_en: ahora() },
    ],
    herramientas: [
      herr('Claude Code Pro', 'Desarrollo / IA Principal', 20, 20, 'ACTIVO', '#f97316', 0),
      herr('ChatGPT', 'IA Research', 0, 0, 'GRATIS', '#10b981', 1),
      herr('OpenClaw + Kimi K2.5', 'Agente IA Autónomo', 0, 40, 'PENDIENTE SETUP', '#6366f1', 2),
      herr('Lovable', 'Dashboard / Frontend', 0, 25, 'PENDIENTE DECISIÓN', '#ec4899', 3),
    ],
    anotaciones: [a1, a2, a3, a4],
    comentarios: [
      { id: uid(), entidad: 'setup', entidad_id: s1.id, autor: H, texto: 'La entrada fue justo en el mínimo barrido. Buen setup.', creado_en: ahora(), editado_en: null, borrado_en: null },
      { id: uid(), entidad: 'anotacion', entidad_id: a1.id, autor: H, texto: 'Ojo: si el dato sale en línea, el oro puede rebotar fuerte.', creado_en: ahora(), editado_en: null, borrado_en: null },
    ],
    simbolos: [simb('BTCUSD', 'BTC', 'cripto', 2), simb('XAUUSD', 'Oro', 'materias', 2), simb('EURUSD', 'EURUSD', 'forex', 5), simb('US100.cash', 'NAS100', 'indices', 2), simb('USOIL.cash', 'WTI', 'materias', 2), simb('GBPJPY', 'GBPJPY', 'forex', 3, 'pendiente')],
    setups: [s1, s2, s3, s4, s5],
    setup_marcas: [],
    setup_capturas: [],
    setup_estado: [
      est(s1, { estado: 'ganado', validacion: 'valido', validacion_en: mas(s1.t0, 240), validacion_motivo: 'TP dentro de la temporalidad', checkpoint_en: mas(s1.t0, 240), activado_en: mas(s1.t0, 12), resultado: 'ganado', resultado_en: mas(s1.t0, 185), mfe_r: 2.1, mae_r: 0.4 }),
      est(s2, { estado: 'en_curso', validacion: 'fallo', validacion_en: mas(s2.t0, 60), validacion_motivo: 'fallo en temporalidad', checkpoint_en: mas(s2.t0, 60), activado_en: mas(s2.t0, 7), mfe_r: 0.8, mae_r: 0.6 }),
      est(s3, { estado: 'esperando', pasos: [{ paso: 1, en: mas(s3.t0, 4) }] }),
      est(s4, { estado: 'perdido', validacion: 'fallo', validacion_en: mas(s4.t0, 98), validacion_motivo: 'tocó SL', checkpoint_en: mas(s4.t0, 240), activado_en: mas(s4.t0, 3), resultado: 'perdido', resultado_en: mas(s4.t0, 98), mfe_r: 0.3, mae_r: 1 }),
      est(s5, {}),
    ],
    setup_eventos: [
      ev(s1, 'activacion', 'activacion', mas(s1.t0, 12), 'Entrada tocada a las ' + new Date(mas(s1.t0, 12)).toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' }) + '.'),
      ev(s1, 'resolucion', 'resolucion', mas(s1.t0, 185), 'TP tocado. Ganado.'),
      ev(s1, 'temporalidad', 'temporalidad', mas(s1.t0, 240), 'A las 4 h: TP alcanzado antes del plazo. Válido.'),
      ev(s2, 'activacion', 'activacion', mas(s2.t0, 7), 'Entrada tocada.'),
      ev(s2, 'temporalidad', 'temporalidad', mas(s2.t0, 60), 'A la 1 h: ni TP ni SL. Fallo en temporalidad. Sigue en curso.'),
      ev(s3, 'paso', 'paso:1', mas(s3.t0, 4), 'Paso 1 cumplido: toca 18.500.'),
      ev(s4, 'activacion', 'activacion', mas(s4.t0, 3), 'Entrada tocada.'),
      ev(s4, 'resolucion', 'resolucion', mas(s4.t0, 98), 'SL tocado. Perdido.'),
      ev(s4, 'temporalidad', 'temporalidad', mas(s4.t0, 240), 'A las 4 h: SL tocado antes del plazo. Fallo.'),
    ],
    agente_estado: [],
  };
}
