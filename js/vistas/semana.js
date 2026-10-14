// SEMANA — el panel «AGENDA JOSE · HÉCTOR — Esta semana», compartido y en vivo.
// Banner con la semana ISO, resumen por persona, gráficos, grupos con tareas
// (marcar = quién y cuándo), papelera con deshacer, notas de la semana y arrastre de pendientes.

import { el, icono, modal, campo, selector, toast, error, confirmar, pedirTexto, avatar, progreso, debounce, pct, reemplazar, pildoraPrioridad } from '../ui.js';
import { editarTarea } from './tarea-editor.js';

const COLORES = ['#f59e0b', '#6366f1', '#10b981', '#ec4899', '#f97316', '#3b82f6', '#ef4444'];
const PRI_COLORES = { URGENTE: '#ef4444', ALTA: '#f59e0b', MEDIA: '#3b82f6' };
const ABIERTOS = 'agenda-jh-grupos-abiertos';

export function montar(cont, ctx) {
  const { store, F, navegar, params } = ctx;
  const semana = /^\d{4}-W\d{2}$/.test(params[0] || '') ? params[0] : F.semanaActual();
  const anterior = F.moverSemana(semana, -1);
  const esActual = semana === F.semanaActual();
  ctx.titulo(`Semana ${F.numeroSemana(semana)} · ${F.rangoSemanaTexto(semana)}`);

  let abiertos = {};
  try { abiertos = JSON.parse(localStorage.getItem(ABIERTOS) || '{}'); } catch { /* sin almacenamiento */ }
  const guardarAbiertos = () => { try { localStorage.setItem(ABIERTOS, JSON.stringify(abiertos)); } catch { /* nada */ } };
  const borradores = new Map();   // texto a medio escribir en "nueva tarea" por grupo
  let enfocado = null;

  // ---- datos de la semana ----
  const gruposSemana = () => store.vivas('grupos', g => g.semana === semana).sort((a, b) => a.orden - b.orden || (a.creado_en || '').localeCompare(b.creado_en || ''));
  const tareasDe = g => store.vivas('tareas', t => t.grupo_id === g.id).sort((a, b) => a.orden - b.orden || (a.creado_en || '~').localeCompare(b.creado_en || '~'));
  const hecha = t => store.hecha(t.id);
  const personaDe = (t, g) => t.persona || g.persona;

  // ---- estructura fija (las notas y los gráficos no se re-crean) ----
  const banner = el('div', { class: 'fire-banner' });
  const resumen = el('div', { class: 'g4' });
  const lienzoDonut = el('canvas');
  const lienzoBarras = el('canvas');
  const lista = el('div', { class: 'obj-wrap' });
  const extraGrupos = el('div', { class: 'sec-extra' });
  const notas = el('div', { class: 'notes-grid' });
  cont.append(
    banner,
    el('div', { class: 'sec' }, el('span', {}, `Resumen — Semana ${F.numeroSemana(semana)}`)), resumen,
    el('div', { class: 'sec' }, el('span', {}, 'Análisis visual')),
    el('div', { class: 'g2' },
      el('div', { class: 'card' }, el('div', { class: 'card-lbl' }, 'Distribución de progreso por eje'), el('div', { class: 'chart-wrap' }, lienzoDonut)),
      el('div', { class: 'card' }, el('div', { class: 'card-lbl' }, 'Progreso de objetivos'), el('div', { class: 'chart-wrap' }, lienzoBarras))),
    el('div', { class: 'sec' }, el('span', {}, 'Agenda por persona — Esta semana'), extraGrupos),
    lista,
    el('button', { class: 'add-obj-btn', onclick: () => editarGrupo(null) }, '+ NUEVO GRUPO / PERSONA'),
    el('div', { class: 'sec' }, el('span', {}, 'Notas de la semana')),
    el('div', { class: 'card', style: { marginBottom: '24px' } }, notas,
      el('div', { class: 'card-sub', style: { textAlign: 'right', marginTop: '10px' } }, 'Se guardan solas y las ve el otro al momento')));

  // ---- banner ----
  function pintarBanner() {
    const total = gruposSemana().flatMap(tareasDe);
    const hechas = total.filter(hecha).length;
    reemplazar(banner,
      el('div', {},
        el('div', { class: 'fire-lbl' }, 'Agenda de la semana'),
        el('div', { class: 'fire-val' }, 'Jose Luis & Héctor'),
        el('div', { class: 'fire-sub' }, `${F.rangoSemanaTexto(semana)} · ${hechas} de ${total.length} tareas hechas · márcalas al completarlas`)),
      el('div', { class: 'banner-der' },
        el('button', { class: 'row-btn', title: 'Semana anterior', onclick: () => navegar(`semana/${anterior}`) }, icono('izq')),
        !esActual && el('button', { class: 'btn btn-peq', onclick: () => navegar('semana') }, 'HOY'),
        el('div', { class: 'fire-tag' }, `SEMANA ${F.numeroSemana(semana)}`),
        el('button', { class: 'row-btn', title: 'Semana siguiente', onclick: () => navegar(`semana/${F.moverSemana(semana, 1)}`) }, icono('der'))));
  }

  // ---- tarjetas resumen ----
  function pintarResumen() {
    const grupos = gruposSemana();
    const filas = grupos.flatMap(g => tareasDe(g).map(t => ({ t, g })));
    const tarjeta = (clase, lbl, val, color, sub) => el('div', { class: `card accent ${clase}` },
      el('div', { class: 'card-lbl' }, lbl), el('div', { class: 'card-val', style: { color } }, String(val)), el('div', { class: 'card-sub' }, sub));
    // mismo orden que los grupos de la semana (como el panel: Jose primero, Héctor después)
    const orden = [...new Set(grupos.map(g => g.persona).filter(Boolean))];
    const perfiles = store.perfiles().sort((a, b) => (orden.indexOf(a.id) + 1 || 99) - (orden.indexOf(b.id) + 1 || 99)).slice(0, 2);
    const porPersona = perfiles.map(p => {
      const suyas = filas.filter(({ t, g }) => personaDe(t, g) === p.id);
      const h = suyas.filter(({ t }) => hecha(t)).length;
      const c = tarjeta('ac-persona', p.nombre, suyas.length, p.color, `${pct(h, suyas.length)}% completado · ${h} hechas`);
      c.style.setProperty('--acento', p.color);
      return c;
    });
    const hechas = filas.filter(({ t }) => hecha(t)).length;
    reemplazar(resumen, ...porPersona,
      tarjeta('ac-g', 'Tareas totales', filas.length, 'var(--green)', `${grupos.length} grupo${grupos.length === 1 ? '' : 's'}`),
      tarjeta('ac-p', 'Progreso semanal', `${pct(hechas, filas.length)}%`, 'var(--pink)', `${hechas} de ${filas.length} tareas`));
  }

  // ---- gráficos (Chart.js, como el panel) ----
  let donut = null;
  let barras = null;
  const GRIS = '#22223a';
  const tooltip = { backgroundColor: '#1a1a26', borderColor: '#2a2a3d', borderWidth: 1, titleColor: '#e2e2f0', bodyColor: '#6b6b8a' };
  function pintarGraficos() {
    if (typeof Chart === 'undefined') return;
    const grupos = gruposSemana();
    const plano = grupos.flatMap(g => tareasDe(g).map(t => ({ g, t, h: !!hecha(t) })));
    const datosDonut = {
      labels: plano.map(f => f.t.titulo),
      datasets: [{ data: plano.map(() => 1), backgroundColor: plano.map(f => (f.h ? `${f.g.color}cc` : GRIS)), borderColor: plano.map(f => (f.h ? f.g.color : '#2a2a3d')), borderWidth: 2, hoverOffset: 8 }],
    };
    const datosBarras = {
      labels: grupos.map(g => g.nombre.split(' ').slice(0, 2).join(' ')),
      datasets: [{ label: '% completado', data: grupos.map(g => pctGrupo(g)), backgroundColor: grupos.map(g => `${g.color}cc`), borderColor: grupos.map(g => g.color), borderWidth: 1, borderRadius: 4 }],
    };
    if (!donut) {
      donut = new Chart(lienzoDonut, { type: 'doughnut', data: datosDonut, options: { responsive: true, maintainAspectRatio: false, cutout: '65%', plugins: { legend: { display: false }, tooltip: { ...tooltip, callbacks: {
        title: c => plano[c[0].dataIndex]?.g.nombre, label: c => { const f = plano[c.dataIndex]; return f ? ` ${f.h ? '✓ HECHO' : '○ Pendiente'} · ${f.t.titulo}` : ''; } } } } } });
      barras = new Chart(lienzoBarras, { type: 'bar', data: datosBarras, options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y',
        scales: { x: { min: 0, max: 100, ticks: { color: '#6b6b8a', font: { size: 10 }, callback: v => `${v}%` }, grid: { color: '#2a2a3d' } }, y: { ticks: { color: '#6b6b8a', font: { size: 10 } }, grid: { display: false } } },
        plugins: { legend: { display: false }, tooltip: { ...tooltip, callbacks: { label: c => ` ${c.raw}% completado` } } } } });
    } else {
      donut.data = datosDonut;
      donut.options.plugins.tooltip.callbacks.title = c => plano[c[0].dataIndex]?.g.nombre;
      donut.options.plugins.tooltip.callbacks.label = c => { const f = plano[c.dataIndex]; return f ? ` ${f.h ? '✓ HECHO' : '○ Pendiente'} · ${f.t.titulo}` : ''; };
      donut.update();
      barras.data = datosBarras;
      barras.update();
    }
  }
  const pctGrupo = g => { const ts = tareasDe(g); return pct(ts.filter(hecha).length, ts.length); };

  // ---- grupos y tareas ----
  async function alternar(t) {
    try {
      if (hecha(t)) await store.quitar('tareas_hechas', { tarea_id: t.id, ocurrencia: '1970-01-01' });
      else await store.insertar('tareas_hechas', { tarea_id: t.id, ocurrencia: '1970-01-01', hecha_por: store.usuarioId(), hecha_en: new Date().toISOString() });
    } catch (e) { error(e); }
  }

  async function alternarTodo(g) {
    const ts = tareasDe(g);
    const todas = ts.every(hecha);
    try {
      for (const t of ts) {
        if (todas) await store.quitar('tareas_hechas', { tarea_id: t.id, ocurrencia: '1970-01-01' });
        else if (!hecha(t)) await store.insertar('tareas_hechas', { tarea_id: t.id, ocurrencia: '1970-01-01', hecha_por: store.usuarioId(), hecha_en: new Date().toISOString() });
      }
    } catch (e) { error(e); }
  }

  async function anadir(g, input) {
    const titulo = input.value.trim();
    if (!titulo) { input.focus(); return; }
    input.value = '';
    borradores.delete(g.id);
    abiertos[g.id] = true; guardarAbiertos();
    try {
      await store.insertar('tareas', { titulo, grupo_id: g.id, tipo: 'puntual', orden: tareasDe(g).length, creado_por: store.usuarioId() });
    } catch (e) { input.value = titulo; error(e); }
  }

  async function aPapelera(tabla, fila, texto) {
    try {
      await store.papelera(tabla, fila.id);
      toast(texto, 'ok', { accion: () => store.restaurar(tabla, fila.id).catch(error) });
    } catch (e) { error(e); }
  }

  function filaTarea(g, t, peso) {
    const h = hecha(t);
    const quien = h ? store.perfil(h.hecha_por) : null;
    const resp = t.persona && t.persona !== g.persona ? store.perfil(t.persona) : null;
    return el('div', { class: `st-item ${h ? 'done' : ''}`, dataset: { st: t.id } },
      el('div', { class: `st-check ${h ? 'done' : ''}`, onclick: () => alternar(t) }, icono('checkPeq')),
      el('span', { class: 'st-txt', onclick: () => alternar(t), ondblclick: e => { e.stopPropagation(); editarTarea(t).catch(error); }, title: 'Clic: marcar · Doble clic: editar' },
        t.titulo,
        t.origen_tarea_id && el('span', { class: 'arrastrada', title: 'Venía de la semana anterior' }, ' ↩'),
        t.fecha && el('span', { class: 'st-fecha' }, ` · ${F.fmtDiaStr(t.fecha)}${t.hora ? ' ' + F.horaCorta(t.hora) : ''}`)),
      resp && avatar(resp, 18),
      quien && el('span', { class: 'st-quien', title: `Hecha por ${quien.nombre} · ${F.fmtDiaHora(h.hecha_en)}` }, avatar(quien, 18), el('span', { class: 'st-hora' }, F.fmtHora(h.hecha_en))),
      el('span', { class: 'st-pct' }, `+${peso}%`),
      el('button', { class: 'row-btn edit', title: 'Editar tarea', onclick: e => { e.stopPropagation(); editarTarea(t).catch(error); } }, '✎'),
      el('button', { class: 'row-btn del', title: 'A la papelera', onclick: e => { e.stopPropagation(); aPapelera('tareas', t, 'Tarea borrada'); } }, '×'));
  }

  function bloqueGrupo(g) {
    const ts = tareasDe(g);
    const p = pctGrupo(g);
    const abierto = !!abiertos[g.id];
    const todas = ts.length > 0 && p === 100;
    const peso = ts.length ? Math.round(100 / ts.length) : 0;
    const persona = store.perfil(g.persona);
    const entrada = el('input', {
      type: 'text', class: 'st-add-in', placeholder: 'Nueva tarea para este grupo…', value: borradores.get(g.id) || '',
      oninput: e => borradores.set(g.id, e.target.value),
      onfocus: () => { enfocado = g.id; }, onblur: () => { if (enfocado === g.id) enfocado = null; },
      onkeydown: e => { if (e.key === 'Enter') { e.preventDefault(); anadir(g, e.target); } },
    });
    const nodo = el('div', { class: `obj-item ${todas ? 'completed' : ''} ${g.prioridad === 'URGENTE' ? 'urgent-border' : ''}`, dataset: { id: g.id } },
      el('div', { class: 'obj-main', onclick: () => { abiertos[g.id] = !abiertos[g.id]; guardarAbiertos(); pintarGrupos(); } },
        el('div', { class: `obj-check ${todas ? 'done' : ''}`, title: 'Marcar/desmarcar todo', onclick: e => { e.stopPropagation(); alternarTodo(g); } }, icono('check')),
        pildoraPrioridad(g.prioridad),
        el('span', { class: 'obj-txt', title: 'Doble clic para editar', ondblclick: e => { e.stopPropagation(); editarGrupo(g); } }, g.nombre),
        persona && avatar(persona, 22),
        el('button', { class: 'row-btn edit', title: 'Editar grupo', onclick: e => { e.stopPropagation(); editarGrupo(g); } }, '✎'),
        el('button', { class: 'row-btn del', title: 'Grupo a la papelera', onclick: async e => {
          e.stopPropagation();
          if (await confirmar(`¿Mandar el grupo «${g.nombre}» y sus tareas a la papelera? Se puede deshacer.`, { si: 'A la papelera', peligro: true })) aPapelera('grupos', g, 'Grupo borrado');
        } }, '🗑'),
        el('span', { class: 'obj-pct-lbl', style: { color: p === 100 ? 'var(--green)' : p > 0 ? 'var(--amber)' : 'var(--muted)' } }, `${p}%`),
        el('div', { class: `obj-chevron ${abierto ? 'open' : ''}` }, icono('chevron'))),
      el('div', { class: 'obj-progress-row' }, progreso(p, g.color)),
      el('div', { class: `subtasks ${abierto ? 'open' : ''}` },
        el('div', { class: 'st-list' }, ts.length ? ts.map(t => filaTarea(g, t, peso)) : el('div', { class: 'card-sub' }, 'Sin tareas todavía.')),
        el('div', { class: 'st-add-row' }, entrada, el('button', { class: 'st-add-btn2', onclick: () => anadir(g, entrada) }, '+ AÑADIR'))));
    return { nodo, entrada };
  }

  function pintarGrupos() {
    const grupos = gruposSemana();
    let aEnfocar = null;
    const nodos = grupos.map(g => { const b = bloqueGrupo(g); if (enfocado === g.id) aEnfocar = b.entrada; return b.nodo; });
    reemplazar(lista, nodos.length ? nodos : el('div', { class: 'vacio' }, esActual ? 'Esta semana aún no tiene grupos. Crea uno o trae los pendientes de la semana pasada.' : 'Esta semana no tiene grupos.'));
    if (aEnfocar) { aEnfocar.focus(); const n = aEnfocar.value.length; aEnfocar.setSelectionRange(n, n); }
    pintarBotonArrastre();
  }

  function editarGrupo(g) {
    const nombre = el('input', { value: g?.nombre || '', placeholder: 'Ej. JUEVES JOSE LUIS, HÉCTOR…' });
    const persona = selector([['', 'Los dos / nadie'], ...store.perfiles().map(p => [p.id, p.nombre])], g?.persona || '');
    const prioridad = selector(['URGENTE', 'ALTA', 'MEDIA'], g?.prioridad || 'ALTA');
    const color = el('input', { type: 'color', value: g?.color || COLORES[gruposSemana().length % COLORES.length] });
    const listaTareas = el('div', {});
    const filaNueva = () => {
      const fila = el('div', { class: 'st-input-row' }, el('input', { type: 'text', placeholder: 'Tarea…' }),
        el('button', { class: 'st-rm', type: 'button', onclick: () => fila.remove() }, '×'));
      listaTareas.append(fila);
    };
    if (!g) filaNueva();
    persona.onchange = () => { const p = store.perfil(persona.value); if (p && !g) color.value = p.color; };
    prioridad.onchange = () => { if (!g) color.value = PRI_COLORES[prioridad.value] || color.value; };
    modal({
      titulo: g ? 'EDITAR GRUPO' : 'NUEVO GRUPO', ancho: 520,
      cuerpo: el('div', {},
        campo('Nombre del grupo / persona', nombre),
        el('div', { class: 'fila-campos' }, campo('Persona', persona), campo('Prioridad', prioridad), campo('Color', color)),
        !g && el('div', { class: 'field' }, el('label', {}, 'Tareas (cada una suma el mismo %)'), listaTareas,
          el('button', { class: 'add-st-btn', type: 'button', onclick: filaNueva }, '+ Añadir tarea'))),
      botones: [{ texto: 'Cancelar' }, { texto: g ? 'GUARDAR' : 'GUARDAR GRUPO', tipo: 'primario', accion: async () => {
        if (!nombre.value.trim()) { toast('Pon un nombre al grupo.', 'err'); nombre.focus(); return false; }
        const datos = { nombre: nombre.value.trim(), persona: persona.value || null, prioridad: prioridad.value, color: color.value };
        if (g) { await store.actualizar('grupos', { id: g.id }, datos); return; }
        const nuevo = await store.insertar('grupos', { ...datos, semana, orden: gruposSemana().length, creado_por: store.usuarioId() });
        const titulos = [...listaTareas.querySelectorAll('input')].map(i => i.value.trim()).filter(Boolean);
        if (titulos.length) await store.insertar('tareas', titulos.map((titulo, i) => ({ titulo, grupo_id: nuevo.id, tipo: 'puntual', orden: i, creado_por: store.usuarioId() })));
        abiertos[nuevo.id] = true; guardarAbiertos();
        toast('Grupo añadido');
      } }],
    });
  }

  // ---- arrastrar pendientes de la semana anterior ----
  const pendientesAnterior = () => store.vivas('grupos', g => g.semana === anterior)
    .flatMap(g => store.vivas('tareas', t => t.grupo_id === g.id && !store.hecha(t.id)))
    .filter(t => !store.vivas('tareas', x => x.origen_tarea_id === t.id).length);
  function pintarBotonArrastre() {
    const n = pendientesAnterior().length;
    reemplazar(extraGrupos, n ? el('button', { class: 'btn btn-peq', title: 'Copia a esta semana lo que quedó sin hacer', onclick: () => arrastrar(false) }, `↩ TRAER ${n} PENDIENTE${n === 1 ? '' : 'S'} DE LA S${F.numeroSemana(anterior)}`) : null);
  }
  async function arrastrar(automatico) {
    try {
      const n = await ctx.db.rpc('arrastrar_semana', { p_origen: anterior, p_destino: semana });
      if (!ctx.db.enDemo()) await store.cargarTodo();
      if (n || !automatico) toast(n ? `Traídas ${n} tareas pendientes de la semana ${F.numeroSemana(anterior)}` : 'No había nada pendiente que traer');
    } catch (e) { error(e); }
  }
  if (esActual && !gruposSemana().length && pendientesAnterior().length) {
    const marca = `agenda-jh-arrastre-${semana}`;
    let hecho = false;
    try { hecho = sessionStorage.getItem(marca) === '1'; sessionStorage.setItem(marca, '1'); } catch { /* nada */ }
    if (!hecho) arrastrar(true);
  }

  // ---- notas de la semana (4 cajas) ----
  const cajas = [1, 2, 3, 4].map(slot => {
    const area = el('textarea', { class: 'n-in', rows: 3, placeholder: 'Escribe aquí…' });
    const pie = el('span', { class: 'nota-pie' });
    const guardar = debounce(async () => {
      try { await store.upsert('notas_semana', { semana, slot, texto: area.value, editado_por: store.usuarioId(), editado_en: new Date().toISOString() }, 'semana,slot'); }
      catch (e) { error(e); }
    }, 800);
    area.addEventListener('input', guardar);
    area.addEventListener('blur', () => guardar.ya());
    notas.append(el('div', { class: 'note-box' }, el('div', { class: 'note-lbl' }, el('span', {}, `Nota ${slot}`), pie), area));
    return { slot, area, pie };
  });
  function pintarNotas() {
    for (const c of cajas) {
      const n = store.fila('notas_semana', { semana, slot: c.slot });
      if (document.activeElement !== c.area && c.area.value !== (n?.texto || '')) c.area.value = n?.texto || '';
      const quien = n?.editado_por ? store.perfil(n.editado_por) : null;
      c.pie.textContent = n?.texto && quien ? `${quien.nombre} · ${F.fmtRelativo(n.editado_en)}` : '';
    }
  }

  // ---- pintar todo ----
  function pintar() {
    pintarBanner(); pintarResumen(); pintarGraficos(); pintarGrupos(); pintarNotas();
  }
  const quitar = store.on(['grupos', 'tareas', 'tareas_hechas', 'notas_semana', 'perfiles'], pintar);
  pintar();
  return () => { quitar(); donut?.destroy(); barras?.destroy(); };
}
