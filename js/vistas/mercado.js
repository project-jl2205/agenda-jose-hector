// MERCADO — calendario de anotaciones de mercado, 100 % manual (IPC, crudo, Fed…): vuestra
// sensación ANTES y lo que pasó DESPUÉS, importancia, símbolos, etiquetas, comentarios de los dos y
// setups ligados. Mes en cuadrícula (PC) o lista por días (móvil).

import { el, icono, campo, selector, modal, chip, toast, error, confirmar, pedirTexto, reemplazar, vacio } from '../ui.js';
import { hiloComentarios } from './comentarios.js';

export function montar(cont, ctx) {
  const { store, F, navegar, params } = ctx;
  const hoyP = F.hoy().split('-').map(Number);
  const [y, m] = /^\d{4}-\d{2}$/.test(params[0] || '') ? params[0].split('-').map(Number) : [hoyP[0], hoyP[1]];
  const mesTxt = `${y}-${String(m).padStart(2, '0')}`;
  const mover = n => { const t = y * 12 + (m - 1) + n; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`; };
  ctx.titulo(`Mercado · ${F.fmtMes(y, m)}`);
  const filtro = { etiqueta: '', importancia: 0 };

  const cab = el('div', { class: 'dia-cab' });
  const pendientes = el('div', {});
  const filtros = el('div', { class: 'dia-filtros' });
  const calendario = el('div', {});
  cont.append(cab, pendientes, filtros, calendario);

  const pasa = a => (!filtro.etiqueta || (a.etiquetas || []).includes(filtro.etiqueta)) && a.importancia >= filtro.importancia;
  const diaDeA = a => F.diaDe(new Date(a.fecha_hora));

  function pintarCab() {
    reemplazar(cab,
      el('div', { class: 'dia-titulo' },
        el('button', { class: 'row-btn', title: 'Mes anterior', onclick: () => navegar(`mercado/${mover(-1)}`) }, icono('izq')),
        el('div', {}, el('div', { class: 'fire-lbl' }, 'Calendario de mercado'), el('div', { class: 'dia-grande' }, F.fmtMes(y, m))),
        el('button', { class: 'row-btn', title: 'Mes siguiente', onclick: () => navegar(`mercado/${mover(1)}`) }, icono('der')),
        (y !== hoyP[0] || m !== hoyP[1]) && el('button', { class: 'btn btn-peq', onclick: () => navegar('mercado') }, 'HOY')),
      el('button', { class: 'btn btn-primario', onclick: () => editar(null, F.hoy()) }, icono('mas'), ' ANOTACIÓN'));
  }

  function pintarPendientes() {
    const falta = store.vivas('anotaciones', a => !a.despues && new Date(a.fecha_hora) < new Date())
      .sort((a, b) => b.fecha_hora.localeCompare(a.fecha_hora)).slice(0, 6);
    reemplazar(pendientes, falta.length ? el('div', { class: 'card aviso-despues' },
      el('div', { class: 'card-lbl' }, `Falta el «después» en ${falta.length} evento${falta.length === 1 ? '' : 's'}`),
      el('div', { class: 'chips' }, falta.map(a => el('button', { class: 'chip', style: { '--c': '#f59e0b' }, onclick: () => detalle(a) }, `${F.fmtDia(a.fecha_hora)} · ${a.titulo}`)))) : null);
  }

  function pintarFiltros() {
    reemplazar(filtros,
      el('div', { class: 'segmentos' }, [[0, 'Todas'], [2, '★★ o más'], [3, '★★★']].map(([v, t]) => el('button', { class: filtro.importancia === v ? 'activo' : '', onclick: () => { filtro.importancia = v; pintar(); } }, t))),
      el('div', { class: 'chips' }, store.etiquetas('mercado').map(e => chip(e.nombre, e.color, {
        role: 'button', tabindex: 0, class: `chip ${filtro.etiqueta && filtro.etiqueta !== e.id ? 'apagado' : ''}`,
        onclick: () => { filtro.etiqueta = filtro.etiqueta === e.id ? '' : e.id; pintar(); },
      }))));
  }

  function itemAnot(a) {
    const etiquetas = (a.etiquetas || []).map(id => store.fila('etiquetas', id)).filter(Boolean);
    const pasado = new Date(a.fecha_hora) < new Date();
    const n = store.comentarios('anotacion', a.id).length;
    return el('button', { class: `anot imp-${a.importancia}`, style: { '--c': etiquetas[0]?.color || '#f59e0b' }, onclick: () => detalle(a) },
      el('span', { class: 'anot-hora mono' }, F.fmtHora(a.fecha_hora)),
      el('span', { class: 'anot-tit' }, a.titulo),
      el('span', { class: 'estrellas' }, '★'.repeat(a.importancia)),
      pasado && !a.despues && el('span', { class: 'falta', title: 'Falta el después' }, '!'),
      n ? el('span', { class: 'card-sub' }, icono('comentario'), ` ${n}`) : null);
  }

  function pintarCalendario() {
    const primero = `${mesTxt}-01`;
    const nDias = F.diasDelMes(y, m);
    const delMes = store.vivas('anotaciones', a => diaDeA(a).startsWith(mesTxt) && pasa(a)).sort((a, b) => a.fecha_hora.localeCompare(b.fecha_hora));
    const porDia = new Map();
    delMes.forEach(a => { const d = diaDeA(a); if (!porDia.has(d)) porDia.set(d, []); porDia.get(d).push(a); });
    // cuadrícula (PC)
    const huecos = F.diaSemana(primero) - 1;
    const celdas = [];
    for (let i = 0; i < huecos; i++) celdas.push(el('div', { class: 'celda vacia' }));
    for (let d = 1; d <= nDias; d++) {
      const dia = `${mesTxt}-${String(d).padStart(2, '0')}`;
      celdas.push(el('div', { class: `celda ${dia === F.hoy() ? 'hoy' : ''}`, ondblclick: () => editar(null, dia) },
        el('div', { class: 'celda-num' }, String(d), el('button', { class: 'celda-mas', title: 'Nueva anotación', onclick: () => editar(null, dia) }, '+')),
        ...(porDia.get(dia) || []).map(itemAnot)));
    }
    // lista (móvil)
    const listaDias = [...porDia.entries()].map(([dia, as]) => el('div', { class: 'lista-mes-dia' },
      el('div', { class: `lista-mes-cab ${dia === F.hoy() ? 'hoy' : ''}` }, F.fmtDiaLargoStr(dia)), ...as.map(itemAnot)));
    reemplazar(calendario,
      el('div', { class: 'mes-rejilla' }, F.NOMBRES_DIA.map(n => el('div', { class: 'mes-cab' }, n)), celdas),
      el('div', { class: 'mes-lista' }, listaDias.length ? listaDias : vacio('Sin anotaciones este mes. Pulsa «+ ANOTACIÓN».')));
  }

  // ---- detalle ----
  function detalle(a) {
    const quitarHilo = [];
    const caja = el('div', {});
    const pintarD = () => {
      const x = store.fila('anotaciones', a.id);
      if (!x || x.borrado_en) { reemplazar(caja, vacio('Esta anotación ya no existe.')); return; }
      const etiquetas = (x.etiquetas || []).map(id => store.fila('etiquetas', id)).filter(Boolean);
      const autor = store.perfil(x.creado_por);
      const sets = store.vivas('setups', s => s.anotacion_id === x.id);
      reemplazar(caja,
        el('div', { class: 'card-sub' }, `${F.fmtDiaLargo(x.fecha_hora)} · ${F.fmtHora(x.fecha_hora)} (Madrid)${x.pais ? ' · ' + x.pais : ''} · ${'★'.repeat(x.importancia)}${autor ? ' · apuntado por ' + autor.nombre : ''}`),
        el('div', { class: 'chips', style: { margin: '8px 0' } }, ...etiquetas.map(e => chip(e.nombre, e.color)), ...(x.simbolos || []).map(s => chip(s, '#6b6b8a'))),
        el('div', { class: 'g2', style: { marginBottom: '10px' } },
          el('div', { class: 'card' }, el('div', { class: 'card-lbl' }, 'Antes · sensación y análisis'), el('div', { class: 'texto-largo' }, x.antes || '—')),
          el('div', { class: 'card' }, el('div', { class: 'card-lbl' }, 'Después · qué pasó'), el('div', { class: `texto-largo ${!x.despues && new Date(x.fecha_hora) < new Date() ? 'falta-txt' : ''}` }, x.despues || (new Date(x.fecha_hora) < new Date() ? 'Falta por escribir.' : 'Aún no ha pasado.')))),
        sets.length ? el('div', { class: 'field' }, el('label', {}, 'Setups ligados'),
          el('div', { class: 'chips' }, sets.map(s => el('a', { class: 'chip', style: { '--c': s.direccion === 'largo' ? '#10b981' : '#ef4444' }, href: `#/setups/${s.id}`, onclick: () => m1.cerrar() }, `${s.simbolo} ${s.direccion === 'largo' ? '▲' : '▼'} ${s.temporalidad}`)))) : null);
    };
    const hilo = el('div', {});
    const m1 = modal({
      titulo: a.titulo.toUpperCase(), ancho: 720,
      cuerpo: el('div', {}, caja, el('div', { class: 'sec', style: { marginTop: '14px' } }, el('span', {}, 'Comentarios')), hilo),
      botones: [
        { texto: 'A la papelera', tipo: 'peligro', accion: async () => {
          if (!await confirmar('¿Mandar esta anotación a la papelera?', { si: 'A la papelera', peligro: true })) return false;
          await store.papelera('anotaciones', a.id);
          toast('Anotación a la papelera', 'ok', { accion: () => store.restaurar('anotaciones', a.id).catch(error) });
        } },
        { texto: 'Cerrar' },
        { texto: 'EDITAR', tipo: 'primario', accion: () => { editar(store.fila('anotaciones', a.id)); } },
      ],
      alCerrar: () => quitarHilo.forEach(f => f()),
    });
    quitarHilo.push(hiloComentarios(hilo, ctx, 'anotacion', a.id), store.on(['anotaciones', 'setups', 'etiquetas'], pintarD));
    pintarD();
  }

  // ---- crear / editar ----
  function editar(a, diaInicial) {
    const fh = a ? F.instanteAMadrid(a.fecha_hora) : { dia: diaInicial || F.hoy(), hora: '14:30' };
    const titulo = el('input', { value: a?.titulo || '', placeholder: 'IPC EE. UU., inventarios de crudo, Fed…' });
    const fecha = el('input', { type: 'date', value: fh.dia });
    const hora = el('input', { type: 'time', value: fh.hora });
    let importancia = a?.importancia || 2;
    const imp = el('div', { class: 'segmentos' });
    const pintarImp = () => reemplazar(imp, ...[1, 2, 3].map(n => el('button', { type: 'button', class: importancia === n ? 'activo' : '', onclick: () => { importancia = n; pintarImp(); } }, '★'.repeat(n))));
    pintarImp();
    const pais = el('input', { value: a?.pais || '', placeholder: 'EE. UU., Eurozona…' });
    const simbolos = new Set(a?.simbolos || []);
    const simbCaja = el('div', { class: 'chips' });
    const pintarSimb = () => reemplazar(simbCaja, ...store.filas('simbolos', s => s.activo).map(s => chip(s.nombre || s.simbolo, '#6b6b8a', {
      role: 'button', tabindex: 0, class: `chip ${simbolos.has(s.simbolo) ? '' : 'apagado'}`,
      onclick: () => { simbolos.has(s.simbolo) ? simbolos.delete(s.simbolo) : simbolos.add(s.simbolo); pintarSimb(); },
    })));
    pintarSimb();
    const etiquetas = new Set(a?.etiquetas || []);
    const etCaja = el('div', { class: 'chips' });
    const pintarEt = () => reemplazar(etCaja, ...store.etiquetas('mercado').map(e => chip(e.nombre, e.color, {
      role: 'button', tabindex: 0, class: `chip ${etiquetas.has(e.id) ? '' : 'apagado'}`,
      onclick: () => { etiquetas.has(e.id) ? etiquetas.delete(e.id) : etiquetas.add(e.id); pintarEt(); },
    })), el('button', { type: 'button', class: 'chip', style: { '--c': '#6b6b8a' }, onclick: async () => {
      const nombre = await pedirTexto('Nueva etiqueta de mercado', '', { etiqueta: 'Nombre (IPC, Crudo, Fed, Empleo…)', aceptar: 'Crear' });
      if (!nombre) return;
      try { const n = await store.insertar('etiquetas', { nombre, ambito: 'mercado', color: '#f97316' }); etiquetas.add(n.id); pintarEt(); } catch (e) { error(e); }
    } }, '+ etiqueta'));
    pintarEt();
    const antes = el('textarea', { rows: 4, value: a?.antes || '', placeholder: 'Vuestra sensación o análisis antes del dato.' });
    const despues = el('textarea', { rows: 3, value: a?.despues || '', placeholder: 'Qué pasó (rellenadlo después del dato).' });
    const repetir = selector([['', 'No'], ['7', 'Cada semana'], ['14', 'Cada 2 semanas'], ['mes', 'Cada mes']], '');
    const veces = el('input', { type: 'number', min: 1, max: 24, value: 4 });
    modal({
      titulo: a ? 'EDITAR ANOTACIÓN' : 'NUEVA ANOTACIÓN', ancho: 620,
      cuerpo: el('div', {},
        campo('Evento', titulo),
        el('div', { class: 'fila-campos' }, campo('Día', fecha), campo('Hora (Madrid)', hora), campo('País', pais)),
        el('div', { class: 'field' }, el('label', {}, 'Importancia'), imp),
        el('div', { class: 'field' }, el('label', {}, 'Símbolos que mira'), simbCaja),
        el('div', { class: 'field' }, el('label', {}, 'Etiquetas'), etCaja),
        campo('Antes', antes), campo('Después', despues),
        !a && el('div', { class: 'fila-campos' }, campo('Repetir', repetir), campo('Cuántas veces', veces))),
      botones: [{ texto: 'Cancelar' }, { texto: 'GUARDAR', tipo: 'primario', accion: async () => {
        if (!titulo.value.trim()) { toast('Pon el nombre del evento.', 'err'); return false; }
        if (!fecha.value || !hora.value) { toast('Pon el día y la hora.', 'err'); return false; }
        const datos = {
          titulo: titulo.value.trim(), fecha_hora: F.madridAInstante(fecha.value, hora.value).toISOString(), importancia,
          pais: pais.value.trim() || null, simbolos: [...simbolos], etiquetas: [...etiquetas],
          antes: antes.value.trim() || null, despues: despues.value.trim() || null,
        };
        if (a) { await store.actualizar('anotaciones', { id: a.id }, datos); toast('Guardado'); return; }
        const filas = [{ ...datos, creado_por: store.usuarioId() }];
        if (repetir.value) {
          const serie = crypto.randomUUID();
          filas[0].serie_id = serie;
          for (let i = 1; i < Math.min(24, Math.max(1, +veces.value || 1)); i++) {
            let dia;
            if (repetir.value === 'mes') {
              const [yy, mm, dd] = fecha.value.split('-').map(Number);
              const t = yy * 12 + (mm - 1) + i;
              const y2 = Math.floor(t / 12), m2 = (t % 12) + 1;
              dia = `${y2}-${String(m2).padStart(2, '0')}-${String(Math.min(dd, F.diasDelMes(y2, m2))).padStart(2, '0')}`;
            } else dia = F.sumarDias(fecha.value, i * +repetir.value);
            filas.push({ ...datos, antes: null, despues: null, serie_id: serie, fecha_hora: F.madridAInstante(dia, hora.value).toISOString(), creado_por: store.usuarioId() });
          }
        }
        await store.insertar('anotaciones', filas);
        toast(filas.length > 1 ? `Creadas ${filas.length} anotaciones (puedes moverlas una a una si cambia la fecha)` : 'Anotación creada');
      } }],
    });
  }

  function pintar() { pintarCab(); pintarPendientes(); pintarFiltros(); pintarCalendario(); }
  const quitar = store.on(['anotaciones', 'etiquetas', 'comentarios', 'simbolos'], pintar);
  pintar();
  return quitar;
}
