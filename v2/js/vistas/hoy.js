// HOY (v2 Fluido) — el Día de siempre (tareas con y sin hora, repeticiones, mercado y setups del día,
// jornada, bandeja, comentarios, filtros) con la cara de la demo Fluido: cuenta atrás de lo siguiente,
// barra del día, tira de la semana con gota y línea del día. Cambiar de día no recarga la página: la
// gota se desliza y la línea se repinta (la dirección #/dia/AAAA-MM-DD se actualiza igual).

import { el, chip, avatar, error, reemplazar, modal } from '../../../js/ui.js';
import { ocurrencias, claveOcurrencia, describir } from '../../../js/recurrencia.js';
import { editarTarea } from '../../../js/vistas/tarea-editor.js';
import { hiloComentarios } from '../../../js/vistas/comentarios.js';
import { estadoSetup } from '../../../js/resultado.js';
import { Muelle, entrada } from '../motor.js';

const FILTRO = 'agenda-jh-filtro-dia';
const CK = '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const IZQ = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>';
const DER = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>';
const svgEn = (tag, attrs, s) => { const n = el(tag, attrs); n.innerHTML = s; return n; };

export function montar(cont, ctx) {
  const { store, F, params, avisar } = ctx;
  let dia = /^\d{4}-\d{2}-\d{2}$/.test(params[0] || '') ? params[0] : F.hoy();
  const esHoy = () => dia === F.hoy();

  let filtro = { persona: '', etiquetas: [] };
  try { filtro = { ...filtro, ...JSON.parse(localStorage.getItem(FILTRO) || '{}') }; } catch { /* nada */ }
  const guardarFiltro = () => { try { localStorage.setItem(FILTRO, JSON.stringify(filtro)); } catch { /* nada */ } };

  // ---- utilidades (las mismas reglas que el Día de siempre) ----
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
  const colorOk = c => /^#[0-9a-f]{6}$/i.test(c || '');
  const colorDe = t => {                                     // el color propio (elegido en el Calendario) manda
    if (colorOk(t.color)) return t.color;
    const e = (t.etiquetas || []).map(id => store.fila('etiquetas', id)).find(x => colorOk(x?.color));
    if (e) return e.color;
    const g = t.grupo_id && store.fila('grupos', t.grupo_id);
    if (colorOk(g?.color)) return g.color;
    const p = store.perfil(t.persona);
    return colorOk(p?.color) ? p.color : '#0a84ff';
  };
  const hhmm = m => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const dur = m => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ' ' + (m % 60) + ' min' : ''}` : `${m} min`);
  const quienJornada = () => store.perfil(filtro.persona) || store.usuario();

  // ---- esqueleto ----
  const cuenta = el('div', { class: 'card cuenta' });
  const barraDias = el('div', { class: 'dias-fila' });
  const filtros = el('div', { class: 'filtros-dia' });
  const linea = el('div', { class: 'card linea' });
  const bandeja = el('div', { class: 'bandeja-l' });
  const nuevaBandeja = el('input', { class: 't-in', placeholder: 'Apuntar en la bandeja…', enterkeyhint: 'done',
    onkeydown: e => { if (e.key === 'Enter') { e.preventDefault(); aBandeja(); } } });
  cont.append(el('div', { class: 'hoy-rejilla' },
    el('div', { class: 'hoy-main' }, cuenta, barraDias, filtros, linea),
    el('aside', { class: 'hoy-lado' },
      el('div', { class: 'card bandeja' },
        el('div', { class: 'etq' }, 'Bandeja'),
        el('label', { class: 't-nueva' }, el('span', { class: 'mas' }, '+'), nuevaBandeja),
        bandeja,
        el('p', { class: 'nota-lado' }, 'Lo que no tiene día. «Programar» le pone fecha y hora.')))));

  // ---- acciones ----
  async function alternar(t, d, nodo) {
    const h = hechaEn(t, d);
    try {
      if (h) await store.quitar('tareas_hechas', { tarea_id: t.id, ocurrencia: h.ocurrencia });
      else {
        const ck = nodo?.querySelector('.ck');
        if (ck) { const o = el('span', { class: 'onda' }); ck.append(o); setTimeout(() => o.remove(), 700); }
        await store.insertar('tareas_hechas', { tarea_id: t.id, ocurrencia: claveOcurrencia(t, d), hecha_por: store.usuarioId(), hecha_en: new Date().toISOString() });
      }
      avisar(h ? `Desmarcada · ${t.titulo}` : t.titulo, '', h ? '#8e8e96' : colorDe(t), async () => {
        try {
          if (h) await store.insertar('tareas_hechas', { tarea_id: t.id, ocurrencia: h.ocurrencia, hecha_por: h.hecha_por, hecha_en: h.hecha_en });
          else await store.quitar('tareas_hechas', { tarea_id: t.id, ocurrencia: claveOcurrencia(t, d) });
        } catch (e) { error(e); }
      });
    } catch (e) { error(e); }
  }
  async function aBandeja() {
    const titulo = nuevaBandeja.value.trim();
    if (!titulo) return nuevaBandeja.focus();
    nuevaBandeja.value = '';
    try { await store.insertar('tareas', { titulo, tipo: 'puntual', creado_por: store.usuarioId(), orden: 0 }); avisar('A la bandeja', titulo.length > 24 ? '' : titulo, 'var(--azul)'); }
    catch (e) { nuevaBandeja.value = titulo; error(e); }
  }
  function horaPropuesta() {
    const inicio = F.horaCorta(store.usuario()?.jornada_inicio || '09:00');
    if (!esHoy()) return inicio;
    const ahora = F.minutosDe(F.horaDe(new Date()));
    if (ahora < F.minutosDe(inicio)) return inicio;
    return `${String(Math.min(23, Math.floor(ahora / 60) + 1)).padStart(2, '0')}:00`;
  }
  function botonComentarios(entidad, id, titulo) {
    const n = store.comentarios(entidad, id).length;
    return el('button', {
      class: `coment ${n ? 'hay' : ''}`, title: n ? `${n} comentario${n === 1 ? '' : 's'}` : 'Comentar',
      onclick: e => {
        e.preventDefault(); e.stopPropagation();
        const caja = el('div', {});
        const quitarHilo = hiloComentarios(caja, ctx, entidad, id);
        modal({ titulo: `Comentarios · ${titulo}`, ancho: 560, cuerpo: caja, alCerrar: quitarHilo });
      },
    }, '💬', n ? ` ${n}` : '');
  }

  // ---- cuenta atrás + barra del día ----
  function pintarCuenta() {
    const ts = tareasDelDia(dia).filter(t => t.hora);
    const ahora = esHoy() ? F.minutosDe(F.horaDe(new Date())) : null;
    const items = ts.map(t => ({ t, ini: F.minutosDe(t.hora), fin: F.minutosDe(t.hora) + (t.duracion_min || 30), h: !!hechaEn(t, dia) }))
      .sort((a, b) => a.ini - b.ini);
    const q = quienJornada();
    let desde = F.minutosDe(q?.jornada_inicio || '09:00');
    let hasta = q?.jornada_fin ? F.minutosDe(q.jornada_fin) : desde + 9 * 60;
    for (const x of items) { desde = Math.min(desde, x.ini); hasta = Math.max(hasta, x.fin); }
    if (hasta <= desde) hasta = desde + 60;
    const X = m => ((m - desde) / (hasta - desde)) * 100;

    let etq, titulo, num = null, unidad = '';
    const todas = tareasDelDia(dia);
    const hechas = todas.filter(t => hechaEn(t, dia)).length;
    if (esHoy()) {
      const sig = items.find(x => !x.h && x.fin > ahora);
      if (sig) {
        const enCurso = sig.ini <= ahora;
        const f = enCurso ? sig.fin - ahora : sig.ini - ahora;
        etq = `${enCurso ? 'En curso' : 'Siguiente'} · ${F.horaCorta(sig.t.hora)}`;
        titulo = sig.t.titulo;
        num = f >= 60 ? [String(Math.floor(f / 60)), 'h ', String(f % 60)] : [String(Math.max(1, f))];
        unidad = ' min';
      } else { etq = 'Hoy'; titulo = items.length ? 'Lo de hoy con hora, hecho' : 'Nada con hora hoy'; }
    } else {
      etq = F.diferenciaDias(F.hoy(), dia) > 0 ? 'Más adelante' : 'Pasado';
      titulo = F.fmtDiaLargoStr(dia);
    }
    const numero = el('div', { class: 'num' });
    if (num) { numero.append(num[0]); if (num.length > 1) numero.append(el('small', {}, num[1]), num[2]); numero.append(el('small', {}, unidad)); }
    else numero.append(el('span', { class: 'num-c' }, String(hechas)), el('small', {}, ` / ${todas.length}`));
    const barra = el('div', { class: 'diaBar', title: `Jornada ${hhmm(desde)} – ${hhmm(hasta)}` },
      items.map(x => el('i', { class: x.h ? 'h' : '', title: `${F.horaCorta(x.t.hora)} ${x.t.titulo}`, style: { '--c': colorDe(x.t), left: `${X(x.ini)}%`, width: `${Math.max(1.2, X(x.fin) - X(x.ini))}%` } })),
      ahora != null && ahora > desde && ahora < hasta && el('span', { class: 'yo', style: { left: `clamp(10px, ${X(ahora)}%, calc(100% - 10px))` } }));
    reemplazar(cuenta,
      el('div', { class: 'fila' },
        el('div', { style: { minWidth: 0 } }, el('div', { class: 'etq' }, etq), el('h2', {}, titulo)),
        numero),
      barra,
      el('div', { class: 'diaBar-ej' }, el('span', {}, hhmm(desde)), el('span', {}, hhmm(hasta))));
  }

  // ---- tira de la semana con gota ----
  let gotaDia = null, mGota = null, botonesDia = [];
  function pintarDias() {
    const dias = F.diasDeSemana(F.semanaISO(dia));
    gotaDia = el('span', { class: 'gotaDia' });
    botonesDia = dias.map((d, i) => {
      const ts = tareasDelDia(d);
      const h = ts.filter(t => hechaEn(t, d)).length;
      return el('button', { class: `${d === dia ? 'on' : ''} ${d === F.hoy() ? 'es-hoy' : ''}`, dataset: { d }, onclick: () => irA(d) },
        el('small', {}, F.NOMBRES_DIA[i]), el('b', {}, String(+d.slice(8))),
        el('span', { class: 'cnt' }, ts.length ? `${h}/${ts.length}` : '·'));
    });
    const tira = el('div', { class: 'dias' }, gotaDia, botonesDia);
    reemplazar(barraDias,
      svgEn('button', { class: 'redondo', title: 'Semana anterior', onclick: () => irA(F.sumarDias(dia, -7)) }, IZQ),
      tira,
      svgEn('button', { class: 'redondo', title: 'Semana siguiente', onclick: () => irA(F.sumarDias(dia, 7)) }, DER));
    requestAnimationFrame(() => colocarGota(true));
  }
  function colocarGota(salto) {
    const b = botonesDia.find(x => x.dataset.d === dia);
    if (!gotaDia || !b) return;
    gotaDia.style.width = `${b.offsetWidth}px`;
    if (!mGota || salto) {
      mGota = new Muelle(b.offsetLeft - 5, (x, v) => { const st = Math.min(0.35, Math.abs(v) / 2400); gotaDia.style.transform = `translateX(${x}px) scale(${1 + st},${1 - st * 0.5})`; }, { k: 260, c: 22, eps: 0.1 });
      mGota.fn(mGota.x, 0);
    } else mGota.a(b.offsetLeft - 5);
  }
  function irA(d) {
    if (d === dia) return;
    const mismaSemana = F.semanaISO(d) === F.semanaISO(dia);
    dia = d;
    history.replaceState(null, '', `#/dia/${d}`);
    if (mismaSemana) {
      botonesDia.forEach(b => b.classList.toggle('on', b.dataset.d === d));
      colocarGota(false);
    } else pintarDias();
    pintarCuenta();
    pintarLinea(true);
  }

  // ---- filtros ----
  function pintarFiltros() {
    const personas = [['', 'Todos'], ...store.perfiles().map(p => [p.id, p.nombre])];
    const etiquetas = store.etiquetas('tareas');
    reemplazar(filtros,
      el('div', { class: 'seg' }, personas.map(([id, n]) => el('button', {
        class: filtro.persona === id ? 'on' : '', onclick: () => { filtro.persona = id; guardarFiltro(); pintar(); },
      }, n))),
      etiquetas.length && el('div', { class: 'chips' }, etiquetas.map(e => chip(e.nombre, e.color, {
        role: 'button', tabindex: 0, class: `chip ${filtro.etiquetas.length && !filtro.etiquetas.includes(e.id) ? 'apagado' : ''}`,
        onclick: () => {
          filtro.etiquetas = filtro.etiquetas.includes(e.id) ? filtro.etiquetas.filter(x => x !== e.id) : [...filtro.etiquetas, e.id];
          guardarFiltro(); pintar();
        },
      }))),
      el('button', { class: 'btnA', onclick: () => editarTarea(null, { fecha: dia, tipo: 'puntual', hora: horaPropuesta() }).catch(error) }, '+ Tarea'));
  }

  // ---- línea del día ----
  function filaTarea(t, conHora) {
    const h = hechaEn(t, dia);
    const quien = h && store.perfil(h.hecha_por);
    const persona = store.perfil(t.persona);
    const g = t.grupo_id && store.fila('grupos', t.grupo_id);
    const etiquetas = (t.etiquetas || []).map(id => store.fila('etiquetas', id)).filter(Boolean);
    const ini = t.hora ? F.minutosDe(t.hora) : null;
    const nodo = el('div', { class: `ev ${h ? 'h' : ''} ${conHora ? '' : 'sin-hora'}`, style: { '--c': colorDe(t) }, dataset: { id: t.id } },
      el('div', { class: 'hr' }, conHora ? hhmm(ini) : '—', t.duracion_min && el('small', {}, dur(t.duracion_min))),
      el('span', { class: 'bar' }),
      el('div', { class: 'ev-c', title: 'Clic para editar' },
        el('b', {}, t.titulo),
        el('small', { class: 'ev-meta' },
          t.rrule && el('span', { title: describir(t.rrule, t.fecha) }, `↻ ${describir(t.rrule, t.fecha)}`),
          g && el('span', {}, g.nombre),
          t.prioridad && el('span', { class: `pri p-${t.prioridad}` }, t.prioridad.toLowerCase()),
          ...etiquetas.map(e => chip(e.nombre, e.color)),
          quien && el('span', { class: 'hecha-por' }, `✓ ${quien.nombre} ${F.fmtHora(h.hecha_en)}`))),
      el('div', { class: 'ev-d' }, botonComentarios('tarea', t.id, t.titulo), persona && avatar(persona, 22),
        svgEn('button', { class: 'ck', title: h ? 'Desmarcar' : 'Marcar como hecha', 'aria-pressed': h ? 'true' : 'false' }, CK)));
    nodo.addEventListener('click', ev => {
      if (ev.target.closest('.coment')) return;
      if (ev.target.closest('.ck')) return alternar(t, dia, nodo);
      editarTarea(t).catch(error);
    });
    return nodo;
  }
  function filaEvento(it) {
    if (it.tipo === 'anotacion') {
      const a = it.a;
      return el('a', { class: 'ev evento', href: '#/mercado', style: { '--c': '#ffd60a' }, title: 'Ver en Mercado' },
        el('div', { class: 'hr' }, hhmm(it.min)), el('span', { class: 'bar rombo' }),
        el('div', { class: 'ev-c' }, el('b', {}, a.titulo),
          el('small', { class: 'ev-meta' }, el('span', { class: 'tipo-ev' }, 'Mercado'), el('span', {}, '★'.repeat(a.importancia)),
            !a.despues && new Date(a.fecha_hora) < new Date() && el('span', { class: 'falta' }, 'falta el después'))),
        el('div', { class: 'ev-d' }, botonComentarios('anotacion', a.id, a.titulo)));
    }
    const s = it.s;
    const est = estadoSetup(s);
    return el('a', { class: 'ev evento', href: `#/setups/${s.id}`, style: { '--c': '#bf5af2' }, title: 'Ver el setup' },
      el('div', { class: 'hr' }, hhmm(it.min)), el('span', { class: 'bar rombo' }),
      el('div', { class: 'ev-c' }, el('b', {}, `${s.simbolo} · ${s.direccion === 'largo' ? '↑ largo' : '↓ corto'} · ${s.temporalidad}`),
        el('small', { class: 'ev-meta' }, el('span', { class: 'tipo-ev' }, 'Setup'), el('span', { class: `estado-mini e-${est.clave}` }, est.texto))),
      el('div', { class: 'ev-d' }, botonComentarios('setup', s.id, `${s.simbolo} ${s.temporalidad}`)));
  }
  function pintarLinea(animar) {
    const ts = tareasDelDia(dia);
    const sin = ts.filter(t => !t.hora).sort((a, b) => a.titulo.localeCompare(b.titulo));
    const conHora = ts.filter(t => t.hora).map(t => ({ tipo: 'tarea', min: F.minutosDe(t.hora), t }));
    const desdeMs = F.madridAInstante(dia, '00:00').getTime();
    const hastaMs = F.madridAInstante(F.sumarDias(dia, 1), '00:00').getTime();
    const enDia = iso => { const x = new Date(iso).getTime(); return x >= desdeMs && x < hastaMs; };
    const anot = store.vivas('anotaciones', a => enDia(a.fecha_hora)).map(a => ({ tipo: 'anotacion', min: F.minutosDe(F.fmtHora(a.fecha_hora)), a }));
    const sets = [];   // «Solo operaciones» (decisión de Jose Luis, 7-nov): los setups planificados ya no salen en la v2
    const q = quienJornada();
    const jornada = [];
    if (q) {
      jornada.push({ tipo: 'jornada', min: F.minutosDe(q.jornada_inicio || '09:00'), texto: `☀ Inicio de jornada${filtro.persona ? ' · ' + q.nombre : ''} · ${F.horaCorta(q.jornada_inicio || '09:00')}` });
      if (q.jornada_fin) jornada.push({ tipo: 'jornada', min: F.minutosDe(q.jornada_fin), texto: `☾ Fin de jornada · ${F.horaCorta(q.jornada_fin)}` });
    }
    const items = [...conHora, ...anot, ...sets, ...jornada].sort((x, y) => x.min - y.min || (x.tipo === 'jornada' ? -1 : 1));
    const ahora = esHoy() ? F.minutosDe(F.horaDe(new Date())) : null;
    const nodos = [];
    if (sin.length) nodos.push(el('div', { class: 'lin-cab' }, 'Sin hora'), ...sin.map(t => filaTarea(t, false)), el('div', { class: 'lin-cab' }, 'Con hora'));
    let puesto = !esHoy();
    for (const it of items) {
      if (!puesto && it.min > ahora) { nodos.push(el('div', { class: 'ahora' }, F.horaDe(new Date()))); puesto = true; }
      nodos.push(it.tipo === 'tarea' ? filaTarea(it.t, true) : it.tipo === 'jornada' ? el('div', { class: 'jornada' }, it.texto) : filaEvento(it));
    }
    if (!puesto) nodos.push(el('div', { class: 'ahora' }, F.horaDe(new Date())));
    const hayAlgo = sin.length || items.some(i => i.tipo !== 'jornada');
    if (!hayAlgo) nodos.push(el('div', { class: 'libre' }, el('b', {}, 'Día libre'), 'Nada planificado. Pulsa «+ Tarea» para añadir algo.'));
    reemplazar(linea, nodos);
    if (animar) entrada(linea.querySelectorAll('.ev'), { dy: 10, paso: 22 });
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
      const n = el('div', { class: `t ${h ? 'h' : ''}`, style: { '--c': colorDe(t) } },
        svgEn('span', { class: 'ck', role: 'button', title: h ? 'Desmarcar' : 'Marcar como hecha' }, CK),
        el('div', { class: 'tx', title: 'Clic para editar' }, el('span', {}, t.titulo), ' ', ...etiquetas.map(e => chip(e.nombre, e.color))),
        !h && el('button', { class: 'prog', title: 'Ponerle día y hora' }, 'Programar'));
      n.addEventListener('click', ev => {
        if (ev.target.closest('.ck')) return alternar(t, dia, n);
        if (ev.target.closest('.prog')) return editarTarea({ ...t, fecha: dia }).catch(error);
        editarTarea(t).catch(error);
      });
      return n;
    };
    reemplazar(bandeja,
      pendientes.length ? el('div', { class: 'lista-b' }, pendientes.map(fila)) : el('div', { class: 'vacio-b' }, 'Bandeja vacía.'),
      hechas.length ? el('details', { class: 'hechas-b' }, el('summary', {}, `${hechas.length} hecha${hechas.length === 1 ? '' : 's'}`), el('div', { class: 'lista-b' }, hechas.map(fila))) : null);
  }

  function pintar() { pintarCuenta(); pintarDias(); pintarFiltros(); pintarLinea(false); pintarBandeja(); }
  pintarCuenta(); pintarDias(); pintarFiltros(); pintarLinea(true); pintarBandeja();
  const quitar = store.on(['tareas', 'tareas_hechas', 'etiquetas', 'grupos', 'anotaciones', 'setups', 'perfiles', 'comentarios'], ts => {
    pintarCuenta();
    // la tira solo cambia de cuentas: se repintan los contadores sin mover la gota
    const dias = F.diasDeSemana(F.semanaISO(dia));
    botonesDia.forEach((b, i) => { const lista = tareasDelDia(dias[i]); b.querySelector('.cnt').textContent = lista.length ? `${lista.filter(t => hechaEn(t, dias[i])).length}/${lista.length}` : '·'; });
    if (ts.has('perfiles') || ts.has('etiquetas')) pintarFiltros();
    pintarLinea(false);
    pintarBandeja();
  });
  const reloj = setInterval(() => { if (esHoy()) { pintarCuenta(); pintarLinea(false); } }, 60000);
  const alCambiarTam = () => colocarGota(true);
  addEventListener('resize', alCambiarTam);
  return () => { quitar(); clearInterval(reloj); removeEventListener('resize', alCambiarTam); };
}
