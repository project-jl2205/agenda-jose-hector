// DÍA — línea del día al estilo Structured: tira de la semana, tareas sin hora, línea temporal con
// hora y duración, marca de «ahora», eventos de mercado y setups del día (solo lectura) y bandeja.

import { el, icono, chip, avatar, toast, error, reemplazar, vacio, modal } from '../ui.js';
import { ocurrencias, claveOcurrencia, describir } from '../recurrencia.js';
import { editarTarea } from './tarea-editor.js';
import { hiloComentarios } from './comentarios.js';
import { estadoSetup } from '../resultado.js';

const FILTRO = 'agenda-jh-filtro-dia';

export function montar(cont, ctx) {
  const { store, F, navegar, params } = ctx;
  const dia = /^\d{4}-\d{2}-\d{2}$/.test(params[0] || '') ? params[0] : F.hoy();
  const esHoy = dia === F.hoy();
  ctx.titulo(F.fmtDiaLargoStr(dia));

  let filtro = { persona: '', etiquetas: [] };
  try { filtro = { ...filtro, ...JSON.parse(localStorage.getItem(FILTRO) || '{}') }; } catch { /* nada */ }
  const guardarFiltro = () => { try { localStorage.setItem(FILTRO, JSON.stringify(filtro)); } catch { /* nada */ } };

  const cabecera = el('div', { class: 'dia-cab' });
  const tira = el('div', { class: 'tira-semana' });
  const filtros = el('div', { class: 'dia-filtros' });
  const sinHora = el('div', { class: 'sin-hora' });
  const linea = el('div', { class: 'linea-dia' });
  const bandeja = el('div', { class: 'bandeja' });
  const nuevaBandeja = el('input', { class: 'st-add-in', placeholder: 'Apuntar en la bandeja…', onkeydown: e => { if (e.key === 'Enter') { e.preventDefault(); aBandeja(); } } });
  cont.append(
    cabecera, tira, filtros,
    el('div', { class: 'dia-rejilla' },
      el('div', {},
        el('div', { class: 'sec' }, el('span', {}, 'Sin hora')), sinHora,
        el('div', { class: 'sec' }, el('span', {}, 'Línea del día')), linea),
      el('div', {},
        el('div', { class: 'sec' }, el('span', {}, 'Bandeja')),
        el('div', { class: 'card bandeja-card' },
          el('div', { class: 'st-add-row', style: { marginTop: 0, marginBottom: '10px' } }, nuevaBandeja,
            el('button', { class: 'st-add-btn2', onclick: () => aBandeja() }, '+')),
          bandeja,
          el('div', { class: 'card-sub', style: { marginTop: '10px' } }, 'Lo que no tiene día. «Programar» le pone fecha y hora.')))));

  // ---- utilidades ----
  const pasaFiltro = t => {
    if (filtro.persona && t.persona && t.persona !== filtro.persona) return false;
    if (filtro.persona && !t.persona) {
      const g = t.grupo_id && store.fila('grupos', t.grupo_id);
      if (g?.persona && g.persona !== filtro.persona) return false;
    }
    if (filtro.etiquetas.length && !filtro.etiquetas.some(id => (t.etiquetas || []).includes(id))) return false;
    return true;
  };
  const tareasDelDia = d => store.vivas('tareas', t => (t.fecha || t.rrule) && pasaFiltro(t) && ocurrencias(t, d, d).length > 0);
  const hechaEn = (t, d) => store.hecha(t.id, claveOcurrencia(t, d));
  const colorDe = t => {
    const e = (t.etiquetas || []).map(id => store.fila('etiquetas', id)).find(Boolean);
    if (e) return e.color;
    const g = t.grupo_id && store.fila('grupos', t.grupo_id);
    if (g) return g.color;
    return store.perfil(t.persona)?.color || '#6366f1';
  };

  // 💬 abre el hilo de comentarios (tarea, evento de mercado o setup) sin salir del día
  function botonComentarios(entidad, id, titulo) {
    const n = store.comentarios(entidad, id).length;
    return el('button', {
      class: `coment-btn ${n ? 'hay' : ''}`, title: n ? `${n} comentario${n === 1 ? '' : 's'}` : 'Comentar',
      onclick: e => {
        e.preventDefault(); e.stopPropagation();
        const caja = el('div', {});
        const quitarHilo = hiloComentarios(caja, ctx, entidad, id);
        modal({ titulo: `COMENTARIOS · ${titulo}`, ancho: 560, cuerpo: caja, alCerrar: quitarHilo });
      },
    }, '💬', n ? ` ${n}` : '');
  }

  async function alternar(t, d) {
    const h = hechaEn(t, d);
    try {
      if (h) await store.quitar('tareas_hechas', { tarea_id: t.id, ocurrencia: h.ocurrencia });
      else await store.insertar('tareas_hechas', { tarea_id: t.id, ocurrencia: claveOcurrencia(t, d), hecha_por: store.usuarioId(), hecha_en: new Date().toISOString() });
    } catch (e) { error(e); }
  }

  async function aBandeja() {
    const titulo = nuevaBandeja.value.trim();
    if (!titulo) return nuevaBandeja.focus();
    nuevaBandeja.value = '';
    try { await store.insertar('tareas', { titulo, tipo: 'puntual', creado_por: store.usuarioId(), orden: 0 }); }
    catch (e) { nuevaBandeja.value = titulo; error(e); }
  }

  /** Hora que propone «+ TAREA»: el inicio de tu jornada, o la próxima hora en punto si ya ha empezado. */
  function horaPropuesta() {
    const inicio = F.horaCorta(store.usuario()?.jornada_inicio || '09:00');
    if (!esHoy) return inicio;
    const ahora = F.minutosDe(F.horaDe(new Date()));
    if (ahora < F.minutosDe(inicio)) return inicio;
    const siguiente = Math.min(23, Math.floor(ahora / 60) + 1);
    return `${String(siguiente).padStart(2, '0')}:00`;
  }

  // ---- cabecera y tira de la semana ----
  function pintarCabecera() {
    reemplazar(cabecera,
      el('div', { class: 'dia-titulo' },
        el('button', { class: 'row-btn', title: 'Día anterior', onclick: () => navegar(`dia/${F.sumarDias(dia, -1)}`) }, icono('izq')),
        el('div', {}, el('div', { class: 'fire-lbl' }, esHoy ? 'Hoy' : `Semana ${F.numeroSemana(F.semanaISO(dia))}`),
          el('div', { class: 'dia-grande' }, F.fmtDiaLargoStr(dia))),
        el('button', { class: 'row-btn', title: 'Día siguiente', onclick: () => navegar(`dia/${F.sumarDias(dia, 1)}`) }, icono('der')),
        !esHoy && el('button', { class: 'btn btn-peq', onclick: () => navegar('dia') }, 'HOY')),
      el('button', { class: 'btn btn-primario', onclick: () => editarTarea(null, { fecha: dia, tipo: 'puntual', hora: horaPropuesta() }).catch(error) }, icono('mas'), ' TAREA'));
    const dias = F.diasDeSemana(F.semanaISO(dia));
    reemplazar(tira, ...dias.map((d, i) => {
      const ts = tareasDelDia(d);
      const hechas = ts.filter(t => hechaEn(t, d)).length;
      return el('a', { href: `#/dia/${d}`, class: `tira-dia ${d === dia ? 'activo' : ''} ${d === F.hoy() ? 'hoy' : ''}` },
        el('span', { class: 'tira-nombre' }, F.NOMBRES_DIA[i]),
        el('span', { class: 'tira-num' }, String(+d.slice(8))),
        el('span', { class: 'tira-cuenta' }, ts.length ? `${hechas}/${ts.length}` : '·'));
    }));
  }

  function pintarFiltros() {
    const personas = [['', 'Todos'], ...store.perfiles().map(p => [p.id, p.nombre])];
    reemplazar(filtros,
      el('div', { class: 'segmentos' }, personas.map(([id, n]) => el('button', {
        class: filtro.persona === id ? 'activo' : '', onclick: () => { filtro.persona = id; guardarFiltro(); pintar(); },
      }, n))),
      el('div', { class: 'chips' }, store.etiquetas('tareas').map(e => chip(e.nombre, e.color, {
        role: 'button', tabindex: 0, class: `chip ${filtro.etiquetas.length && !filtro.etiquetas.includes(e.id) ? 'apagado' : ''}`,
        onclick: () => {
          filtro.etiquetas = filtro.etiquetas.includes(e.id) ? filtro.etiquetas.filter(x => x !== e.id) : [...filtro.etiquetas, e.id];
          guardarFiltro(); pintar();
        },
      }))));
  }

  // ---- una tarjeta de tarea ----
  function tarjeta(t, d) {
    const h = hechaEn(t, d);
    const quien = h && store.perfil(h.hecha_por);
    const persona = store.perfil(t.persona);
    const etiquetas = (t.etiquetas || []).map(id => store.fila('etiquetas', id)).filter(Boolean);
    const g = t.grupo_id && store.fila('grupos', t.grupo_id);
    return el('div', { class: `tarea-dia ${h ? 'hecha' : ''}`, style: { '--c': colorDe(t) } },
      el('button', { class: `circulo ${h ? 'done' : ''}`, title: h ? 'Desmarcar' : 'Marcar como hecha', onclick: () => alternar(t, d) }, icono('check')),
      el('div', { class: 'tarea-dia-cuerpo', onclick: () => editarTarea(t).catch(error), title: 'Clic para editar' },
        el('div', { class: 'tarea-dia-titulo' }, t.titulo),
        el('div', { class: 'tarea-dia-meta' },
          t.rrule && el('span', { class: 'rep', title: describir(t.rrule, t.fecha) }, '↻ ', describir(t.rrule, t.fecha)),
          t.duracion_min && el('span', {}, `${t.duracion_min} min`),
          g && el('span', {}, g.nombre),
          ...etiquetas.map(e => chip(e.nombre, e.color)),
          t.prioridad && el('span', { class: `obj-pri pri-${t.prioridad}` }, t.prioridad),
          quien && el('span', { class: 'hecha-por' }, `✓ ${quien.nombre} ${F.fmtHora(h.hecha_en)}`))),
      botonComentarios('tarea', t.id, t.titulo),
      persona && avatar(persona, 22));
  }

  // ---- sin hora + línea del día ----
  function pintarDia() {
    const ts = tareasDelDia(dia);
    const sin = ts.filter(t => !t.hora).sort((a, b) => a.titulo.localeCompare(b.titulo));
    reemplazar(sinHora, sin.length ? el('div', { class: 'lista-dia' }, sin.map(t => tarjeta(t, dia))) : vacio('Nada sin hora para este día.'));

    const conHora = ts.filter(t => t.hora).map(t => ({ tipo: 'tarea', min: F.minutosDe(t.hora), t }));
    const desdeMs = F.madridAInstante(dia, '00:00').getTime();
    const hastaMs = F.madridAInstante(F.sumarDias(dia, 1), '00:00').getTime();
    const enDia = iso => { const x = new Date(iso).getTime(); return x >= desdeMs && x < hastaMs; };
    const anot = store.vivas('anotaciones', a => enDia(a.fecha_hora)).map(a => ({ tipo: 'anotacion', min: F.minutosDe(F.fmtHora(a.fecha_hora)), a }));
    const sets = store.vivas('setups', s => !s.anulado_en && enDia(s.t0)).map(s => ({ tipo: 'setup', min: F.minutosDe(F.fmtHora(s.t0)), s }));
    // jornada: la de la persona filtrada o la tuya (9:00 por defecto)
    const quien = store.perfil(filtro.persona) || store.usuario();
    const jornada = [];
    if (quien) {
      jornada.push({ tipo: 'jornada', min: F.minutosDe(quien.jornada_inicio || '09:00'), texto: `☀ INICIO DE JORNADA${filtro.persona ? ' · ' + quien.nombre : ''} ${F.horaCorta(quien.jornada_inicio || '09:00')}` });
      if (quien.jornada_fin) jornada.push({ tipo: 'jornada', min: F.minutosDe(quien.jornada_fin), texto: `☾ FIN DE JORNADA ${F.horaCorta(quien.jornada_fin)}` });
    }
    const items = [...conHora, ...anot, ...sets, ...jornada].sort((x, y) => x.min - y.min || (x.tipo === 'jornada' ? -1 : 1));
    const ahora = esHoy ? F.minutosDe(F.horaDe(new Date())) : null;
    const nodos = [];
    let ahoraPuesto = !esHoy;
    for (const it of items) {
      if (!ahoraPuesto && it.min > ahora) { nodos.push(marcaAhora()); ahoraPuesto = true; }
      nodos.push(filaLinea(it));
    }
    if (!ahoraPuesto) nodos.push(marcaAhora());
    const hayAlgo = items.some(i => i.tipo !== 'jornada');
    reemplazar(linea, ...nodos, hayAlgo ? null : vacio('Nada con hora. Pulsa «+ TAREA» para planificar el día.'));
  }
  const marcaAhora = () => el('div', { class: 'ahora' }, el('span', {}, `AHORA ${F.horaDe(new Date())}`));

  function filaLinea(it) {
    const hhmm = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    if (it.tipo === 'jornada') return el('div', { class: 'jornada' }, el('span', {}, it.texto));
    if (it.tipo === 'tarea') {
      const fin = it.t.duracion_min ? hhmm((it.min + it.t.duracion_min) % 1440) : null;
      return el('div', { class: 'fila-linea' },
        el('div', { class: 'hora-linea' }, el('span', {}, hhmm(it.min)), fin && el('span', { class: 'fin' }, fin)),
        el('div', { class: 'eje' }, el('span', { class: 'punto', style: { '--c': colorDe(it.t) } })),
        tarjeta(it.t, dia));
    }
    if (it.tipo === 'anotacion') {
      const a = it.a;
      return el('div', { class: 'fila-linea' },
        el('div', { class: 'hora-linea' }, el('span', {}, hhmm(it.min))),
        el('div', { class: 'eje' }, el('span', { class: 'punto rombo', style: { '--c': '#f59e0b' } })),
        el('a', { class: 'evento-linea', href: '#/mercado', title: 'Ver en Mercado' },
          el('span', { class: 'evento-tipo' }, 'MERCADO'), el('span', { class: 'evento-txt' }, a.titulo),
          el('span', { class: 'estrellas' }, '★'.repeat(a.importancia)),
          !a.despues && new Date(a.fecha_hora) < new Date() && el('span', { class: 'falta' }, 'falta el después'),
          el('span', { class: 'flex1' }), botonComentarios('anotacion', a.id, a.titulo)));
    }
    const s = it.s;
    const est = estadoSetup(s);
    return el('div', { class: 'fila-linea' },
      el('div', { class: 'hora-linea' }, el('span', {}, hhmm(it.min))),
      el('div', { class: 'eje' }, el('span', { class: 'punto rombo', style: { '--c': '#ec4899' } })),
      el('a', { class: 'evento-linea setup', href: `#/setups/${s.id}`, title: 'Ver el setup' },
        el('span', { class: 'evento-tipo' }, 'SETUP'),
        el('span', { class: 'evento-txt' }, `${s.simbolo} · ${s.direccion === 'largo' ? '▲ largo' : '▼ corto'} · ${s.temporalidad}`),
        el('span', { class: `estado-mini e-${est.clave}` }, est.texto),
        el('span', { class: 'flex1' }), botonComentarios('setup', s.id, `${s.simbolo} ${s.temporalidad}`)));
  }

  // ---- bandeja ----
  function pintarBandeja() {
    const ts = store.vivas('tareas', t => !t.fecha && !t.grupo_id && !t.rrule && pasaFiltro(t))
      .sort((a, b) => (a.prioridad === 'URGENTE' ? -1 : 0) - (b.prioridad === 'URGENTE' ? -1 : 0) || (b.creado_en || '').localeCompare(a.creado_en || ''));
    const pendientes = ts.filter(t => !store.hecha(t.id));
    const hechas = ts.filter(t => store.hecha(t.id));
    const fila = t => {
      const h = store.hecha(t.id);
      const etiquetas = (t.etiquetas || []).map(id => store.fila('etiquetas', id)).filter(Boolean);
      return el('div', { class: `st-item ${h ? 'done' : ''}` },
        el('div', { class: `st-check ${h ? 'done' : ''}`, onclick: () => alternar(t, dia) }, icono('checkPeq')),
        el('span', { class: 'st-txt', onclick: () => editarTarea(t).catch(error) }, t.titulo, ' ', ...etiquetas.map(e => chip(e.nombre, e.color))),
        !h && el('button', { class: 'st-add-btn2 programar', title: 'Ponerle día y hora', onclick: () => editarTarea({ ...t, fecha: dia }).catch(error) }, 'PROGRAMAR'));
    };
    reemplazar(bandeja,
      pendientes.length ? el('div', { class: 'st-list' }, pendientes.map(fila)) : vacio('Bandeja vacía.'),
      hechas.length ? el('details', { class: 'hechas-bandeja' }, el('summary', {}, `${hechas.length} hechas`), el('div', { class: 'st-list' }, hechas.map(fila))) : null);
  }

  function pintar() { pintarCabecera(); pintarFiltros(); pintarDia(); pintarBandeja(); }
  const quitar = store.on(['tareas', 'tareas_hechas', 'etiquetas', 'grupos', 'anotaciones', 'setups', 'perfiles', 'comentarios'], pintar);
  const reloj = setInterval(() => { if (esHoy) pintarDia(); }, 60000);
  pintar();
  return () => { quitar(); clearInterval(reloj); };
}
