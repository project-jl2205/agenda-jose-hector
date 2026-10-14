// Editor de tareas compartido (Semana y Día): tipo, fecha/hora, repetición, persona, prioridad,
// etiquetas y grupo de la semana. Devuelve una promesa con la tarea guardada (o null si se cancela).

import { el, campo, selector, modal, chip, toast, error, pedirTexto } from '../ui.js';
import { store } from '../store.js';
import * as F from '../fechas.js';
import { parsear, construir, describir, ocurrencias } from '../recurrencia.js';

const TIPOS = [
  ['puntual', 'Puntual', 'Un día concreto, o en la bandeja si no tiene fecha.'],
  ['permanente', 'Permanente', 'Rutina fija que se repite siempre (sin fecha de fin).'],
  ['temporal', 'Temporal', 'Se repite solo entre dos fechas.'],
  ['periodica', 'Periódica', 'Cada cierto tiempo: cada N días, semanas o meses.'],
];
const PALETA = ['#f97316', '#10b981', '#6366f1', '#ec4899', '#f59e0b', '#ef4444', '#3b82f6', '#14b8a6', '#a855f7'];
const LETRAS = ['', 'L', 'M', 'X', 'J', 'V', 'S', 'D'];

/**
 * editarTarea(tarea | null, { fecha, hora, grupo_id, semana, persona }) -> Promise<tarea|null>
 */
export function editarTarea(tarea = null, iniciales = {}) {
  return new Promise(resolver => {
    let resuelto = false;
    const fin = v => { if (!resuelto) { resuelto = true; resolver(v); } };
    const t = { tipo: 'puntual', etiquetas: [], ...iniciales, ...(tarea || {}) };
    const r0 = t.rrule ? parsear(t.rrule) : null;
    const estado = {
      tipo: t.tipo,
      etiquetas: new Set(t.etiquetas || []),
      freq: r0?.freq || (t.tipo === 'temporal' ? 'DAILY' : 'WEEKLY'),
      intervalo: r0?.intervalo || 1,
      dias: new Set(
        r0 ? (r0.byday.some(b => b.n === null) ? r0.byday.filter(b => b.n === null).map(b => b.dow)
                                               : (t.fecha ? [F.diaSemana(t.fecha)] : []))
           : [1, 2, 3, 4, 5]),
      modoMes: r0?.byday?.some(b => b.n !== null) ? 'ordinal' : 'dia',
      diaMes: r0?.bymonthday?.[0] || (t.fecha ? +t.fecha.slice(8) : 1),
      ordinal: r0?.byday?.find(b => b.n !== null)?.n || 1,
      diaOrdinal: r0?.byday?.find(b => b.n !== null)?.dow || 1,
    };

    // ---- controles ----
    const titulo = el('input', { type: 'text', value: t.titulo || '', placeholder: 'Qué hay que hacer' });
    const notas = el('textarea', { rows: 2, value: t.notas || '', placeholder: 'Detalles (opcional)' });
    const fecha = el('input', { type: 'date', value: t.fecha || '' });
    const hora = el('input', { type: 'time', value: t.hora ? String(t.hora).slice(0, 5) : '' });
    const duracion = selector([['', '—'], [15, '15 min'], [30, '30 min'], [45, '45 min'], [60, '1 h'], [90, '1 h 30'], [120, '2 h'], [180, '3 h'], [240, '4 h']], t.duracion_min || '');
    const hasta = el('input', { type: 'date', value: t.hasta || '' });
    const persona = selector([['', 'Los dos'], ...store.perfiles().map(p => [p.id, p.nombre])], t.persona || '');
    const prioridad = selector([['', '—'], 'URGENTE', 'ALTA', 'MEDIA'], t.prioridad || '');
    const semanaGrupos = t.semana || (t.fecha ? F.semanaISO(t.fecha) : F.semanaActual());
    const grupos = store.vivas('grupos', g => g.semana === semanaGrupos).sort((a, b) => a.orden - b.orden);
    if (t.grupo_id && !grupos.some(g => g.id === t.grupo_id)) { const g = store.fila('grupos', t.grupo_id); if (g) grupos.push(g); }
    const grupo = selector([['', 'Ninguno'], ...grupos.map(g => [g.id, `${g.nombre} (S${F.numeroSemana(g.semana)})`])], t.grupo_id || '');

    const frecuencia = selector([['DAILY', 'días'], ['WEEKLY', 'semanas'], ['MONTHLY', 'meses']], estado.freq);
    const intervalo = el('input', { type: 'number', min: 1, max: 30, value: estado.intervalo, class: 'entrada corto' });
    const diasCaja = el('div', { class: 'dias-semana' });
    const mesCaja = el('div', { class: 'mes-opciones' });
    const vista = el('div', { class: 'ayuda-rep' });
    const tipoCaja = el('div', { class: 'segmentos tipos' });
    const tipoAyuda = el('div', { class: 'ayuda' });
    const etiquetasCaja = el('div', { class: 'chips' });

    const pintarTipo = () => {
      tipoCaja.replaceChildren(...TIPOS.map(([v, txt]) => el('button', {
        type: 'button', class: estado.tipo === v ? 'activo' : '',
        onclick: () => {
          estado.tipo = v;
          if (v === 'temporal' && !t.rrule) estado.freq = 'DAILY';
          if (v === 'permanente' && !t.rrule) { estado.freq = 'WEEKLY'; if (!estado.dias.size) [1, 2, 3, 4, 5].forEach(d => estado.dias.add(d)); }
          frecuencia.value = estado.freq;
          if (v !== 'puntual' && !fecha.value) fecha.value = F.hoy();
          pintarTipo(); pintarRep();
        },
      }, txt)));
      tipoAyuda.textContent = TIPOS.find(x => x[0] === estado.tipo)[2];
      bloqueRep.style.display = estado.tipo === 'puntual' ? 'none' : '';
      campoHasta.style.display = estado.tipo === 'temporal' || estado.tipo === 'periodica' ? '' : 'none';
      campoHasta.querySelector('label').textContent = estado.tipo === 'temporal' ? 'Hasta (obligatorio)' : 'Hasta (opcional)';
      campoFecha.querySelector('label').textContent = estado.tipo === 'puntual' ? 'Día (vacío = bandeja)' : 'Empieza el';
    };

    const reglaActual = () => estado.tipo === 'puntual' ? null : construir({
      freq: estado.freq, intervalo: Math.max(1, +intervalo.value || 1),
      dias: [...estado.dias], modoMes: estado.modoMes, diaMes: estado.diaMes,
      ordinal: estado.ordinal, diaOrdinal: estado.diaOrdinal,
    });

    const pintarRep = () => {
      estado.freq = frecuencia.value;
      diasCaja.style.display = estado.freq === 'MONTHLY' ? 'none' : '';
      mesCaja.style.display = estado.freq === 'MONTHLY' ? '' : 'none';
      diasCaja.replaceChildren(...[1, 2, 3, 4, 5, 6, 7].map(d => el('button', {
        type: 'button', class: `dia-btn ${estado.dias.has(d) ? 'activo' : ''}`, title: F.NOMBRES_DIA_LARGO[d - 1],
        onclick: () => { estado.dias.has(d) ? estado.dias.delete(d) : estado.dias.add(d); pintarRep(); },
      }, LETRAS[d])));
      const radio = (modo, ...hijos) => el('label', { class: 'opcion' },
        el('input', { type: 'radio', name: 'modoMes', checked: estado.modoMes === modo, onchange: () => { estado.modoMes = modo; pintarRep(); } }), ...hijos);
      const diaMes = el('input', { type: 'number', min: 1, max: 31, value: estado.diaMes > 0 ? estado.diaMes : 31, class: 'entrada corto', oninput: e => { estado.diaMes = +e.target.value; pintarVista(); } });
      const ord = selector([[1, 'primer'], [2, 'segundo'], [3, 'tercer'], [4, 'cuarto'], [-1, 'último']], estado.ordinal, { onchange: e => { estado.ordinal = +e.target.value; pintarVista(); } });
      const dOrd = selector([1, 2, 3, 4, 5, 6, 7].map(d => [d, F.NOMBRES_DIA_LARGO[d - 1]]), estado.diaOrdinal, { onchange: e => { estado.diaOrdinal = +e.target.value; pintarVista(); } });
      mesCaja.replaceChildren(radio('dia', 'el día ', diaMes), radio('ordinal', 'el ', ord, ' ', dOrd));
      pintarVista();
    };

    const pintarVista = () => {
      const regla = reglaActual();
      if (!regla || !fecha.value) { vista.textContent = estado.tipo === 'puntual' ? '' : 'Elige el día en que empieza.'; return; }
      const prox = ocurrencias({ tipo: estado.tipo, fecha: fecha.value, rrule: regla, hasta: hasta.value || null }, F.hoy(), F.sumarDias(F.hoy(), 400)).slice(0, 4);
      vista.textContent = `${describir(regla, fecha.value)}. Próximas: ${prox.length ? prox.map(F.fmtDiaStr).join(', ') : 'ninguna'}`;
    };

    const pintarEtiquetas = () => {
      etiquetasCaja.replaceChildren(
        ...store.etiquetas('tareas').map(e => chip(e.nombre, e.color, {
          role: 'button', tabindex: 0, class: `chip ${estado.etiquetas.has(e.id) ? '' : 'apagado'}`,
          onclick: () => { estado.etiquetas.has(e.id) ? estado.etiquetas.delete(e.id) : estado.etiquetas.add(e.id); pintarEtiquetas(); },
        })),
        el('button', {
          type: 'button', class: 'chip', style: { '--c': '#6b6b8a' },
          onclick: async () => {
            const nombre = await pedirTexto('Nueva etiqueta', '', { etiqueta: 'Nombre (p. ej. Trading, Estudio, Código)', aceptar: 'Crear' });
            if (!nombre) return;
            try {
              const nueva = await store.insertar('etiquetas', { nombre, color: PALETA[store.filas('etiquetas').length % PALETA.length], ambito: 'tareas' });
              estado.etiquetas.add(nueva.id);
              pintarEtiquetas();
            } catch (e) { error(e); }
          },
        }, '+ etiqueta'));
    };

    const campoFecha = campo('Día', fecha);
    const campoHasta = campo('Hasta', hasta);
    const bloqueRep = el('div', { class: 'bloque-rep' },
      campo('Se repite cada', el('div', { class: 'fila-rep' }, intervalo, frecuencia)),
      diasCaja, mesCaja, vista);
    frecuencia.onchange = pintarRep;
    intervalo.oninput = pintarVista;
    fecha.onchange = () => { if (!estado.diaMes) estado.diaMes = +fecha.value.slice(8); pintarVista(); };
    hasta.onchange = pintarVista;

    const cuerpo = el('div', { class: 'editor-tarea' },
      campo('Título', titulo),
      el('div', { class: 'field' }, el('label', {}, 'Tipo'), tipoCaja, tipoAyuda),
      el('div', { class: 'fila-campos' }, campoFecha, campo('Hora', hora), campo('Duración', duracion)),
      bloqueRep,
      campoHasta,
      el('div', { class: 'fila-campos' }, campo('Persona', persona), campo('Prioridad', prioridad), campo('Grupo de la semana', grupo)),
      el('div', { class: 'field' }, el('label', {}, 'Etiquetas'), etiquetasCaja),
      campo('Notas', notas));

    pintarTipo(); pintarRep(); pintarEtiquetas();

    const guardar = async () => {
      const datos = {
        titulo: titulo.value.trim(),
        notas: notas.value.trim() || null,
        tipo: estado.tipo,
        fecha: fecha.value || null,
        hora: hora.value ? `${hora.value}:00` : null,
        duracion_min: duracion.value ? +duracion.value : null,
        rrule: reglaActual(),
        hasta: estado.tipo === 'temporal' || estado.tipo === 'periodica' ? (hasta.value || null) : null,
        persona: persona.value || null,
        prioridad: prioridad.value || null,
        etiquetas: [...estado.etiquetas],
        grupo_id: grupo.value || null,
      };
      if (!datos.titulo) { toast('Escribe un título.', 'err'); titulo.focus(); return false; }
      if (datos.tipo !== 'puntual' && !datos.fecha) { toast('Una tarea que se repite necesita el día en que empieza.', 'err'); return false; }
      if (datos.tipo === 'temporal' && !datos.hasta) { toast('Una tarea temporal necesita fecha de fin.', 'err'); return false; }
      if (datos.hasta && datos.fecha && datos.hasta < datos.fecha) { toast('La fecha de fin es anterior a la de inicio.', 'err'); return false; }
      if (datos.rrule && (estado.freq === 'WEEKLY') && !estado.dias.size) { toast('Marca al menos un día de la semana.', 'err'); return false; }
      const guardada = tarea?.id
        ? await store.actualizar('tareas', { id: tarea.id }, datos)
        : await store.insertar('tareas', { ...datos, orden: Date.now() % 100000, creado_por: store.usuarioId() });
      fin(guardada);
    };

    const botones = [];
    if (tarea?.id) botones.push({
      texto: 'A la papelera', tipo: 'peligro',
      accion: async () => {
        await store.papelera('tareas', tarea.id);
        toast('Tarea a la papelera', 'ok', { accion: () => store.restaurar('tareas', tarea.id).catch(error) });
        fin(null);
      },
    });
    botones.push({ texto: 'Cancelar', accion: () => fin(null) }, { texto: 'GUARDAR', tipo: 'primario', accion: guardar });
    modal({ titulo: tarea?.id ? 'EDITAR TAREA' : 'NUEVA TAREA', cuerpo, botones, ancho: 580, alCerrar: () => fin(null) });
  });
}
