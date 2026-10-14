// Acceso a datos: Supabase (si config.js tiene URL y clave publicable) o modo demo (sin servidor).
// Las vistas NO usan este módulo directamente: van por store.js, que guarda la copia en memoria.
//
// API:
//   iniciar() -> { modo: 'supabase' | 'demo' }
//   auth.sesion() -> { usuarioId, email } | null ; auth.entrar(email, clave) ; auth.registrarse(email, clave)
//   auth.salir() ; auth.alCambiar(cb(sesion|null)) -> quitar
//   seleccionarTodo(tabla) -> filas[] ; insertar(tabla, filas[]) -> filas[]
//   actualizar(tabla, claveObj, cambios) -> filas[] ; upsert(tabla, filas[], onConflict) -> filas[]
//   borrar(tabla, claveObj)  (solo tareas_hechas y setup_marcas) ; rpc(nombre, args)
//   suscribir(alCambio({tabla, tipo, nueva, vieja}), alEstado('vivo'|'conectando'|'caido')) -> quitar
//   presencia.unirse(usuarioId, estado, alCambio(lista)) ; presencia.actualizar(estado)
//   archivos.subir(ruta, blob, tipo) ; archivos.url(ruta, segundos) -> url firmada

import { CONFIG } from './config.js';

const SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm';
const BUCKET = 'capturas';

let modo = null;
let cli = null;     // cliente supabase
let demo = null;    // módulo demo

export async function iniciar() {
  // ...?demo en la dirección = modo demo aunque haya Supabase (para probar cambios sin tocar datos reales)
  const demoForzado = new URLSearchParams(location.search).has('demo');
  if (!demoForzado && CONFIG.supabaseUrl && CONFIG.supabaseClave) {
    const { createClient } = await import(SUPABASE_JS);
    cli = createClient(CONFIG.supabaseUrl, CONFIG.supabaseClave, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'agenda-jh-sesion' },
    });
    modo = 'supabase';
  } else {
    demo = await import('./demo.js');
    await demo.iniciar();
    modo = 'demo';
  }
  return { modo };
}
export const enDemo = () => modo === 'demo';

// ---- errores en español -------------------------------------------------------------------------
function traducir(e) {
  const m = String(e?.message || e || 'Error desconocido');
  const tabla = [
    [/Invalid login credentials/i, 'Correo o contraseña incorrectos.'],
    [/Email not confirmed/i, 'Falta confirmar el correo (mira tu bandeja de entrada).'],
    [/User already registered/i, 'Ese correo ya tiene cuenta: entra con tu contraseña.'],
    [/Signups not allowed|signup.*disabled/i, 'Los registros están cerrados: la app es solo para Jose Luis y Héctor.'],
    [/Password should be at least/i, 'La contraseña es demasiado corta (mínimo 6 caracteres).'],
    [/row-level security|permission denied|42501/i, 'No tienes permiso para esto.'],
    [/Failed to fetch|NetworkError|network/i, 'Sin conexión con el servidor. Reintenta en un momento.'],
    [/duplicate key/i, 'Eso ya existe.'],
    [/violates check constraint "setups_niveles"/i, 'Los niveles no cuadran: en un largo SL < entrada < TP; en un corto TP < entrada < SL.'],
    [/violates check constraint/i, 'Hay un dato que no es válido.'],
    [/violates foreign key/i, 'Falta un dato relacionado (¿el símbolo existe?).'],
  ];
  for (const [re, txt] of tabla) if (re.test(m)) return new Error(txt);
  return new Error(m);   // p. ej. el aviso del trigger de setups, ya en español
}
const comprobar = ({ data, error }) => { if (error) throw traducir(error); return data; };

// ---- autenticación ------------------------------------------------------------------------------
export const auth = {
  async sesion() {
    if (demo) return demo.auth.sesion();
    const { data } = await cli.auth.getSession();
    const s = data?.session;
    return s ? { usuarioId: s.user.id, email: s.user.email } : null;
  },
  async entrar(email, clave) {
    if (demo) return demo.auth.entrar(email);
    comprobar(await cli.auth.signInWithPassword({ email: email.trim(), password: clave }));
  },
  async registrarse(email, clave) {
    if (demo) return demo.auth.entrar(email);
    const data = comprobar(await cli.auth.signUp({ email: email.trim(), password: clave }));
    return { confirmar: !data.session };
  },
  async salir() {
    if (demo) return demo.auth.salir();
    await cli.auth.signOut();
  },
  alCambiar(cb) {
    if (demo) return demo.auth.alCambiar(cb);
    const { data } = cli.auth.onAuthStateChange((_ev, s) => cb(s ? { usuarioId: s.user.id, email: s.user.email } : null));
    return () => data.subscription.unsubscribe();
  },
};

// ---- tablas -------------------------------------------------------------------------------------
const filtrarPorClave = (q, claveObj) => Object.entries(claveObj).reduce((acc, [k, v]) => acc.eq(k, v), q);

export async function seleccionarTodo(tabla) {
  if (demo) return demo.seleccionar(tabla);
  const filas = [];
  const PAG = 1000;
  for (let desde = 0; ; desde += PAG) {
    const data = comprobar(await cli.from(tabla).select('*').range(desde, desde + PAG - 1));
    filas.push(...data);
    if (data.length < PAG) break;
  }
  return filas;
}

export async function insertar(tabla, filas) {
  if (demo) return demo.insertar(tabla, filas);
  return comprobar(await cli.from(tabla).insert(filas).select());
}

export async function actualizar(tabla, claveObj, cambios) {
  if (demo) return demo.actualizar(tabla, claveObj, cambios);
  return comprobar(await filtrarPorClave(cli.from(tabla).update(cambios), claveObj).select());
}

export async function upsert(tabla, filas, onConflict) {
  if (demo) return demo.upsert(tabla, filas, onConflict);
  return comprobar(await cli.from(tabla).upsert(filas, { onConflict }).select());
}

export async function borrar(tabla, claveObj) {
  if (!['tareas_hechas', 'setup_marcas'].includes(tabla)) throw new Error('Esto no se borra: va a la papelera.');
  if (demo) return demo.borrar(tabla, claveObj);
  comprobar(await filtrarPorClave(cli.from(tabla).delete(), claveObj));
}

export async function rpc(nombre, args) {
  if (demo) return demo.rpc(nombre, args);
  return comprobar(await cli.rpc(nombre, args));
}

// ---- tiempo real --------------------------------------------------------------------------------
export function suscribir(alCambio, alEstado = () => {}) {
  if (demo) return demo.suscribir(alCambio, alEstado);
  alEstado('conectando');
  const canal = cli.channel('agenda-cambios')
    .on('postgres_changes', { event: '*', schema: 'public' },
      p => alCambio({ tabla: p.table, tipo: p.eventType, nueva: p.new, vieja: p.old }))
    .subscribe(estado => {
      if (estado === 'SUBSCRIBED') alEstado('vivo');
      else if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(estado)) alEstado('caido');
    });
  return () => cli.removeChannel(canal);
}

let canalPresencia = null;
export const presencia = {
  unirse(usuarioId, estado, alCambio) {
    if (demo) return demo.presencia.unirse(usuarioId, estado, alCambio);
    canalPresencia = cli.channel('agenda-presencia', { config: { presence: { key: usuarioId } } });
    canalPresencia
      .on('presence', { event: 'sync' }, () => {
        const st = canalPresencia.presenceState();
        alCambio(Object.entries(st).map(([id, metas]) => ({ usuarioId: id, ...metas[metas.length - 1] })));
      })
      .subscribe(async s => { if (s === 'SUBSCRIBED') await canalPresencia.track(estado); });
  },
  async actualizar(estado) {
    if (demo) return demo.presencia.actualizar(estado);
    if (canalPresencia) await canalPresencia.track(estado);
  },
};

// ---- ficheros (bucket privado «capturas») -------------------------------------------------------
export const archivos = {
  async subir(ruta, blob, tipo) {
    if (demo) return demo.archivos.subir(ruta, blob);
    comprobar(await cli.storage.from(BUCKET).upload(ruta, blob, { contentType: tipo, upsert: false }));
    return ruta;
  },
  async url(ruta, segundos = 3600) {
    if (demo) return demo.archivos.url(ruta);
    return comprobar(await cli.storage.from(BUCKET).createSignedUrl(ruta, segundos)).signedUrl;
  },
};
