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

const PK = { tareas_hechas: ['tarea_id', 'ocurrencia'], notas_semana: ['semana', 'slot'], setup_marcas: ['setup_id', 'paso'], setup_estado: ['setup_id'], simbolos: ['simbolo'], dias_calendario: ['fecha'], noticias_ocultas: ['usuario', 'noticia_id'], claude_fichas: ['proyecto'] };
const pk = t => PK[t] || ['id'];
const mismaClave = (t, a, b) => pk(t).every(k => String(a[k]) === String(b[k]));

function guardar() { try { localStorage.setItem(CLAVE, JSON.stringify(db)); } catch { /* sin almacenamiento */ } }
function cargar() { try { return JSON.parse(localStorage.getItem(CLAVE) || 'null'); } catch { return null; } }
const usuario = () => { try { return sessionStorage.getItem(SESION); } catch { return null; } };

export async function iniciar() {
  db = cargar() || semillas();
  if (!db.operaciones) {   // una demo guardada de antes de las operaciones (tanda 4): se le añaden las de ejemplo
    const J = (db.perfiles || []).find(p => p.email === 'jose@demo')?.id;
    db.operaciones = J ? OPS_DEMO.map(d => opDemo(d, J)) : [];
    db.operacion_dibujos = [];
  }
  if (!db.claude_fichas) db.claude_fichas = FICHAS_DEMO.map(f => ({ ...f, actualizado_en: ahora() }));   // (tanda de Prompts)
  if (!db.sesiones_claude) db.sesiones_claude = sesionesDemo(db.perfiles || []);   // (sesiones de Claude en Hoy, SQL 007)
  guardar();
  prepararArchivosDemo();
  if ('BroadcastChannel' in window) {
    canal = new BroadcastChannel('agenda-jh-demo');
    canal.onmessage = ev => {
      const m = ev.data;
      if (m?.tipo === 'cambio') { aplicarLocal(m.cambio); if (esMio(m.cambio)) oyentes.forEach(cb => cb(m.cambio)); }
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

// lo privado (noticias quitadas, notas de mercado) solo le llega a su dueño, como hace la RLS de Supabase en tiempo real
const PRIVADAS = { noticias_ocultas: 'usuario', notas_mercado: 'autor', sesiones_claude: 'dueno' };
const esMio = ({ tabla, nueva, vieja }) => !PRIVADAS[tabla] || (nueva || vieja)?.[PRIVADAS[tabla]] === usuario();

function difundir(cambio) {
  aplicarLocal(cambio);
  if (esMio(cambio)) oyentes.forEach(cb => cb(cambio));
  canal?.postMessage({ tipo: 'cambio', cambio });
}

// El "agente" del demo solo deja los latidos al día (no lee MT5 ni el Calendario Alpha): setups y noticias clave.
function latidoAgente() {
  const comunes = { latido: ahora(), version: 'demo', ultimo_error: null, ultimo_error_en: null };
  const filas = [
    { id: 'setups', ...comunes, mt5_ok: true, reloj_ok: true, detalle: { nota: 'Modo demo: no hay agente leyendo MT5.' } },
    { id: 'noticias', ...comunes, mt5_ok: null, reloj_ok: null, detalle: { calendario_ok: true, comprobadas_en: ahora(), nota: 'Modo demo: noticias de ejemplo.' } },
  ];
  for (const fila of filas) {
    const existe = (db.agente_estado || []).some(f => f.id === fila.id);
    difundir({ tabla: 'agente_estado', tipo: existe ? 'UPDATE' : 'INSERT', nueva: fila, vieja: fila });
  }
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
  tareas: u => ({ claude: null, notas: null, grupo_id: null, persona: null, prioridad: null, etiquetas: [], tipo: 'puntual', fecha: null, hora: null, duracion_min: null, rrule: null, hasta: null, orden: 0, origen_tarea_id: null, color: null, es_evento: false, excepciones: [], creado_por: u, creado_en: ahora(), actualizado_en: ahora(), borrado_en: null }),
  tareas_hechas: u => ({ ocurrencia: '1970-01-01', hecha_por: u, hecha_en: ahora() }),
  notas_semana: u => ({ texto: '', editado_por: u, editado_en: ahora() }),
  herramientas: () => ({ categoria: null, gastado: 0, presupuesto: 0, moneda: '€', estado: 'ACTIVO', color: '#6366f1', orden: 0, actualizado_en: ahora(), borrado_en: null }),
  anotaciones: u => ({ importancia: 2, pais: null, simbolos: [], etiquetas: [], antes: null, despues: null, serie_id: null, creado_por: u, creado_en: ahora(), actualizado_en: ahora(), borrado_en: null }),
  comentarios: u => ({ autor: u, creado_en: ahora(), editado_en: null, borrado_en: null }),
  simbolos: u => ({ nombre: null, mercado: null, digitos: null, descripcion: null, verificado: 'pendiente', verificado_en: null, activo: true, anadido_por: u, anadido_en: ahora() }),
  setups: u => ({ tps: [], resultado: null, resultado_tp: null, resultado_precio: null, resultado_entrada: null, resultado_sl: null, resultado_salidas: null, resultado_nota: null, resultado_por: null, resultado_en: null, modo: 'tiempo', condiciones: null, porque: null, etiquetas: [], anotacion_id: null, autor: u, creado_en: ahora(), actualizado_en: ahora(), anulado_en: null, anulado_motivo: null, borrado_en: null }),
  setup_marcas: u => ({ marcado_por: u, marcado_en: ahora() }),
  setup_capturas: u => ({ subida_por: u, subida_en: ahora(), borrado_en: null }),
  dias_calendario: u => ({ importancia: 0, color: null, nota: null, editado_por: u, editado_en: ahora() }),
  noticias_ocultas: u => ({ usuario: u, oculta: true, oculta_en: ahora() }),
  notas_mercado: u => ({ autor: u, creada_en: ahora(), editada_en: null, borrado_en: null }),
  operacion_dibujos: u => ({ autor: u, texto: null, creado_en: ahora(), actualizado_en: ahora(), borrado_en: null }),
};

function validar(tabla, f, antes) {
  if (tabla === 'tareas') {
    // la parte «para Claude» (SQL 006): vacía o un objeto con su proyecto
    if (f.claude != null && !(typeof f.claude === 'object' && !Array.isArray(f.claude) && typeof f.claude.comp === 'string')) throw new Error('Hay un dato que no es válido.');
    if (f.tipo !== 'puntual' && (!f.rrule || !f.fecha)) throw new Error('Una tarea que se repite necesita fecha de inicio y repetición.');
    if (f.tipo === 'temporal' && !f.hasta) throw new Error('Una tarea temporal necesita fecha de fin.');
  }
  if (tabla === 'setups') {
    const e = +f.entrada, s = +f.sl, t = +f.tp;
    const ok = f.direccion === 'largo' ? s < e && e < t : t < e && e < s;
    const tpsOk = (f.tps || []).every(x => (f.direccion === 'largo' ? +x > e : +x < e));
    if (!ok || !tpsOk) throw new Error('Los niveles no cuadran: en un largo SL < entrada < TP; en un corto TP < entrada < SL.');
    if (antes) {
      const congelados = ['simbolo', 'direccion', 'entrada', 'sl', 'tp', 'tps', 'temporalidad', 't0', 'modo', 'condiciones'];
      const cambia = congelados.some(k => JSON.stringify(antes[k]) !== JSON.stringify(f[k]));
      const limite = Math.max(new Date(antes.t0).getTime(), new Date(antes.creado_en).getTime() + 600000);
      if (cambia && Date.now() > limite) throw new Error('El setup ya está en juego: sus niveles, hora y condiciones no se pueden cambiar. Anúlalo y crea otro.');
    }
    // cada uno toca solo sus setups (como los permisos autor_* de la base real)
    if ((antes ? antes.autor : f.autor) !== usuario() || f.autor !== usuario()) throw new Error('No tienes permiso para esto.');
  }
  // pasos «a mano» y capturas: solo el autor del setup
  if (['setup_marcas', 'setup_capturas'].includes(tabla) && (db.setups || []).find(s => s.id === f.setup_id)?.autor !== usuario()) throw new Error('No tienes permiso para esto.');
  if (tabla === 'comentarios' && antes && antes.autor !== usuario()) throw new Error('No tienes permiso para esto.');
  // noticias quitadas: cada uno solo las suyas; las noticias clave solo las escribe el agente (como la RLS del SQL 003)
  if (tabla === 'noticias_ocultas' && f.usuario !== usuario()) throw new Error('No tienes permiso para esto.');
  if (tabla === 'noticias_clave') throw new Error('No tienes permiso para esto.');
  // operaciones (SQL 005): las publica el PC de Jose Luis; desde la web su autor solo toca la papelera
  if (tabla === 'operaciones') {
    if (!antes) throw new Error('No tienes permiso para esto.');
    const cambia = Object.keys({ ...antes, ...f }).some(k => !['borrado_en', 'actualizado_en'].includes(k) && JSON.stringify(antes[k]) !== JSON.stringify(f[k]));
    if (cambia || antes.autor !== usuario()) throw new Error('No tienes permiso para esto.');
  }
  // dibujos sobre una operación: cada uno los suyos; tipo, puntos, color y texto como los CHECK del SQL 005
  if (tabla === 'operacion_dibujos') {
    if (f.autor !== usuario() || (antes && antes.autor !== usuario())) throw new Error('No tienes permiso para esto.');
    const n = { linea: 2, flecha: 2, cuadro: 2, texto: 1 }[f.tipo];
    const ok = n && Array.isArray(f.puntos) && f.puntos.length === n && f.puntos.every(q => q && typeof q.t === 'number' && typeof q.p === 'number')
      && /^#[0-9a-f]{6}$/i.test(f.color || '') && (f.texto == null || String(f.texto).length <= 140);
    if (!ok) throw new Error('Hay un dato que no es válido.');
    if (!antes && (db.operaciones || []).find(o => o.id === f.operacion_id)?.borrado_en !== null) throw new Error('No tienes permiso para esto.');
  }
  // sesiones de Claude (SQL 007): las sube el PC de cada uno; desde la web su dueño solo puede «quitarla de Hoy»
  if (tabla === 'sesiones_claude') {
    if (!antes) throw new Error('No tienes permiso para esto.');
    const cambia = Object.keys({ ...antes, ...f }).some(k => !['quitada_en', 'actualizado_en'].includes(k) && JSON.stringify(antes[k]) !== JSON.stringify(f[k]));
    if (cambia || antes.dueno !== usuario()) throw new Error('No tienes permiso para esto.');
  }
  if (tabla === 'claude_fichas' && (!/^[a-z0-9-]{1,30}$/.test(f.proyecto || '') || !/^#[0-9a-f]{6}$/i.test(f.color || ''))) throw new Error('Hay un dato que no es válido.');
  // notas de mercado: cada uno solo las suyas, y nunca vacías ni de más de 20.000 caracteres (SQL 004)
  if (tabla === 'notas_mercado') {
    if (f.autor !== usuario() || (antes && antes.autor !== usuario())) throw new Error('No tienes permiso para esto.');
    if (!String(f.texto ?? '').trim() || String(f.texto).length > 20000) throw new Error('Una nota no puede quedar vacía ni pasar de 20.000 caracteres.');
  }
}

export function seleccionar(tabla) {
  const filas = db[tabla] || [];
  return structuredClone(PRIVADAS[tabla] ? filas.filter(f => f[PRIVADAS[tabla]] === usuario()) : filas);
}

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
  if (tabla === 'notas_semana' || tabla === 'dias_calendario') { nueva.editado_en = ahora(); nueva.editado_por = usuario(); }
  if (tabla === 'operacion_dibujos') { nueva.autor = antes.autor; nueva.operacion_id = antes.operacion_id; nueva.creado_en = antes.creado_en; }
  if (tabla === 'notas_mercado') {   // como el disparador del SQL 004: la hora de la nota y su dueño no cambian al corregirla
    nueva.autor = antes.autor;
    nueva.creada_en = antes.creada_en;
    nueva.editada_en = nueva.texto !== antes.texto ? ahora() : antes.editada_en;
  }
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
  if (vieja && tabla === 'setup_marcas') validar(tabla, vieja, vieja);
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
  // dos tareas «para Claude» (</> en Semana; su prompt sale en la pestaña Prompts del PC) y una idea suelta en la bandeja
  tJ[2].claude = { comp: 'app', nota: '', manual: null, enviado: null, n: 2 };
  tJ[5].claude = { comp: 'agenda', nota: 'al cambiar rápido de pestaña, la página nueva entra a tirones', manual: null, enviado: null, n: 1 };
  const tC = [tarea('Arreglar la calculadora de lotes del Terminal', null, 0, { claude: { comp: 'terminal', nota: 'propone un lote que no cuadra con el riesgo en %', manual: null, enviado: null, n: 3 } })];
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
  // resultados marcados a mano (el agente ya no decide)
  Object.assign(s1, { resultado: 'ganado', resultado_tp: 1, resultado_por: J, resultado_en: mas(s1.t0, 185) });
  Object.assign(s4, { resultado: 'perdido', resultado_tp: null, resultado_por: J, resultado_en: mas(s4.t0, 98) });
  const ev = (s, tipo, clave, en, texto) => ({ id: uid(), setup_id: s.id, tipo, clave, en, texto, imagen: null, datos: null, creado_en: ahora() });
  return {
    perfiles: [
      { id: J, email: 'jose@demo', nombre: 'Jose Luis', color: '#f59e0b', jornada_inicio: '09:00:00', jornada_fin: null, creado_en: ahora() },
      { id: H, email: 'hector@demo', nombre: 'Héctor', color: '#6366f1', jornada_inicio: '09:00:00', jornada_fin: null, creado_en: ahora() },
    ],
    etiquetas: Object.values(E),
    grupos: [gJ, gH],
    tareas: [...tJ, ...tH, ...tC, ...calendario],
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
    // noticias clave de ejemplo, con el mismo formato que las reales (las sube el agente desde el Calendario Alpha:
    // agente/noticias.py)
    noticias_clave: [
      { id: 'vdemo1', value_id: 1, event_id: 'demo-ipc', pais: 'US', titulo: 'IPC EE. UU.', detalle: 'Prev. 3,0 % · Ant. 2,9 %', color: '#ff453a', hora: t(sumarDias(lunes, 2), '14:30'), sin_hora: false, actualizado_en: ahora() },
      { id: 'vdemo2', value_id: 2, event_id: 'demo-bce', pais: 'EU', titulo: 'Tipos de interés · BCE', detalle: 'Cons. 2,00 % · Ant. 2,00 %', color: '#ff453a', hora: t(sumarDias(lunes, 3), '14:15'), sin_hora: false, actualizado_en: ahora() },
      { id: 'vdemo3', value_id: 3, event_id: 'demo-nfp', pais: 'US', titulo: 'Nóminas no agrícolas EE. UU.', detalle: 'Prev. 120 K · Ant. 98 K', color: '#ff453a', hora: t(sumarDias(lunes, 4), '14:30'), sin_hora: false, actualizado_en: ahora() },
    ],
    dias_calendario: [],
    noticias_ocultas: [],
    operaciones: OPS_DEMO.map(d => opDemo(d, J)),
    operacion_dibujos: [],
    claude_fichas: FICHAS_DEMO.map(f => ({ ...f, actualizado_en: ahora() })),
  };
}

// sesiones de Claude DE EJEMPLO (SQL 007; las de verdad las sube el PC de cada uno al acabar cada turno de Claude): títulos y
// textos INVENTADOS, porque este código es público. De ayer, de hoy y de hace unos días; una ficha que espera el OK, una de
// Héctor (Jose no la ve: es privada) y una ya quitada de Hoy.
function sesionesDemo(perfiles) {
  const J = perfiles.find(p => p.email === 'jose@demo')?.id, H = perfiles.find(p => p.email === 'hector@demo')?.id;
  if (!J) return [];
  const hace = h => new Date(Date.now() - h * 36e5).toISOString();
  const ayer = h => { const d = new Date(); d.setDate(d.getDate() - 1); d.setHours(h, 15, 0, 0); return d.toISOString(); };
  const s = (n, o) => ({ id: `s-00000000-0000-4000-8000-${String(n).padStart(12, '0')}`, dueno: J, tipo: 'sesion', grupo: null, grupo_orden: null,
    estado: null, ultimo_pedido: null, ultima_respuesta: null, pendiente: null, prompt: null, mensajes: 0, primera_en: null, quitada_en: null,
    actualizado_en: hace(0.1), ...o });
  return [
    s(1, { titulo: 'Bot de ejemplo: examen fuera de muestra', grupo: 'BOT TERMINAL', grupo_orden: 0, ultima_en: hace(0.5),
      ultimo_pedido: 'pásale el examen con los datos del año pasado', ultima_respuesta: 'Hecho: aprueba fuera de muestra. Falta probarlo unos días en papel.' }),
    s(2, { titulo: 'Agenda de ejemplo: pestaña nueva', grupo: 'AGENDA', grupo_orden: 1, ultima_en: ayer(22),
      ultimo_pedido: 'que quede centrado', ultima_respuesta: 'Centrado. Lo he probado en el PC y en el móvil.' }),
    s(3, { titulo: 'Mapa de liquidez de ejemplo', grupo: 'MAPA LIQUIDEZ', grupo_orden: 2, ultima_en: hace(24 * 3),
      ultimo_pedido: 'pon el buscador a la derecha', ultima_respuesta: 'Puesto; falta que me digas si te gusta el tamaño.' }),
    s(4, { titulo: 'Sesión suelta de ejemplo', ultima_en: ayer(11), ultimo_pedido: 'revisa el histórico del calendario',
      ultima_respuesta: 'Revisado: no falta ningún día.' }),
    s(5, { titulo: 'Sesión ya quitada de Hoy', grupo: 'AGENDA', grupo_orden: 1, ultima_en: hace(5), quitada_en: hace(4),
      ultimo_pedido: 'nada más', ultima_respuesta: 'Vale.' }),
    ...(H ? [s(6, { dueno: H, titulo: 'Sesión de Héctor (Jose no la ve)', grupo: 'AGENDA', grupo_orden: 0, ultima_en: hace(1),
      ultimo_pedido: 'mira mis setups', ultima_respuesta: 'Mirados.' })] : []),
    s(7, { id: 'f-0001', tipo: 'ficha', titulo: 'Ficha de ejemplo: arrancar algo al encender el PC', grupo: 'AGENDA', grupo_orden: 1,
      estado: 'esperando-ok', ultima_en: hace(3), pendiente: 'Falta tu sí para instalar la tarea que lo arranca al encender el PC.',
      ultima_respuesta: 'Preparado y probado a mano.', prompt: 'Modo DESPACHO (ejemplo). Lee la ficha 0001 y haz SOLO esa tarea.' }),
  ];
}

// fichas de los proyectos para los prompts, DE EJEMPLO: las de verdad van en la base (SQL 006), porque llevan rutas y puertos
// del PC de Jose Luis y este código es público
const FICHAS_DEMO = [
  { proyecto: 'terminal', nombre: 'Terminal', color: '#0a84ff', donde: 'el Terminal (en la agenda de verdad, su ficha dice dónde está)', rutas: 'la carpeta del Terminal', probar: 'pruébalo y enséñame el antes y el después.', cuidado: 'modo demo: en la agenda de verdad aquí van las reglas de este proyecto.', orden: 1 },
  { proyecto: 'agenda', nombre: 'Agenda', color: '#ff9f0a', donde: 'esta agenda', rutas: 'la carpeta de la agenda', probar: 'pruébalo con ?demo y en el móvil.', cuidado: 'modo demo: en la agenda de verdad aquí van las reglas de este proyecto.', orden: 2 },
  { proyecto: 'app', nombre: 'App Insomniac', color: '#bf5af2', donde: 'la app', rutas: 'la carpeta de la app', probar: 'compruébalo con la app abierta.', cuidado: 'modo demo: en la agenda de verdad aquí van las reglas de este proyecto.', orden: 3 },
  { proyecto: 'calendario', nombre: 'Calendario Alpha', color: '#30d158', donde: 'el Calendario Alpha', rutas: 'la carpeta del Calendario', probar: 'comprueba que sigue midiendo sin huecos.', cuidado: 'modo demo: en la agenda de verdad aquí van las reglas de este proyecto.', orden: 4 },
];

// ---- operaciones publicadas de ejemplo (en la real las sube el PC de Jose Luis: herramientas/operaciones_agenda.py) ----
// INVENTADAS (el repositorio es público: nunca capturas ni cifras reales). Las velas y la captura se generan en el
// navegador al arrancar, siempre iguales para la misma operación. Horas = «del servidor» en segundos, como en MT5.
const OPS_DEMO = [
  { id: '1000001-501', simbolo: 'USDCHFc', direccion: 'corto', base: 0.8180, paso: 0.00028, dg: 5, dias: 1.2, horas: 0.8, vol: 0.35, gana: true },
  { id: '1000001-502', simbolo: 'ETHUSD', direccion: 'corto', base: 2260, paso: 2.6, dg: 2, dias: 3.4, horas: 2.2, vol: 1, gana: true },
  { id: '1000001-503', simbolo: 'US100.cash', direccion: 'largo', base: 25200, paso: 11, dg: 2, dias: 2.3, horas: 1.1, vol: 0.5, gana: false },
  { id: '1000001-504', simbolo: 'XAUUSD', direccion: 'largo', base: 4010, paso: 1.9, dg: 2, dias: 0.6, horas: 3, vol: 0.2, gana: true },
];
function azar(semilla) {
  let a = semilla >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const tiemposDemo = d => { const t0 = Math.floor((Date.now() / 1000 - d.dias * 86400) / 300) * 300; return [t0, t0 + Math.round(d.horas * 12) * 300]; };
// velas de 5 min (15 días antes de la entrada → 12 h después de la salida) con un paseo al azar que, entre la entrada y la
// salida, va a favor (ganadora) o en contra; las de 1 h salen de juntarlas. Solo 3 días de 5 min, como guarda el Terminal.
function velasDemo(d, t0, t1) {
  const r = azar(Number(d.id.split('-')[1]) * 7919), dg = d.dg, sg = d.direccion === 'largo' ? 1 : -1, M5 = [];
  const ini = t0 - 15 * 86400, fin = t1 + 12 * 3600, n1 = Math.max(1, (t1 - t0) / 300), deriva = (d.gana ? 1 : -1) * sg * d.paso * 2.2;
  let c = d.base;
  for (let t = ini; t <= fin; t += 300) {
    const o = c, empuje = t > t0 && t <= t1 ? deriva * 6 / n1 : 0;
    c = o + d.paso * (r() - 0.5) * 2 + empuje;
    const h = Math.max(o, c) + d.paso * r() * 0.8, l = Math.min(o, c) - d.paso * r() * 0.8, rd = x => +x.toFixed(dg);
    M5.push([t, rd(o), rd(h), rd(l), rd(c)]);
  }
  const H1 = []; let cur = null;
  for (const [t, o, h, l, c2] of M5) {
    const b = Math.floor(t / 3600) * 3600;
    if (!cur || cur[0] !== b) { cur && H1.push(cur); cur = [b, o, h, l, c2]; } else { cur[2] = Math.max(cur[2], h); cur[3] = Math.min(cur[3], l); cur[4] = c2; }
  }
  cur && H1.push(cur);
  return { s: d.simbolo, digits: dg, M5: M5.filter(x => x[0] >= t0 - 3 * 86400), H1 };
}
function opDemo(d, autor) {
  const [t0, t1] = tiemposDemo(d), V = velasDemo(d, t0, t1), sg = d.direccion === 'largo' ? 1 : -1;
  const cierre = t => (V.M5.find(x => x[0] >= t) || V.M5[V.M5.length - 1])[4];
  const entrada = cierre(t0), salida = cierre(t1), mov = (salida - entrada) * sg, riesgo = Math.abs(salida - entrada) / (d.gana ? 1.6 : 1) || d.paso * 10;
  const r = +(mov / riesgo).toFixed(3), resultado = +(r * 50).toFixed(2);
  return { id: d.id, autor, cuenta: 1000001, posicion: Number(d.id.split('-')[1]), simbolo: d.simbolo, direccion: d.direccion, t_entrada: t0, t_salida: t1,
    entrada, salida, volumen: d.vol, sl0: +(entrada - sg * riesgo).toFixed(d.dg), tp0: +(entrada + sg * riesgo * 2).toFixed(d.dg), r, resultado,
    comision: +(-d.vol * 3.5).toFixed(2), swap: 0, moneda: 'USD', estado: 'cerrada', motivo: d.gana ? 'tp' : 'sl', porque: null, etiquetas: [], temporalidad: null,
    captura: `operaciones/${d.id}.svg`, velas: `operaciones/${d.id}.velas.json`, publicada_en: ahora(), borrado_en: null, actualizado_en: ahora() };
}
function capturaDemo(V, o) {   // una «captura» de ejemplo: la línea del precio alrededor de la operación, con entrada y salida
  const L = V.M5.filter(x => x[0] >= o.t_entrada - 5 * 3600 && x[0] <= o.t_salida + 3 * 3600);
  const lo = Math.min(...L.map(x => x[3]), o.sl0, o.tp0), hi = Math.max(...L.map(x => x[2]), o.sl0, o.tp0), W = 800, H = 450;
  const X = t => 30 + (t - L[0][0]) / (L[L.length - 1][0] - L[0][0]) * (W - 60), Y = p => 30 + (hi - p) / (hi - lo || 1) * (H - 60);
  const linea = (p, c) => `<line x1="30" x2="${W - 30}" y1="${Y(p).toFixed(1)}" y2="${Y(p).toFixed(1)}" stroke="${c}" stroke-dasharray="6 5" stroke-width="1.5"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="100%" height="100%" fill="#0b0b0f"/>`
    + linea(o.sl0, '#ff453a') + linea(o.tp0, '#30d158') + linea(o.entrada, '#f5f5f7')
    + `<polyline fill="none" stroke="#64d2ff" stroke-width="2" points="${L.map(x => `${X(x[0]).toFixed(1)},${Y(x[4]).toFixed(1)}`).join(' ')}"/>`
    + `<circle cx="${X(o.t_entrada).toFixed(1)}" cy="${Y(o.entrada).toFixed(1)}" r="7" fill="#f5f5f7"/><circle cx="${X(o.t_salida).toFixed(1)}" cy="${Y(o.salida).toFixed(1)}" r="7" fill="${o.resultado >= 0 ? '#30d158' : '#ff453a'}"/>`
    + `<text x="${W / 2}" y="${H - 12}" fill="#6b6b78" font-family="Inter,Segoe UI,sans-serif" font-size="15" text-anchor="middle">${o.simbolo} · captura de ejemplo (modo demo)</text></svg>`;
}
function prepararArchivosDemo() {
  for (const o of db.operaciones || []) {
    const d = OPS_DEMO.find(x => x.id === o.id); if (!d || blobs.has(o.velas)) continue;
    const V = velasDemo(d, o.t_entrada, o.t_salida);
    blobs.set(o.velas, URL.createObjectURL(new Blob([JSON.stringify(V)], { type: 'application/json' })));
    blobs.set(o.captura, URL.createObjectURL(new Blob([capturaDemo(V, o)], { type: 'image/svg+xml' })));
  }
}
