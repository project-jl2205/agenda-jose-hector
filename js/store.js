// Copia en memoria de TODAS las tablas (son pocas filas: dos personas) que se mantiene al día con
// el tiempo real. Las vistas leen de aquí y se re-pintan con store.on(). Las escrituras son
// optimistas: se ven al instante y, si el servidor las rechaza, se deshacen y se lanza el error.
//
//   store.filas(t, filtro?)  · store.vivas(t, filtro?) (sin borrado_en) · store.fila(t, clave)
//   store.on(['tareas','grupos'], cb) -> quitar
//   store.insertar(t, fila|filas) · store.actualizar(t, claveObj, cambios) · store.upsert(t, fila, onConflict)
//   store.quitar(t, claveObj) (interruptores) · store.papelera(t, id) · store.restaurar(t, id)
//   store.usuario() perfil propio · store.perfil(id) · store.etiquetas(ambito) · store.hecha(tareaId, ocurrencia)

import * as db from './db.js';

export const TABLAS = [
  'perfiles', 'etiquetas', 'grupos', 'tareas', 'tareas_hechas', 'notas_semana', 'herramientas',
  'anotaciones', 'comentarios', 'simbolos', 'setups', 'setup_marcas', 'setup_capturas',
  'setup_estado', 'setup_eventos', 'agente_estado',
];
const PK = {
  tareas_hechas: ['tarea_id', 'ocurrencia'], notas_semana: ['semana', 'slot'],
  setup_marcas: ['setup_id', 'paso'], setup_estado: ['setup_id'], simbolos: ['simbolo'],
};
const pk = t => PK[t] || ['id'];
export const claveDe = (tabla, fila) => pk(tabla).map(k => String(fila?.[k])).join('|');
const claveObjDe = (tabla, fila) => Object.fromEntries(pk(tabla).map(k => [k, fila[k]]));

const datos = new Map(TABLAS.map(t => [t, new Map()]));
const oyentes = new Map(TABLAS.map(t => [t, new Set()]));
let pendientes = new Set();
let programado = false;
let usuarioId = null;

function emitir(tablas) {
  tablas.forEach(t => pendientes.add(t));
  if (programado) return;
  programado = true;
  const lanzar = () => {
    programado = false;
    const cambiadas = pendientes;
    pendientes = new Set();
    const avisar = new Map();
    for (const t of cambiadas) for (const cb of oyentes.get(t) || []) {
      if (!avisar.has(cb)) avisar.set(cb, new Set());
      avisar.get(cb).add(t);
    }
    for (const [cb, ts] of avisar) {
      try { cb(ts); } catch (e) { console.error('Error al re-pintar', e); }
    }
  };
  (typeof requestAnimationFrame === 'function' && !document.hidden) ? requestAnimationFrame(lanzar) : setTimeout(lanzar, 0);
}

function poner(tabla, fila) { datos.get(tabla).set(claveDe(tabla, fila), fila); }

export const store = {
  async cargarTodo() {
    const res = await Promise.all(TABLAS.map(t => db.seleccionarTodo(t).then(f => [t, f])));
    for (const [t, filas] of res) {
      const m = new Map();
      for (const f of filas) m.set(claveDe(t, f), f);
      datos.set(t, m);
    }
    emitir(TABLAS);
  },

  /** Cambio llegado por tiempo real (o eco de lo propio). */
  aplicar({ tabla, tipo, nueva, vieja }) {
    if (!datos.has(tabla)) return;
    if (tipo === 'DELETE') datos.get(tabla).delete(claveDe(tabla, vieja));
    else poner(tabla, nueva);
    emitir([tabla]);
  },

  filas(tabla, filtro) {
    const arr = [...(datos.get(tabla)?.values() || [])];
    return filtro ? arr.filter(filtro) : arr;
  },
  vivas(tabla, filtro) { return this.filas(tabla, f => !f.borrado_en && (!filtro || filtro(f))); },
  fila(tabla, clave) {
    const k = clave && typeof clave === 'object' ? claveDe(tabla, clave) : String(clave);
    return datos.get(tabla)?.get(k);
  },

  on(tablas, cb) {
    const lista = Array.isArray(tablas) ? tablas : [tablas];
    lista.forEach(t => oyentes.get(t)?.add(cb));
    return () => lista.forEach(t => oyentes.get(t)?.delete(cb));
  },

  // ---- escrituras optimistas ----
  async insertar(tabla, filaOFilas) {
    const filas = (Array.isArray(filaOFilas) ? filaOFilas : [filaOFilas]).map(f => {
      const r = { ...f };
      if (pk(tabla)[0] === 'id' && !r.id && tabla !== 'agente_estado') r.id = crypto.randomUUID();
      return r;
    });
    filas.forEach(f => poner(tabla, f));
    emitir([tabla]);
    try {
      const res = await db.insertar(tabla, filas);
      (res || []).forEach(f => poner(tabla, f));
      emitir([tabla]);
      return Array.isArray(filaOFilas) ? res : res?.[0];
    } catch (e) {
      filas.forEach(f => datos.get(tabla).delete(claveDe(tabla, f)));
      emitir([tabla]);
      throw e;
    }
  },

  async actualizar(tabla, claveObj, cambios) {
    const k = claveDe(tabla, claveObj);
    const antes = datos.get(tabla).get(k);
    if (antes) datos.get(tabla).set(k, { ...antes, ...cambios });
    emitir([tabla]);
    try {
      const res = await db.actualizar(tabla, claveObj, cambios);
      if (res?.[0]) poner(tabla, res[0]);
      emitir([tabla]);
      return res?.[0];
    } catch (e) {
      if (antes) datos.get(tabla).set(k, antes);
      emitir([tabla]);
      throw e;
    }
  },

  async upsert(tabla, fila, onConflict = pk(tabla).join(',')) {
    const k = claveDe(tabla, fila);
    const antes = datos.get(tabla).get(k);
    poner(tabla, { ...(antes || {}), ...fila });
    emitir([tabla]);
    try {
      const res = await db.upsert(tabla, [fila], onConflict);
      if (res?.[0]) poner(tabla, res[0]);
      emitir([tabla]);
      return res?.[0];
    } catch (e) {
      if (antes) datos.get(tabla).set(k, antes); else datos.get(tabla).delete(k);
      emitir([tabla]);
      throw e;
    }
  },

  async quitar(tabla, claveObj) {
    const k = claveDe(tabla, claveObj);
    const antes = datos.get(tabla).get(k);
    datos.get(tabla).delete(k);
    emitir([tabla]);
    try { await db.borrar(tabla, claveObjDe(tabla, claveObj)); }
    catch (e) { if (antes) datos.get(tabla).set(k, antes); emitir([tabla]); throw e; }
  },

  papelera(tabla, id) { return this.actualizar(tabla, { id }, { borrado_en: new Date().toISOString() }); },
  restaurar(tabla, id) { return this.actualizar(tabla, { id }, { borrado_en: null }); },

  // ---- atajos ----
  ponerUsuario(id) { usuarioId = id; },
  usuarioId: () => usuarioId,
  usuario() { return usuarioId ? datos.get('perfiles').get(String(usuarioId)) : null; },
  perfil(id) { return id ? datos.get('perfiles').get(String(id)) : null; },
  perfiles() { return this.filas('perfiles').sort((a, b) => a.nombre.localeCompare(b.nombre)); },
  /** Etiquetas vivas de un ámbito (más las de 'todas'). */
  etiquetas(ambito) {
    return this.vivas('etiquetas', e => !ambito || e.ambito === 'todas' || e.ambito === ambito)
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  },
  hecha(tareaId, ocurrencia = '1970-01-01') { return this.fila('tareas_hechas', { tarea_id: tareaId, ocurrencia }); },
  /** Todo lo de un setup junto. */
  setup(id) {
    const setup = this.fila('setups', id);
    if (!setup) return null;
    return {
      setup,
      estado: this.fila('setup_estado', id) || null,
      eventos: this.filas('setup_eventos', e => e.setup_id === id).sort((a, b) => (a.en || '').localeCompare(b.en || '')),
      capturas: this.vivas('setup_capturas', c => c.setup_id === id).sort((a, b) => (a.subida_en || '~').localeCompare(b.subida_en || '~')),
      marcas: this.filas('setup_marcas', m => m.setup_id === id),
      comentarios: this.comentarios('setup', id),
    };
  },
  comentarios(entidad, id) {
    return this.vivas('comentarios', c => c.entidad === entidad && c.entidad_id === id)
      .sort((a, b) => (a.creado_en || '~').localeCompare(b.creado_en || '~'));
  },
};
