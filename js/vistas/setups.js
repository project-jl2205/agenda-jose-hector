// SETUPS — lista, formulario (niveles, temporalidad, hora de validación, modo tiempo/condiciones con
// pasos, capturas) y ficha (vuestras capturas, el resultado y los pasos que marcáis vosotros, las
// fotos del agente, comentarios, anular). El agente NO valida nada: solo hace fotos.

import { el, icono, campo, selector, modal, chip, toast, error, confirmar, pedirTexto, avatar, reemplazar, vacio, numero, comprimirImagen, verImagen } from '../ui.js';
import { hiloComentarios } from './comentarios.js';
import { estadoSetup, rConseguido, nivelTp, RESULTADOS, rDePrecio, rDeSalidas } from '../resultado.js';

const TFS = ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w'];
const MIN_TF = { '1m': 1, '5m': 5, '15m': 15, '30m': 30, '1h': 60, '4h': 240, '1d': 1440, '1w': 10080 };
const TIPOS_PASO = [['toca', 'Toca el nivel'], ['toca_desde', 'Toca el nivel viniendo desde…'], ['cierre', 'Una vela cierra encima/debajo'], ['manual', 'Lo marcamos a mano']];
const PLANTILLAS = {
  pierde_retestea_venta: { nombre: 'Pierde y retestea (venta)', pasos: (x, tf) => [{ tipo: 'toca', nivel: x }, { tipo: 'cierre', tf, lado: 'debajo', nivel: x }, { tipo: 'toca_desde', nivel: x, desde: 'abajo' }] },
  recupera_retestea_compra: { nombre: 'Recupera y retestea (compra)', pasos: (x, tf) => [{ tipo: 'toca', nivel: x }, { tipo: 'cierre', tf, lado: 'encima', nivel: x }, { tipo: 'toca_desde', nivel: x, desde: 'arriba' }] },
  rompe_retestea_compra: { nombre: 'Rompe y retestea (compra)', pasos: (x, tf) => [{ tipo: 'cierre', tf, lado: 'encima', nivel: x }, { tipo: 'toca_desde', nivel: x, desde: 'arriba' }] },
  rompe_retestea_venta: { nombre: 'Rompe y retestea (venta)', pasos: (x, tf) => [{ tipo: 'cierre', tf, lado: 'debajo', nivel: x }, { tipo: 'toca_desde', nivel: x, desde: 'abajo' }] },
};
const urls = new Map();   // ruta -> url firmada (caché de la sesión)

export function montar(cont, ctx) {
  const [a, b] = ctx.params;
  if (a === 'nuevo') return formulario(cont, ctx, null);
  if (a && b === 'editar') return formulario(cont, ctx, a);
  if (a) return ficha(cont, ctx, a);
  return lista(cont, ctx);
}

// ---- utilidades ---------------------------------------------------------------------------------
const pildora = ([texto, color]) => el('span', { class: `pill pill-${color === 'azul' ? 'gris' : color}` + (color === 'azul' ? ' pill-azul' : '') }, texto);
const pildoraEstado = s => { const e = estadoSetup(s); return pildora([e.texto, e.color]); };
const bloqueado = s => Date.now() > Math.max(new Date(s.t0).getTime(), new Date(s.creado_en || Date.now()).getTime() + 600000);
function rr(s) {
  const riesgo = Math.abs(s.entrada - s.sl);
  return riesgo ? Math.abs(s.tp - s.entrada) / riesgo : 0;
}
function digitos(store, simbolo, valor) {
  const d = store.fila('simbolos', simbolo)?.digitos;
  return d ?? (Math.abs(valor) >= 50 ? 2 : 5);
}
const precio = (store, s, v) => numero(v, digitos(store, s.simbolo, v));
async function url(ctx, ruta) {
  if (!urls.has(ruta)) urls.set(ruta, await ctx.db.archivos.url(ruta, 3600));
  return urls.get(ruta);
}
function miniatura(ctx, ruta, pie) {
  const img = el('img', { class: 'mini', alt: pie || 'imagen', loading: 'lazy' });
  const caja = el('button', { class: 'mini-caja', title: 'Ampliar', onclick: async () => verImagen(await url(ctx, ruta), pie) }, img);
  url(ctx, ruta).then(u => { img.src = u; }).catch(() => { caja.replaceChildren(el('span', { class: 'card-sub' }, 'Imagen no disponible')); });
  return caja;
}

// ---- LISTA --------------------------------------------------------------------------------------
function lista(cont, ctx) {
  const { store, F, navegar } = ctx;
  ctx.titulo('Setups');
  const f = { simbolo: '', autor: '', estado: '', tf: '', modo: '' };
  const filtros = el('div', { class: 'filtros' });
  const rejilla = el('div', { class: 'g3 setups-rejilla' });
  cont.append(
    el('div', { class: 'sec' }, el('span', {}, 'Setups'), el('div', { class: 'sec-extra' },
      el('button', { class: 'btn btn-primario', onclick: () => navegar('setups/nuevo') }, icono('mas'), ' NUEVO SETUP'))),
    filtros, rejilla);

  function pintarFiltros() {
    const simbolos = [...new Set(store.vivas('setups').map(s => s.simbolo))].sort();
    const sel = (clave, opciones) => selector(opciones, f[clave], { class: 'entrada', onchange: e => { f[clave] = e.target.value; pintar(); } });
    reemplazar(filtros,
      sel('simbolo', [['', 'Todos los símbolos'], ...simbolos]),
      sel('autor', [['', 'Los dos'], ...store.perfiles().map(p => [p.id, p.nombre])]),
      sel('estado', [['', 'Cualquier estado'], ['por_cerrar', 'Por cerrar'], ['ganado', 'Ganados'], ['perdido', 'Perdidos'], ['breakeven', 'Breakeven'], ['cerrado_antes', 'Cerrados antes'], ['parciales', 'Con parciales'], ['no_activado', 'No activados'], ['pendiente', 'Pendientes'], ['anulado', 'Anulados']]),
      sel('tf', [['', 'Toda temporalidad'], ...TFS]),
      sel('modo', [['', 'Tiempo y condiciones'], ['tiempo', 'Por tiempo'], ['condiciones', 'Por condiciones']]));
  }

  function tarjeta(s) {
    const autor = store.perfil(s.autor);
    const fotos = store.vivas('setup_capturas', c => c.setup_id === s.id).length + store.filas('setup_eventos', x => x.setup_id === s.id && x.imagen).length;
    return el('a', { class: 'card setup-card', href: `#/setups/${s.id}` },
      el('div', { class: 'setup-cab' },
        el('span', { class: 'setup-sim' }, store.fila('simbolos', s.simbolo)?.nombre || s.simbolo),
        el('span', { class: `dir dir-${s.direccion}` }, s.direccion === 'largo' ? '▲ LARGO' : '▼ CORTO'),
        chip(s.temporalidad, '#6366f1'),
        chip(s.modo === 'tiempo' ? '⏱ tiempo' : '⚙ condiciones', '#6b6b8a')),
      el('div', { class: 'niveles mono' },
        el('span', {}, el('b', {}, 'E '), precio(store, s, s.entrada)),
        el('span', { class: 'rojo' }, el('b', {}, 'SL '), precio(store, s, s.sl)),
        el('span', { class: 'verde' }, el('b', {}, 'TP '), precio(store, s, s.tp)),
        ...(s.tps || []).map((x, i) => el('span', { class: 'verde' }, el('b', {}, `TP${i + 2} `), precio(store, s, x))),
        el('span', { class: 'muted' }, `R:R 1:${numero(rr(s), 1)}`)),
      el('div', { class: 'setup-pie' },
        autor && avatar(autor, 20),
        el('span', { class: 'card-sub' }, F.fmtDiaHora(s.t0)),
        el('span', { class: 'flex1' }),
        fotos ? el('span', { class: 'card-sub' }, icono('imagen'), ` ${fotos}`) : null,
        pildoraEstado(s)));
  }

  function pintar() {
    pintarFiltros();
    const ss = store.vivas('setups').filter(s => {
      const est = estadoSetup(s).clave;
      if (f.simbolo && s.simbolo !== f.simbolo) return false;
      if (f.autor && s.autor !== f.autor) return false;
      if (f.tf && s.temporalidad !== f.tf) return false;
      if (f.modo && s.modo !== f.modo) return false;
      if (f.estado && est !== f.estado) return false;
      return true;
    }).sort((x, y) => (y.t0 || '').localeCompare(x.t0 || ''));
    reemplazar(rejilla, ss.length ? ss.map(tarjeta) : vacio('No hay setups con estos filtros. Crea el primero con «+ NUEVO SETUP».'));
  }
  const quitar = store.on(['setups', 'setup_capturas', 'setup_eventos', 'simbolos', 'perfiles'], pintar);
  pintar();
  return quitar;
}

// ---- FORMULARIO ---------------------------------------------------------------------------------
function formulario(cont, ctx, id) {
  const { store, F, navegar } = ctx;
  const s0 = id ? store.fila('setups', id) : null;
  if (id && !s0) { cont.append(vacio('Ese setup no existe.')); return; }
  const congelado = s0 ? bloqueado(s0) : false;
  ctx.titulo(s0 ? `Editar setup · ${s0.simbolo}` : 'Nuevo setup');

  const ahora = new Date(Math.ceil(Date.now() / 300000) * 300000);
  const t0 = s0 ? F.instanteAMadrid(s0.t0) : F.instanteAMadrid(ahora);
  const est = {
    autor: s0?.autor || store.usuarioId(),
    tps: (s0?.tps || []).map(String),   // TP2, TP3… (el TP1 es «tp», el que vigila el agente)
    dir: s0?.direccion || null,   // 'largo' (compra) | 'corto' (venta)
    tf: s0?.temporalidad || '4h',
    modo: s0?.modo || 'tiempo',
    pasos: structuredClone(s0?.condiciones?.pasos || []),
    plantilla: s0?.condiciones?.plantilla || null,
    etiquetas: new Set(s0?.etiquetas || []),
    capturas: [],   // { blob, url }
  };

  const simbolo = selector([], s0?.simbolo || '', { class: 'entrada' });
  const pintarSimbolos = () => {
    const actual = simbolo.value || s0?.simbolo || '';
    const ss = store.filas('simbolos', x => x.activo || x.simbolo === actual).sort((p, q) => p.simbolo.localeCompare(q.simbolo));
    simbolo.replaceChildren(el('option', { value: '' }, 'Elige símbolo…'),
      ...ss.map(x => el('option', { value: x.simbolo, selected: x.simbolo === actual ? 'selected' : null },
        `${x.nombre && x.nombre !== x.simbolo ? `${x.nombre} (${x.simbolo})` : x.simbolo}${x.verificado === 'no_existe' ? ' — no existe en MT5' : x.verificado === 'pendiente' ? ' — sin verificar' : ''}`)));
  };
  pintarSimbolos();
  const entrada = el('input', { type: 'number', step: 'any', inputmode: 'decimal', value: s0?.entrada ?? '' });
  const sl = el('input', { type: 'number', step: 'any', inputmode: 'decimal', value: s0?.sl ?? '' });
  const tp = el('input', { type: 'number', step: 'any', inputmode: 'decimal', value: s0?.tp ?? '' });
  const resumenNiveles = el('div', { class: 'resumen-niveles' });
  const fecha = el('input', { type: 'date', value: t0.dia });
  const hora = el('input', { type: 'time', value: t0.hora });
  const autorCaja = el('div', { class: 'segmentos' });
  const tpsCaja = el('div', { class: 'tps-extra' });
  const dirCaja = el('div', { class: 'segmentos' });
  const tfCaja = el('div', { class: 'segmentos' });
  const modoCaja = el('div', { class: 'segmentos' });
  const modoAyuda = el('div', { class: 'ayuda' });
  const pasosCaja = el('div', { class: 'pasos' });
  const plantillasCaja = el('div', { class: 'chips' });
  const limiteF = el('input', { type: 'date', value: s0?.condiciones?.limite ? F.instanteAMadrid(s0.condiciones.limite).dia : '' });
  const limiteH = el('input', { type: 'time', value: s0?.condiciones?.limite ? F.instanteAMadrid(s0.condiciones.limite).hora : '' });
  const bloqueCond = el('div', { class: 'card bloque-cond' });
  const porque = el('textarea', { rows: 4, value: s0?.porque || '', placeholder: 'El porqué de la operación: qué veis, dónde, por qué ahí.' });
  const etiquetasCaja = el('div', { class: 'chips' });
  const anotacion = selector([], s0?.anotacion_id || '', { class: 'entrada' });
  const capturasCaja = el('div', { class: 'capturas-previa' });
  const fichero = el('input', { type: 'file', accept: 'image/*', multiple: true, class: 'oculto' });

  function pintarAutor() {
    reemplazar(autorCaja, ...store.perfiles().map(p => el('button', {
      type: 'button', class: est.autor === p.id ? 'activo' : '', onclick: () => { est.autor = p.id; pintarAutor(); },
    }, p.nombre)));
  }
  function pintarTps() {
    reemplazar(tpsCaja,
      ...est.tps.map((v, i) => el('div', { class: 'fila-rep' },
        campo(`Objetivo ${i + 2} (TP${i + 2})`, el('input', { type: 'number', step: 'any', inputmode: 'decimal', value: v, disabled: congelado || null, oninput: e => { est.tps[i] = e.target.value; pintarNiveles(); } })),
        !congelado && el('button', { type: 'button', class: 'row-btn del', title: 'Quitar este TP', onclick: () => { est.tps.splice(i, 1); pintarTps(); pintarNiveles(); } }, '×'))),
      !congelado && el('button', { type: 'button', class: 'add-st-btn', onclick: () => { est.tps.push(''); pintarTps(); } }, '+ Añadir otro TP'));
  }
  function tpsMal() {
    const e = +entrada.value;
    return est.tps.findIndex(v => v === '' || Number.isNaN(+v) || (est.dir === 'largo' ? +v <= e : +v >= e));
  }
  function pintarDir() {
    reemplazar(dirCaja,
      el('button', { type: 'button', class: est.dir === 'largo' ? 'activo' : '', onclick: () => { est.dir = 'largo'; pintarDir(); pintarNiveles(); } }, '▲ COMPRA'),
      el('button', { type: 'button', class: est.dir === 'corto' ? 'activo' : '', onclick: () => { est.dir = 'corto'; pintarDir(); pintarNiveles(); } }, '▼ VENTA'));
  }
  function pintarNiveles() {
    const e = +entrada.value, s = +sl.value, t = +tp.value;
    const dir = est.dir;
    if (!dir) { reemplazar(resumenNiveles, el('span', { class: 'muted' }, 'Elige si es compra o venta.')); return; }
    if (!entrada.value || !sl.value || !tp.value) { reemplazar(resumenNiveles, el('span', { class: 'muted' }, dir === 'largo' ? 'Compra: SL < entrada < TP.' : 'Venta: TP < entrada < SL.')); return; }
    const ok = dir === 'largo' ? s < e && e < t : t < e && e < s;
    const malo = tpsMal();
    if (ok && malo >= 0) { reemplazar(resumenNiveles, el('span', { class: 'rojo' }, `El TP${malo + 2} tiene que estar ${dir === 'largo' ? 'por encima' : 'por debajo'} de la entrada.`)); return; }
    reemplazar(resumenNiveles,
      el('span', { class: `dir dir-${dir}` }, dir === 'largo' ? '▲ LARGO' : '▼ CORTO'),
      ok ? el('span', { class: 'mono' }, `R:R 1:${numero(Math.abs(t - e) / Math.abs(e - s), 2)} · riesgo ${numero(Math.abs(e - s), 5)}`)
         : el('span', { class: 'rojo' }, dir === 'largo' ? 'En una compra: SL < entrada < TP' : 'En una venta: TP < entrada < SL'));
  }
  [entrada, sl, tp].forEach(i => i.addEventListener('input', pintarNiveles));

  function pintarTf() {
    reemplazar(tfCaja, ...TFS.map(t => el('button', { type: 'button', class: est.tf === t ? 'activo' : '', onclick: () => { est.tf = t; pintarTf(); pintarModo(); } }, t)));
  }
  function pintarModo() {
    reemplazar(modoCaja,
      el('button', { type: 'button', class: est.modo === 'tiempo' ? 'activo' : '', onclick: () => { est.modo = 'tiempo'; pintarModo(); } }, '⏱ POR TIEMPO'),
      el('button', { type: 'button', class: est.modo === 'condiciones' ? 'activo' : '', onclick: () => { est.modo = 'condiciones'; pintarModo(); } }, '⚙ POR CONDICIONES'));
    modoAyuda.textContent = est.modo === 'tiempo'
      ? `Cuando pasen ${est.tf} (en horas de mercado) desde la hora de validación, lo cerráis vosotros en la ficha: GANADO (con el TP al que llegó), PERDIDO, BREAKEVEN o NO ACTIVADO.`
      : 'Marcáis vosotros cada paso en la ficha, en orden, y al final el resultado: GANADO (con su TP), PERDIDO, BREAKEVEN o NO ACTIVADO.';
    bloqueCond.style.display = est.modo === 'condiciones' ? '' : 'none';
  }

  function pintarPasos() {
    reemplazar(plantillasCaja, ...Object.entries(PLANTILLAS).map(([clave, p]) => el('button', {
      type: 'button', class: `chip ${est.plantilla === clave ? '' : 'apagado'}`, style: { '--c': '#ec4899' },
      onclick: async () => {
        const x = await pedirTexto(p.nombre, entrada.value || '', { etiqueta: 'Nivel X (precio)', aceptar: 'Usar' });
        if (x === null || x === '' || Number.isNaN(+x)) return;
        est.plantilla = clave;
        est.pasos = p.pasos(+x, ['1m', '5m', '15m', '30m', '1h'].includes(est.tf) ? est.tf : '1h');
        if (!entrada.value) { entrada.value = x; pintarNiveles(); }
        pintarPasos();
      },
    }, p.nombre)));
    const filaPaso = (p, i) => {
      const tipo = selector(TIPOS_PASO, p.tipo, { class: 'entrada', onchange: e => { est.pasos[i] = { tipo: e.target.value, ...(e.target.value === 'manual' ? { texto: '' } : { nivel: p.nivel ?? (entrada.value ? +entrada.value : null) }) }; if (e.target.value === 'cierre') Object.assign(est.pasos[i], { tf: '1h', lado: 'encima' }); if (e.target.value === 'toca_desde') est.pasos[i].desde = 'abajo'; pintarPasos(); } });
      const num = (k) => el('input', { type: 'number', step: 'any', class: 'entrada', placeholder: 'nivel', value: p[k] ?? '', oninput: e => { est.pasos[i][k] = e.target.value === '' ? null : +e.target.value; } });
      const params = p.tipo === 'toca' ? [num('nivel')]
        : p.tipo === 'toca_desde' ? [num('nivel'), selector([['abajo', 'desde abajo'], ['arriba', 'desde arriba']], p.desde, { class: 'entrada', onchange: e => { est.pasos[i].desde = e.target.value; } })]
        : p.tipo === 'cierre' ? [selector(['1m', '5m', '15m', '30m', '1h', '4h', '1d'], p.tf, { class: 'entrada', onchange: e => { est.pasos[i].tf = e.target.value; } }),
            selector([['encima', 'cierra encima de'], ['debajo', 'cierra debajo de']], p.lado, { class: 'entrada', onchange: e => { est.pasos[i].lado = e.target.value; } }), num('nivel')]
        : [el('input', { type: 'text', class: 'entrada', placeholder: 'Qué hay que comprobar (lo marcáis vosotros)', value: p.texto || '', oninput: e => { est.pasos[i].texto = e.target.value; } })];
      return el('div', { class: 'paso' },
        el('span', { class: 'paso-num' }, String(i + 1)), tipo, ...params,
        el('button', { type: 'button', class: 'row-btn', title: 'Subir', disabled: i === 0, onclick: () => { [est.pasos[i - 1], est.pasos[i]] = [est.pasos[i], est.pasos[i - 1]]; pintarPasos(); } }, '↑'),
        el('button', { type: 'button', class: 'row-btn del', title: 'Quitar', onclick: () => { est.pasos.splice(i, 1); est.plantilla = null; pintarPasos(); } }, '×'));
    };
    reemplazar(pasosCaja, est.pasos.length ? est.pasos.map(filaPaso) : el('div', { class: 'card-sub' }, 'Sin pasos. Usa una plantilla o añade pasos.'));
  }

  function pintarEtiquetas() {
    reemplazar(etiquetasCaja, ...store.etiquetas('setups').map(e => chip(e.nombre, e.color, {
      role: 'button', tabindex: 0, class: `chip ${est.etiquetas.has(e.id) ? '' : 'apagado'}`,
      onclick: () => { est.etiquetas.has(e.id) ? est.etiquetas.delete(e.id) : est.etiquetas.add(e.id); pintarEtiquetas(); },
    })), el('button', { type: 'button', class: 'chip', style: { '--c': '#6b6b8a' }, onclick: async () => {
      const nombre = await pedirTexto('Nueva etiqueta de setups', '', { etiqueta: 'Nombre (p. ej. Retesteo, Barrido, Ruptura)', aceptar: 'Crear' });
      if (!nombre) return;
      try { const n = await store.insertar('etiquetas', { nombre, ambito: 'setups', color: '#ec4899' }); est.etiquetas.add(n.id); pintarEtiquetas(); } catch (e) { error(e); }
    } }, '+ etiqueta'));
  }

  function pintarAnotaciones() {
    const ref = F.madridAInstante(fecha.value || F.hoy(), hora.value || '00:00').getTime();
    const cerca = store.vivas('anotaciones', a => Math.abs(new Date(a.fecha_hora).getTime() - ref) < 4 * 86400000 || a.id === s0?.anotacion_id || a.id === est.eventoNuevo)
      .sort((p, q) => p.fecha_hora.localeCompare(q.fecha_hora));
    const actual = anotacion.value || s0?.anotacion_id || '';
    anotacion.replaceChildren(el('option', { value: '' }, 'Ninguna'),
      ...cerca.map(a => el('option', { value: a.id, selected: a.id === actual ? 'selected' : null }, `${F.fmtDiaHora(a.fecha_hora)} · ${a.titulo}`)));
  }
  // escribir un evento nuevo desde aquí: se crea en Mercado y queda ligado al setup
  function nuevoEvento() {
    const titulo = el('input', { placeholder: 'IPC EE. UU., inventarios de crudo, Fed…' });
    const dia = el('input', { type: 'date', value: fecha.value || F.hoy() });
    const hh = el('input', { type: 'time', value: hora.value || '14:30' });
    let importancia = 2;
    const imp = el('div', { class: 'segmentos' });
    const pintarImp = () => reemplazar(imp, ...[1, 2, 3].map(n => el('button', { type: 'button', class: importancia === n ? 'activo' : '', onclick: () => { importancia = n; pintarImp(); } }, '★'.repeat(n))));
    pintarImp();
    modal({
      titulo: 'NUEVO EVENTO DE MERCADO', ancho: 460,
      cuerpo: el('div', {}, campo('Evento', titulo),
        el('div', { class: 'fila-campos' }, campo('Día', dia), campo('Hora (Madrid)', hh)),
        el('div', { class: 'field' }, el('label', {}, 'Importancia'), imp),
        el('div', { class: 'card-sub' }, 'Se guarda también en Mercado, donde luego podéis escribir el antes y el después.')),
      botones: [{ texto: 'Cancelar' }, { texto: 'CREAR Y LIGAR', tipo: 'primario', accion: async () => {
        if (!titulo.value.trim()) { toast('Escribe el evento.', 'err'); return false; }
        if (!dia.value || !hh.value) { toast('Pon el día y la hora.', 'err'); return false; }
        try {
          const n = await store.insertar('anotaciones', {
            titulo: titulo.value.trim(), fecha_hora: F.madridAInstante(dia.value, hh.value).toISOString(), importancia,
            simbolos: simbolo.value ? [simbolo.value] : [], etiquetas: [], creado_por: store.usuarioId(),
          });
          est.eventoNuevo = n.id;
          pintarAnotaciones();
          anotacion.value = n.id;
          toast('Evento creado y ligado');
        } catch (e) { error(e); return false; }
      } }],
    });
    setTimeout(() => titulo.focus(), 50);
  }
  fecha.addEventListener('change', pintarAnotaciones);
  hora.addEventListener('change', pintarAnotaciones);

  // capturas: fichero, cámara del móvil o pegar (Ctrl+V)
  async function anadirImagenes(ficheros) {
    for (const f of ficheros) {
      if (!f.type.startsWith('image/')) continue;
      try { const blob = await comprimirImagen(f); est.capturas.push({ blob, url: URL.createObjectURL(blob) }); }
      catch (e) { error(e); }
    }
    pintarCapturas();
  }
  function pintarCapturas() {
    reemplazar(capturasCaja,
      ...est.capturas.map((c, i) => el('div', { class: 'previa' }, el('img', { src: c.url, alt: 'captura' }),
        el('button', { type: 'button', class: 'row-btn del', onclick: () => { URL.revokeObjectURL(c.url); est.capturas.splice(i, 1); pintarCapturas(); } }, '×'))),
      el('button', { type: 'button', class: 'add-captura', onclick: () => fichero.click() }, icono('imagen'), ' Añadir captura', el('span', { class: 'ayuda' }, 'o pégala con Ctrl+V')));
  }
  fichero.addEventListener('change', () => { anadirImagenes([...fichero.files]); fichero.value = ''; });
  const pegar = e => { const fs = [...(e.clipboardData?.files || [])]; if (fs.length) { e.preventDefault(); anadirImagenes(fs); } };
  document.addEventListener('paste', pegar);

  [simbolo, entrada, sl, tp, fecha, hora, limiteF, limiteH].forEach(i => { if (congelado) i.disabled = true; });

  cont.append(
    el('div', { class: 'sec' }, el('span', {}, s0 ? 'Editar setup' : 'Nuevo setup')),
    congelado ? el('div', { class: 'aviso-candado' }, icono('candado'), ' Este setup ya está en juego: sus niveles, hora y condiciones están congelados para que el winrate sea honesto. Puedes cambiar el porqué, las etiquetas y la anotación, o anularlo.') : '',
    el('div', { class: 'form-setup' },
      el('div', { class: 'card' },
        el('div', { class: 'fila-campos' },
          campo('Símbolo (nombre en MT5)', el('div', { class: 'fila-rep' }, simbolo,
            !congelado && el('button', { type: 'button', class: 'btn btn-peq', onclick: () => nuevoSimbolo(store).then(s => { if (s) { pintarSimbolos(); simbolo.value = s; } }) }, '+')))),
        el('div', { class: 'field' }, el('label', {}, 'Quién lo ha hecho'), autorCaja),
        el('div', { class: 'field' }, el('label', {}, 'Compra o venta'), dirCaja),
        el('div', { class: 'fila-campos' }, campo('Entrada', entrada), campo('Stop (SL)', sl), campo('Objetivo (TP)', tp)),
        tpsCaja,
        resumenNiveles,
        el('div', { class: 'field' }, el('label', {}, 'Temporalidad del setup'), tfCaja),
        el('div', { class: 'fila-campos' }, campo('Día de validación', fecha), campo('Hora de validación (Madrid)', hora)),
        el('div', { class: 'field' }, el('label', {}, 'Cómo se valida'), modoCaja, modoAyuda)),
      bloqueCond,
      el('div', { class: 'card' },
        campo('Porqué', porque),
        el('div', { class: 'field' }, el('label', {}, 'Etiquetas'), etiquetasCaja),
        campo('Evento de mercado ligado', el('div', { class: 'fila-rep' }, anotacion,
          el('button', { type: 'button', class: 'btn btn-peq', title: 'Escribir un evento nuevo', onclick: nuevoEvento }, '+'))),
        !s0 && el('div', { class: 'field' }, el('label', {}, 'Vuestra captura del setup dibujado'), capturasCaja, fichero))),
    el('div', { class: 'acciones-form' },
      el('button', { class: 'btn', onclick: () => history.back() }, 'Cancelar'),
      el('button', { class: 'btn btn-primario', onclick: guardar }, s0 ? 'GUARDAR CAMBIOS' : 'GUARDAR SETUP')));

  bloqueCond.append(
    el('div', { class: 'card-lbl' }, 'Condiciones (en orden)'),
    el('div', { class: 'field' }, el('label', {}, 'Plantillas'), plantillasCaja),
    pasosCaja,
    !congelado && el('button', { type: 'button', class: 'add-st-btn', onclick: () => { est.pasos.push({ tipo: 'toca', nivel: entrada.value ? +entrada.value : null }); est.plantilla = null; pintarPasos(); } }, '+ Añadir paso'),
    el('div', { class: 'fila-campos', style: { marginTop: '12px' } }, campo('Hora límite: día (opcional)', limiteF), campo('Hora límite: hora', limiteH)));
  if (congelado) bloqueCond.querySelectorAll('button, input, select').forEach(n => { n.disabled = true; });

  pintarAutor(); pintarTps(); pintarDir(); pintarNiveles(); pintarTf(); pintarModo(); pintarPasos(); pintarEtiquetas(); pintarAnotaciones(); pintarCapturas();
  if (congelado) { dirCaja.querySelectorAll('button').forEach(b => { b.disabled = true; }); tfCaja.querySelectorAll('button').forEach(b => { b.disabled = true; }); modoCaja.querySelectorAll('button').forEach(b => { b.disabled = true; }); }

  async function guardar() {
    const datosLibres = { autor: est.autor, porque: porque.value.trim() || null, etiquetas: [...est.etiquetas], anotacion_id: anotacion.value || null };
    try {
      if (congelado) {
        await store.actualizar('setups', { id: s0.id }, datosLibres);
        toast('Guardado');
        return navegar(`setups/${s0.id}`);
      }
      if (!simbolo.value) return toast('Elige el símbolo.', 'err');
      const dir = est.dir;
      if (!dir) return toast('Elige si es compra o venta.', 'err');
      if (!entrada.value || !sl.value || !tp.value) return toast('Faltan entrada, SL o TP.', 'err');
      const e = +entrada.value, s = +sl.value, t = +tp.value;
      if (!(dir === 'largo' ? s < e && e < t : t < e && e < s)) return toast(dir === 'largo' ? 'En una compra: SL < entrada < TP.' : 'En una venta: TP < entrada < SL.', 'err');
      const malo = tpsMal();
      if (malo >= 0) return toast(`Revisa el TP${malo + 2}: tiene que estar ${dir === 'largo' ? 'por encima' : 'por debajo'} de la entrada.`, 'err');
      if (!fecha.value || !hora.value) return toast('Pon el día y la hora de validación.', 'err');
      let condiciones = null;
      if (est.modo === 'condiciones') {
        if (!est.pasos.length) return toast('Añade al menos un paso.', 'err');
        for (const [i, p] of est.pasos.entries()) {
          if (p.tipo === 'manual' ? !String(p.texto || '').trim() : (p.nivel === null || p.nivel === undefined || Number.isNaN(+p.nivel))) return toast(`Al paso ${i + 1} le falta ${p.tipo === 'manual' ? 'el texto' : 'el nivel'}.`, 'err');
        }
        const limite = limiteF.value ? F.madridAInstante(limiteF.value, limiteH.value || '23:59').toISOString() : null;
        condiciones = { plantilla: est.plantilla, pasos: est.pasos.map(p => ({ ...p, ...(p.nivel !== undefined && p.nivel !== null ? { nivel: +p.nivel } : {}) })), limite };
      }
      const datos = {
        simbolo: simbolo.value, direccion: dir, entrada: e, sl: s, tp: t, tps: est.tps.map(Number), temporalidad: est.tf,
        t0: F.madridAInstante(fecha.value, hora.value).toISOString(), modo: est.modo, condiciones, ...datosLibres,
      };
      if (s0) {
        await store.actualizar('setups', { id: s0.id }, datos);
        toast('Setup actualizado');
        return navegar(`setups/${s0.id}`);
      }
      const nuevo = await store.insertar('setups', datos);
      for (const [i, c] of est.capturas.entries()) {
        const ruta = `setups/${nuevo.id}/usuario-${Date.now()}-${i}.webp`;
        try {
          await ctx.db.archivos.subir(ruta, c.blob, 'image/webp');
          await store.insertar('setup_capturas', { setup_id: nuevo.id, ruta, subida_por: store.usuarioId(), subida_en: new Date().toISOString() });
        } catch (err) { error(err, 'La captura no se pudo subir: '); }
      }
      toast('Setup guardado. El agente lo vigilará desde la hora de validación.');
      navegar(`setups/${nuevo.id}`);
    } catch (err) { error(err); }
  }

  return () => { document.removeEventListener('paste', pegar); est.capturas.forEach(c => URL.revokeObjectURL(c.url)); };
}

export async function nuevoSimbolo(store) {
  return new Promise(res => {
    let hecho = false;
    const sim = el('input', { placeholder: 'Exacto como en MT5: BTCUSD, XAUUSD, US100.cash, USOIL.cash…' });
    const alias = el('input', { placeholder: 'Opcional: NAS100, Oro, WTI…' });
    const mercado = selector([['cripto', 'Cripto'], ['forex', 'Forex'], ['materias', 'Materias primas'], ['indices', 'Índices'], ['otros', 'Otros']], 'forex');
    modal({
      titulo: 'AÑADIR SÍMBOLO', ancho: 460,
      cuerpo: el('div', {}, campo('Símbolo en MT5', sim, 'El agente comprobará que existe en tu MT5 y sacará sus decimales.'), campo('Nombre visible', alias), campo('Mercado', mercado)),
      botones: [{ texto: 'Cancelar', accion: () => { hecho = true; res(null); } }, { texto: 'AÑADIR', tipo: 'primario', accion: async () => {
        const s = sim.value.trim();
        if (!s) { toast('Escribe el símbolo.', 'err'); return false; }
        if (store.fila('simbolos', s)) { hecho = true; res(s); return; }
        await store.insertar('simbolos', { simbolo: s, nombre: alias.value.trim() || null, mercado: mercado.value });
        hecho = true; res(s);
      } }],
      alCerrar: () => { if (!hecho) res(null); },
    });
  });
}

// ---- FICHA --------------------------------------------------------------------------------------
function ficha(cont, ctx, id) {
  const { store, F, navegar } = ctx;
  const raiz = el('div', { class: 'ficha-setup' });
  const comentarios = el('div', {});
  cont.append(raiz, el('div', { class: 'sec' }, el('span', {}, 'Comentarios')), comentarios);
  const quitarHilo = hiloComentarios(comentarios, ctx, 'setup', id);

  async function anular(s) {
    const motivo = await pedirTexto('Anular setup', '', { etiqueta: 'Motivo (queda registrado; no cuenta en el winrate)', aceptar: 'Anular' });
    if (motivo === null) return;
    try { await store.actualizar('setups', { id: s.id }, { anulado_en: new Date().toISOString(), anulado_motivo: motivo || 'sin motivo' }); toast('Setup anulado'); }
    catch (e) { error(e); }
  }

  function marcarResultado(s, resultado, tp = null) {
    const antes = resultado === 'cerrado_antes';
    // precio exacto de salida: en ganado viene el del TP y en perdido el del SL; se puede corregir
    const conPrecio = ['ganado', 'perdido', 'cerrado_antes'].includes(resultado);
    const sugerido = resultado === 'ganado' ? nivelTp(s, tp || 1) : resultado === 'perdido' ? s.sl : '';
    const precioIn = el('input', { type: 'number', step: 'any', inputmode: 'decimal', value: sugerido, placeholder: 'Precio al que cerrasteis' });
    const rVivo = el('div', { class: 'card-sub mono' });
    const pintarR = () => {
      if (precioIn.value === '') { rVivo.textContent = 'Pon el precio y verás las R.'; rVivo.className = 'card-sub mono'; return; }
      const r = rDePrecio(s, precioIn.value);
      rVivo.textContent = r === null ? '' : `${r > 0 ? '+' : ''}${numero(r, 2)} R`;
      rVivo.className = `card-sub mono ${r > 0 ? 'verde' : r < 0 ? 'rojo' : ''}`;
    };
    precioIn.addEventListener('input', pintarR);
    pintarR();
    const ayudaPrecio = resultado === 'ganado' ? `Viene el del TP${(s.tps || []).length ? tp : ''}; cámbialo si salió a otro precio.`
      : resultado === 'perdido' ? 'Viene el del SL; cámbialo si salió a otro precio (deslizamiento, cierre a mano…).' : null;
    const nota = el('textarea', { rows: 3, placeholder: antes ? 'Por qué cerrasteis antes: noticia, cambio de estructura, parcial…' : 'Qué pasó (opcional): cómo se movió, qué aprendisteis…' });
    const titulo = resultado === 'ganado' && (s.tps || []).length ? `GANADO · TP${tp}` : RESULTADOS[resultado][0];
    modal({
      titulo, ancho: 480,
      cuerpo: el('div', {}, conPrecio && campo('Precio exacto de salida', precioIn, ayudaPrecio), conPrecio && rVivo, campo('Qué pasó', nota)),
      botones: [{ texto: 'Cancelar' }, { texto: 'GUARDAR RESULTADO', tipo: 'primario', accion: async () => {
        if (conPrecio && (precioIn.value === '' || Number.isNaN(+precioIn.value))) { toast('Pon el precio de salida.', 'err'); return false; }
        try {
          await store.actualizar('setups', { id: s.id }, {
            resultado, resultado_tp: tp, resultado_precio: conPrecio ? +precioIn.value : null, resultado_salidas: null, resultado_nota: nota.value.trim() || null,
            resultado_por: store.usuarioId(), resultado_en: new Date().toISOString(),
          });
          toast('Resultado guardado');
        } catch (e) { error(e); return false; }
      } }],
    });
  }
  // varias salidas, cada una con su precio exacto y el % de la posición que cerrasteis ahí
  function marcarParciales(s) {
    const rTxt = r => (r === null ? '—' : `${r > 0 ? '+' : ''}${numero(r, 2)} R`);
    const salidas = [{ precio: '', pct: '50' }, { precio: '', pct: '50' }];
    const filasCaja = el('div', { class: 'salidas' });
    const resumen = el('div', { class: 'resumen-salidas mono' });
    const atajos = [...Array.from({ length: 1 + (s.tps || []).length }, (_, i) => [`TP${i + 1}`, nivelTp(s, i + 1)]), ['Entrada', s.entrada], ['SL', s.sl]];
    let foco = 0;
    function pintarResumen() {
      const suma = salidas.reduce((t, x) => t + (+x.pct || 0), 0);
      const r = Math.abs(suma - 100) < 0.01 ? rDeSalidas(s, salidas) : null;
      resumen.className = `resumen-salidas mono ${r > 0 ? 'verde' : r < 0 ? 'rojo' : ''}`;
      resumen.textContent = Math.abs(suma - 100) >= 0.01 ? `Los % suman ${numero(suma, 1)} %: tienen que sumar 100 %.` : `Total: ${rTxt(r)}`;
    }
    function pintarFilas() {
      reemplazar(filasCaja, ...salidas.map((x, i) => {
        const precioIn = el('input', { type: 'number', step: 'any', inputmode: 'decimal', class: 'entrada', placeholder: 'Precio exacto', value: x.precio,
          onfocus: () => { foco = i; }, oninput: e => { x.precio = e.target.value; rFila.textContent = rTxt(rDePrecio(s, x.precio)); pintarResumen(); } });
        const pctIn = el('input', { type: 'number', step: 'any', min: 0, max: 100, inputmode: 'decimal', class: 'entrada pct', value: x.pct,
          oninput: e => { x.pct = e.target.value; pintarResumen(); } });
        const rFila = el('span', { class: 'mono r-fila' }, rTxt(rDePrecio(s, x.precio)));
        return el('div', { class: 'salida' }, el('span', { class: 'paso-num' }, String(i + 1)), precioIn, pctIn, el('span', { class: 'muted' }, '%'), rFila,
          salidas.length > 1 && el('button', { type: 'button', class: 'row-btn del', title: 'Quitar esta salida', onclick: () => { salidas.splice(i, 1); pintarFilas(); } }, '×'));
      }));
      pintarResumen();
    }
    pintarFilas();
    const nota = el('textarea', { rows: 2, placeholder: 'Qué pasó (opcional): por qué parcialeasteis ahí…' });
    modal({
      titulo: 'CIERRE CON PARCIALES', ancho: 560,
      cuerpo: el('div', {},
        el('div', { class: 'card-sub' }, 'Cada salida: el precio exacto y el % de la posición que cerrasteis ahí. Las R salen de la media ponderada.'),
        el('div', { class: 'chips atajos' }, el('span', { class: 'card-sub' }, 'Rellenar la salida seleccionada con:'),
          ...atajos.map(([txt, v]) => el('button', { type: 'button', class: 'chip', style: { '--c': '#6b6b8a' }, onclick: () => { salidas[foco].precio = String(v); pintarFilas(); } }, `${txt} ${precio(store, s, v)}`))),
        filasCaja,
        el('button', { type: 'button', class: 'add-st-btn', onclick: () => { const resto = 100 - salidas.reduce((t, x) => t + (+x.pct || 0), 0); salidas.push({ precio: '', pct: String(Math.max(0, +resto.toFixed(2))) }); foco = salidas.length - 1; pintarFilas(); } }, '+ Añadir otra salida'),
        resumen, campo('Qué pasó', nota)),
      botones: [{ texto: 'Cancelar' }, { texto: 'GUARDAR RESULTADO', tipo: 'primario', accion: async () => {
        const suma = salidas.reduce((t, x) => t + (+x.pct || 0), 0);
        if (salidas.some(x => x.precio === '' || Number.isNaN(+x.precio))) { toast('A alguna salida le falta el precio.', 'err'); return false; }
        if (salidas.some(x => !(+x.pct > 0))) { toast('Cada salida necesita un % mayor que 0.', 'err'); return false; }
        if (Math.abs(suma - 100) >= 0.01) { toast(`Los % suman ${numero(suma, 1)} %: tienen que sumar 100 %.`, 'err'); return false; }
        try {
          await store.actualizar('setups', { id: s.id }, {
            resultado: 'parciales', resultado_tp: null, resultado_precio: null,
            resultado_salidas: salidas.map(x => ({ precio: +x.precio, pct: +x.pct })), resultado_nota: nota.value.trim() || null,
            resultado_por: store.usuarioId(), resultado_en: new Date().toISOString(),
          });
          toast('Resultado guardado');
        } catch (e) { error(e); return false; }
      } }],
    });
  }

  async function quitarResultado(s) {
    if (!await confirmar('¿Quitar el resultado marcado? El setup vuelve a «por cerrar».', { si: 'Quitar' })) return;
    try { await store.actualizar('setups', { id: s.id }, { resultado: null, resultado_tp: null, resultado_precio: null, resultado_salidas: null, resultado_nota: null, resultado_por: null, resultado_en: null }); }
    catch (e) { error(e); }
  }

  async function marcarPaso(s, n, marcado) {
    try {
      if (marcado) await store.quitar('setup_marcas', { setup_id: s.id, paso: n });
      else await store.insertar('setup_marcas', { setup_id: s.id, paso: n, marcado_por: store.usuarioId(), marcado_en: new Date().toISOString() });
    } catch (e) { error(e); }
  }

  // fotos de «cómo quedó el mercado»: se pueden añadir cuando ya se decidió el setup (o pasó su tiempo)
  let permitidoResultado = false;
  let setupActual = null;
  const pegar = ev => {
    const fs = [...(ev.clipboardData?.files || [])].filter(f => f.type.startsWith('image/'));
    if (!fs.length || !permitidoResultado || !setupActual) return;
    ev.preventDefault();
    subirFotos(ctx, setupActual, fs, 'resultado');
  };
  document.addEventListener('paste', pegar);

  // ---- el resultado lo marcáis vosotros ----
  function resultadoCard(s) {
    const r = rConseguido(s);
    const quien = s.resultado_por && store.perfil(s.resultado_por);
    const cab = el('div', { class: 'chips' }, pildoraEstado(s),
      r !== null ? el('span', { class: `mono ${r > 0 ? 'verde' : r < 0 ? 'rojo' : 'muted'}` }, `${r > 0 ? '+' : ''}${numero(r, 2)} R`) : null);
    if (s.anulado_en) return el('div', { class: 'card estado-card' }, el('div', { class: 'card-lbl' }, 'Resultado'), cab);
    if (s.resultado) {
      return el('div', { class: 'card estado-card' }, el('div', { class: 'card-lbl' }, 'Resultado'), cab,
        ['ganado', 'perdido', 'cerrado_antes'].includes(s.resultado) && s.resultado_precio !== null && s.resultado_precio !== undefined
          && el('div', { class: 'card-sub mono' }, `Salida a ${precio(store, s, s.resultado_precio)}`),
        s.resultado === 'parciales' && el('div', { class: 'card-sub mono salidas-ficha' }, ...(s.resultado_salidas || []).map(x => {
          const r = rDePrecio(s, x.precio);
          return el('div', {}, `${numero(x.pct, 1)} % a ${precio(store, s, x.precio)} → ${r > 0 ? '+' : ''}${numero(r, 2)} R`);
        })),
        s.resultado_nota && el('div', { class: 'texto-largo nota-resultado' }, s.resultado_nota),
        el('div', { class: 'card-sub' }, `Marcado por ${quien?.nombre || '¿?'} · ${s.resultado_en ? F.fmtDiaHora(s.resultado_en) : ''}`,
          el('button', { class: 'enlace', onclick: () => quitarResultado(s) }, ' · cambiar')));
    }
    const nTps = 1 + (s.tps || []).length;
    const ganar = Array.from({ length: nTps }, (_, i) => el('button', { class: 'btn btn-peq btn-ganado', onclick: () => marcarResultado(s, 'ganado', i + 1) },
      nTps > 1 ? `GANADO · TP${i + 1} (${precio(store, s, nivelTp(s, i + 1))})` : 'GANADO (TP)'));
    return el('div', { class: 'card estado-card' },
      el('div', { class: 'card-lbl' }, 'Resultado · lo marcáis vosotros'), cab,
      el('div', { class: 'botones-resultado' }, ...ganar,
        el('button', { class: 'btn btn-peq btn-perdido', onclick: () => marcarResultado(s, 'perdido') }, 'PERDIDO (SL)'),
        el('button', { class: 'btn btn-peq btn-antes', onclick: () => marcarResultado(s, 'cerrado_antes') }, 'CERRADO ANTES'),
        el('button', { class: 'btn btn-peq btn-antes', onclick: () => marcarParciales(s) }, 'PARCIALES'),
        el('button', { class: 'btn btn-peq', onclick: () => marcarResultado(s, 'breakeven') }, 'BREAKEVEN'),
        el('button', { class: 'btn btn-peq', onclick: () => marcarResultado(s, 'no_activado') }, 'NO ACTIVADO')));
  }

  function pintar() {
    const todo = store.setup(id);
    if (!todo || todo.setup.borrado_en) { reemplazar(raiz, vacio('Ese setup no existe o está en la papelera.')); return; }
    const { setup: s, eventos, capturas, marcas } = todo;
    ctx.titulo(`Setup · ${s.simbolo} · ${s.temporalidad}`);
    const autor = store.perfil(s.autor);
    const mio = !!store.usuarioId();   // los dos pueden editar, anular o borrar cualquier setup
    const dato = (lbl, val, clase = '') => el('div', { class: 'dato' }, el('div', { class: 'card-lbl' }, lbl), el('div', { class: `dato-val ${clase}` }, val));
    const anot = s.anotacion_id && store.fila('anotaciones', s.anotacion_id);
    const etiquetas = (s.etiquetas || []).map(x => store.fila('etiquetas', x)).filter(Boolean);
    const esResultado = c => c.ruta.includes('/usuario-resultado-');
    const deSetup = capturas.filter(c => !esResultado(c));
    const deResultado = capturas.filter(esResultado);
    const finEstimado = new Date(s.t0).getTime() + MIN_TF[s.temporalidad] * 60000;
    const decidido = !!s.resultado;
    permitidoResultado = !s.anulado_en && (decidido || (s.modo === 'tiempo' && Date.now() >= finEstimado));
    setupActual = s;
    const fotosAgente = eventos.filter(ev => ev.imagen);
    reemplazar(raiz,
      el('div', { class: 'ficha-cab' },
        el('button', { class: 'row-btn', title: 'Volver', onclick: () => navegar('setups') }, icono('izq')),
        el('div', { class: 'ficha-tit' },
          el('div', { class: 'setup-cab' },
            el('span', { class: 'setup-sim grande' }, store.fila('simbolos', s.simbolo)?.nombre || s.simbolo),
            el('span', { class: `dir dir-${s.direccion}` }, s.direccion === 'largo' ? '▲ LARGO' : '▼ CORTO'),
            chip(s.temporalidad, '#6366f1'), chip(s.modo === 'tiempo' ? '⏱ por tiempo' : '⚙ por condiciones', '#6b6b8a'),
            ...etiquetas.map(x => chip(x.nombre, x.color))),
          el('div', { class: 'card-sub' }, autor && avatar(autor, 18), ` ${autor?.nombre || ''} · validación ${F.fmtDiaHora(s.t0)} (Madrid)`,
            bloqueado(s) ? el('span', { class: 'candado', title: 'Niveles congelados' }, ' ', icono('candado')) : null)),
        el('div', { class: 'ficha-acc' },
          mio && !s.anulado_en && el('button', { class: 'btn btn-peq', onclick: () => navegar(`setups/${s.id}/editar`) }, 'EDITAR'),
          mio && !s.anulado_en && el('button', { class: 'btn btn-peq btn-peligro', onclick: () => anular(s) }, 'ANULAR'),
          mio && el('button', { class: 'btn btn-peq', title: 'A la papelera', onclick: async () => {
            if (!await confirmar('¿Mandar este setup a la papelera? No contará en el winrate. Se puede restaurar desde Ajustes.', { si: 'A la papelera', peligro: true })) return;
            try { await store.papelera('setups', s.id); toast('Setup a la papelera'); navegar('setups'); } catch (x) { error(x); }
          } }, '🗑'))),
      s.anulado_en && el('div', { class: 'aviso-candado' }, `Anulado el ${F.fmtDiaHora(s.anulado_en)}: ${s.anulado_motivo || ''}`),
      el('div', { class: 'g4' },
        el('div', { class: 'card' }, dato('Entrada', precio(store, s, s.entrada), 'mono')),
        el('div', { class: 'card' }, dato('Stop (SL)', precio(store, s, s.sl), 'mono rojo')),
        el('div', { class: 'card' }, dato((s.tps || []).length ? 'Objetivo 1 (TP1)' : 'Objetivo (TP)', precio(store, s, s.tp), 'mono verde')),
        ...(s.tps || []).map((x, i) => el('div', { class: 'card' }, dato(`Objetivo ${i + 2} (TP${i + 2}) · R:R 1:${numero(Math.abs(x - s.entrada) / Math.abs(s.entrada - s.sl), 2)}`, precio(store, s, x), 'mono verde'))),
        el('div', { class: 'card' }, dato('R:R', `1:${numero(rr(s), 2)}`, 'mono'))),
      resultadoCard(s),
      s.modo === 'condiciones' && el('div', { class: 'card' },
        el('div', { class: 'card-lbl' }, 'Condiciones (en orden)'),
        el('div', { class: 'pasos-ficha' }, (s.condiciones?.pasos || []).map((p, i) => {
          const n = i + 1;
          const marca = marcas.find(m => m.paso === n);
          const quien = marca && `✓ ${store.perfil(marca.marcado_por)?.nombre || ''} · ${F.fmtDiaHora(marca.marcado_en)}`;
          return el('div', { class: `paso-ficha ${marca ? 'ok' : ''}` },
            el('span', { class: 'paso-num' }, String(n)),
            el('span', { class: 'flex1' }, textoPaso(store, s, p)),
            s.anulado_en
              ? el('span', { class: 'card-sub' }, quien || 'sin marcar')
              : el('button', { class: `btn btn-peq ${marca ? 'btn-primario' : ''}`, title: marca ? 'Clic para desmarcar' : 'Marcar como cumplido', onclick: () => marcarPaso(s, n, !!marca) }, quien || 'MARCAR'));
        })),
        s.condiciones?.limite && el('div', { class: 'card-sub' }, `Hora límite: ${F.fmtDiaHora(s.condiciones.limite)}`)),
      el('div', { class: 'g2' },
        el('div', { class: 'card' },
          el('div', { class: 'card-lbl' }, 'Vuestra captura'),
          deSetup.length ? el('div', { class: 'galeria' }, deSetup.map(c => miniatura(ctx, c.ruta, 'Captura del setup'))) : el('div', { class: 'card-sub' }, 'Sin captura.'),
          mio && !s.anulado_en && subirMas(ctx, s, 'setup')),
        el('div', { class: 'card' },
          el('div', { class: 'card-lbl' }, 'El porqué'),
          el('div', { class: 'texto-largo' }, s.porque || '—'),
          anot && el('a', { class: 'enlace-anot', href: '#/mercado' }, `Evento ligado: ${anot.titulo} · ${F.fmtDiaHora(anot.fecha_hora)}`))),
      el('div', { class: 'sec' }, el('span', {}, 'Cómo quedó el mercado · vuestras fotos')),
      el('div', { class: 'card fotos-resultado' },
        deResultado.length
          ? el('div', { class: 'galeria' }, deResultado.map(c => {
              const quien = store.perfil(c.subida_por)?.nombre || '';
              const pie = `Cómo quedó · ${quien} · ${c.subida_en ? F.fmtDiaHora(c.subida_en) : 'ahora'}`;
              return el('figure', { class: 'foto' }, miniatura(ctx, c.ruta, pie), el('figcaption', { class: 'card-sub' }, `${quien} · ${c.subida_en ? F.fmtDiaHora(c.subida_en) : 'ahora'}`));
            }))
          : el('div', { class: 'card-sub' }, permitidoResultado ? 'Aún no hay fotos de cómo quedó.' : ''),
        s.anulado_en ? null
          : permitidoResultado
            ? subirMas(ctx, s, 'resultado')
            : el('div', { class: 'card-sub' }, s.modo === 'tiempo'
                ? `Podrás añadir fotos de cómo quedó cuando pase la temporalidad (≈ ${F.fmtDiaHora(finEstimado)}).`
                : 'Podrás añadir fotos de cómo quedó cuando se cumplan o fallen las condiciones.')),
      el('div', { class: 'sec' }, el('span', {}, 'Fotos del agente · solo información')),
      fotosAgente.length
        ? el('div', { class: 'card' }, el('div', { class: 'galeria' }, fotosAgente.map(ev => el('figure', { class: 'foto' },
            miniatura(ctx, ev.imagen, `${s.simbolo} · ${F.fmtDiaHora(ev.en)} · velas de ${s.temporalidad}`),
            el('figcaption', { class: 'card-sub' }, F.fmtDiaHora(ev.en),
              ev.datos?.imagen_detalle ? el('button', { class: 'enlace', onclick: async () => verImagen(await url(ctx, ev.datos.imagen_detalle), `${s.simbolo} · detalle con velas pequeñas · ${F.fmtDiaHora(ev.en)}`) }, ' · detalle') : null)))))
        : vacio('El agente aún no ha hecho fotos de este setup.'));
  }

  const quitar = store.on(['setups', 'setup_eventos', 'setup_capturas', 'setup_marcas', 'simbolos', 'etiquetas', 'anotaciones', 'perfiles'], pintar);
  pintar();
  return () => { quitar(); quitarHilo?.(); document.removeEventListener('paste', pegar); };
}

/** Sube fotos al setup: tipo 'setup' (vuestra captura) o 'resultado' (cómo quedó el mercado). */
async function subirFotos(ctx, s, ficheros, tipo) {
  const { store } = ctx;
  let n = 0;
  for (const [i, f] of [...ficheros].entries()) {
    try {
      const blob = await comprimirImagen(f);
      const ruta = `setups/${s.id}/usuario-${tipo === 'resultado' ? 'resultado-' : ''}${Date.now()}-${i}.webp`;
      await ctx.db.archivos.subir(ruta, blob, 'image/webp');
      await store.insertar('setup_capturas', { setup_id: s.id, ruta, subida_por: store.usuarioId(), subida_en: new Date().toISOString() });
      n += 1;
    } catch (e) { error(e, 'La foto no se pudo subir: '); }
  }
  if (n) toast(n === 1 ? 'Foto añadida' : `${n} fotos añadidas`);
}

function subirMas(ctx, s, tipo = 'setup') {
  const input = el('input', { type: 'file', accept: 'image/*', multiple: true, class: 'oculto' });
  input.addEventListener('change', async () => { await subirFotos(ctx, s, input.files, tipo); input.value = ''; });
  return el('div', {}, input, el('button', { class: 'add-st-btn', onclick: () => input.click() },
    tipo === 'resultado' ? '+ Añadir foto de cómo quedó (o pégala con Ctrl+V)' : '+ Añadir captura'));
}

export function textoPaso(store, s, p) {
  const n = v => precio(store, s, v);
  if (p.tipo === 'toca') return `Toca ${n(p.nivel)}`;
  if (p.tipo === 'toca_desde') return `Toca ${n(p.nivel)} viniendo desde ${p.desde === 'abajo' ? 'abajo' : 'arriba'}`;
  if (p.tipo === 'cierre') return `Una vela de ${p.tf} cierra ${p.lado === 'encima' ? 'por encima' : 'por debajo'} de ${n(p.nivel)}`;
  if (p.tipo === 'manual') return `A mano: ${p.texto}`;
  return JSON.stringify(p);
}
