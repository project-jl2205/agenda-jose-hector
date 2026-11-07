// CALENDARIO (v2 «Fluido», 6-nov-2026) — el de la demo salidas/agenda-demos/6-fluido.html, sobre los datos reales.
//   · El mes: cada día con su importancia (Normal → Crítico), su color y su nota (dias_calendario: compartido), lo que
//     tiene ese día (tareas de un día y noticias clave; las rutinas no se pintan en el mes) y, en el móvil, puntos.
//   · Doble clic en un día (en el móvil, un toque) y se hincha: importancia, color y nota del día, su lista por horas
//     (tareas de un día, rutinas y noticias, en orden) y el compositor para añadir o cambiar, con ruedas de la hora.
//   · Datos (SQL 003): tareas (+ color, es_evento, excepciones), tareas_hechas, dias_calendario, noticias_clave (las
//     sube el agente del PC de Jose Luis desde el Calendario Alpha) y noticias_ocultas (cada uno las suyas;
//     «volver a mostrar» = oculta:false, nunca se borra la fila).
// Ruta: #/calendario[/AAAA-MM]

import { ocurrencias, claveOcurrencia, describir } from '../../../js/recurrencia.js';
import { Muelle, QUIETO, EASE, DUR, detener } from '../motor.js';

const IMP = [
  { n: 'Normal', c: null }, { n: 'A tener en cuenta', c: '#0a84ff' }, { n: 'Importante', c: '#ffd60a' },
  { n: 'Muy importante', c: '#ff9f0a' }, { n: 'Crítico', c: '#ff453a' },
];
const COLS = ['#0a84ff', '#64d2ff', '#30d158', '#ffd60a', '#ff9f0a', '#ff453a', '#ec4899', '#bf5af2', '#8e8e96'];
const SIGLAS = ['', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
const DIA_LARGO = ['', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
const SEM_CORTA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const REGLA = { lv: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', diario: 'FREQ=DAILY' };
const CLAVE_NOT = 'agenda-jh-noticias';
const colorOk = c => /^#[0-9a-f]{6}$/i.test(c || '');
const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const pad2 = n => String(n).padStart(2, '0');
const minDe = h => (h ? Number(String(h).slice(0, 2)) * 60 + Number(String(h).slice(3, 5)) : -1);
const hhmm = m => `${pad2(Math.floor(m / 60) % 24)}:${pad2(m % 60)}`;
const durTxt = m => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`);
const CK = '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const LAPIZ = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M14 6l4 4"/></svg>';
const PAPELERA = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>';
const crecer = ta => { ta.style.height = 'auto'; ta.style.height = `${ta.scrollHeight + 2}px`; };

/* ---- rueda tipo alarma del iPhone: arrastrar (con inercia), rueda del ratón, clic en un número o flechas; da la vuelta y
   encaja con muelle (la misma de la demo) ---- */
const ALTO_R = 36, PASO_R = 20, RADIO_R = 98;
function crearRueda(cont, n, inicial, alCambiar) {
  const tam = document.createElement('div'); tam.className = 'tambor'; cont.replaceChildren(tam);
  const filas = Array.from({ length: 11 }, () => tam.appendChild(document.createElement('span')));
  const mod = k => ((k % n) + n) % n;
  let p = inicial, ultimo = mod(inicial), silencio = false, va = false;   // va: el muelle la lleva a m.obj (aún gira)
  const pintar = () => {
    const base = Math.round(p);
    filas.forEach((sp, i) => {
      const k = base + i - 5, d = k - p, ang = d * PASO_R;
      sp.textContent = pad2(mod(k));
      sp.style.transform = `rotateX(${-ang}deg) translateZ(${RADIO_R}px)`;
      sp.style.visibility = Math.abs(ang) < 88 ? '' : 'hidden';
      sp.style.opacity = Math.max(0.15, 1 - Math.abs(d) * 0.2);
      sp.classList.toggle('c', Math.abs(d) < 0.5);
    });
    const v = mod(base);
    if (v !== ultimo) { ultimo = v; if (!silencio) { alCambiar(v); if (matchMedia('(pointer: coarse)').matches) navigator.vibrate?.(4); } }
  };
  const m = new Muelle(p, x => { p = x; pintar(); }, { k: 180, c: 25, eps: 0.002, fin: () => { silencio = false; va = false; } });
  const ir = (obj, v = 0) => { m.x = p; m.v = v; va = true; m.a(obj); };
  let y0 = null, p0 = 0, huella = [], movido = false;
  cont.addEventListener('pointerdown', ev => {
    ev.preventDefault(); cont.focus({ preventScroll: true }); detener(m); va = false; silencio = false;
    y0 = ev.clientY; p0 = p; huella = [[ev.clientY, performance.now()]]; movido = false; cont.setPointerCapture(ev.pointerId);
  });
  cont.addEventListener('pointermove', ev => {
    if (y0 === null) return;
    const dy = ev.clientY - y0; if (Math.abs(dy) > 3) movido = true;
    p = p0 - dy / ALTO_R; pintar();
    huella.push([ev.clientY, performance.now()]); if (huella.length > 6) huella.shift();
  });
  const soltar = ev => {
    if (y0 === null) return; y0 = null;
    if (!movido) {                                         // un clic: a la fila tocada
      const r = cont.getBoundingClientRect(), y = ev.clientY - (r.top + r.height / 2);
      if (Math.abs(y) < RADIO_R) return ir(Math.round(p) + Math.round(Math.asin(y / RADIO_R) * 180 / Math.PI / PASO_R));
      return ir(Math.round(p));
    }
    const a = huella[0], b = huella[huella.length - 1], dt = (b[1] - a[1]) / 1000;
    const vel = dt > 0 && performance.now() - b[1] < 80 ? -(b[0] - a[0]) / ALTO_R / dt : 0;   // filas por segundo
    ir(Math.round(p + vel * 0.22), vel);
  };
  cont.addEventListener('pointerup', soltar); cont.addEventListener('pointercancel', soltar);
  let tRueda = null;
  cont.addEventListener('wheel', ev => {
    ev.preventDefault(); detener(m); va = false; silencio = false;
    p += ev.deltaY / (ev.deltaMode === 1 ? 3 : 100); pintar();
    clearTimeout(tRueda); tRueda = setTimeout(() => ir(Math.round(p)), 110);
  }, { passive: false });
  cont.addEventListener('keydown', ev => {
    if (ev.key !== 'ArrowDown' && ev.key !== 'ArrowUp') return;
    ev.preventDefault(); ev.stopPropagation(); silencio = false;
    const desde = Math.abs(p - m.obj) > 0.01 ? m.obj : Math.round(p);
    ir(desde + (ev.key === 'ArrowDown' ? 1 : -1));
  });
  pintar();
  return {
    valor: () => mod(Math.round(p)),
    final: () => mod(Math.round(va ? m.obj : p)),          // donde va a parar (si aún gira), no por donde pasa
    poner: v => { const base = Math.round(p), dd = mod(v - mod(base)); silencio = true; ir(base + (dd > n / 2 ? dd - n : dd)); },  // por el camino corto, sin avisar
  };
}

export function montar(cont, ctx) {
  const { store, F, params, avisar, navegar, ui } = ctx;
  const yo = () => store.usuarioId();
  const tactil = () => matchMedia('(pointer: coarse)').matches;
  const fallo = e => ui.error(e);
  let mes = /^\d{4}-\d{2}$/.test(params[0] || '') ? params[0] : F.hoy().slice(0, 7);
  let celdaSel = null, hoja = null, ocultaF = null, CMP = null, hojaSaliendo = null;
  let borrarPend = null;          // { id, f }: la pregunta «¿qué borro?» de una rutina (se repinta con las filas)
  let abiertoEn = 0;              // el 2.º clic de un doble clic no debe caer en la hoja recién abierta (ni cerrarla)
  let verNoticias = true; try { verNoticias = localStorage.getItem(CLAVE_NOT) !== 'no'; } catch { /* sin almacenamiento */ }

  /* ---- datos ---- */
  const perfiles = () => store.perfiles();
  const nombreCorto = p => (p?.nombre || '?').split(' ')[0];
  const personaDe = t => t.persona || (t.grupo_id && store.fila('grupos', t.grupo_id)?.persona) || null;
  const colorDe = t => {                                     // solo colores #rrggbb: van dentro de style="…"
    if (colorOk(t.color)) return t.color;
    const e = (t.etiquetas || []).map(id => store.fila('etiquetas', id)).find(x => colorOk(x?.color));
    if (e) return e.color;
    const g = t.grupo_id && store.fila('grupos', t.grupo_id);
    if (colorOk(g?.color)) return g.color;
    const p = store.perfil(personaDe(t));
    return colorOk(p?.color) ? p.color : '#0a84ff';
  };
  const esRutina = t => !!t.rrule && t.tipo !== 'puntual';
  const diaDe = f => store.fila('dias_calendario', { fecha: f }) || null;
  const colorDia = f => { const D = diaDe(f); return (D && colorOk(D.color) && D.color) || IMP[D?.importancia || 0]?.c || null; };
  const ocultas = () => new Set(store.filas('noticias_ocultas', o => o.usuario === yo() && o.oculta).map(o => o.noticia_id));
  const itemTarea = (t, f) => {
    const ini = F.horaCorta(t.hora), fin = t.hora && t.duracion_min ? F.sumarMinutosHora(t.hora, t.duracion_min) : '';
    return { k: 't', id: t.id, t, tipo: t.es_evento ? 'evento' : 'tarea', ini, fin, titulo: t.titulo, nota: t.notas || '', c: colorDe(t),
      rutina: esRutina(t), persona: personaDe(t), hecha: store.hecha(t.id, claveOcurrencia(t, f)) };
  };
  const itemNoticia = (n, hora) => ({ k: 'n', id: n.id, tipo: 'noticia', ini: n.sin_hora ? '' : hora, fin: '', titulo: n.titulo, nota: n.detalle || '', c: colorOk(n.color) ? n.color : '#ff453a' });
  const orden = (a, b) => minDe(a.ini) - minDe(b.ini) || (a.tipo === 'noticia') - (b.tipo === 'noticia') || String(a.titulo).localeCompare(String(b.titulo));
  // todo lo de un rango de días de una vez (el mes entero = unas 40 llamadas a ocurrencias por tarea, no 40 × tareas)
  function indice(desde, hasta) {
    const m = new Map();
    const meter = (f, x) => { if (!m.has(f)) m.set(f, []); m.get(f).push(x); };
    for (const t of store.vivas('tareas', x => x.fecha || x.rrule)) for (const f of ocurrencias(t, desde, hasta)) meter(f, itemTarea(t, f));
    if (verNoticias) {
      const fuera = ocultas();
      for (const n of store.filas('noticias_clave')) {
        if (fuera.has(n.id)) continue;
        const { dia, hora } = F.instanteAMadrid(n.hora);
        if (dia >= desde && dia <= hasta) meter(dia, itemNoticia(n, hora));
      }
    }
    for (const L of m.values()) L.sort(orden);
    return m;
  }
  const itemsDe = f => indice(f, f).get(f) || [];
  const buscarItem = (id, f) => itemsDe(f).find(x => x.id === id) || null;

  /* ---- el mes ---- */
  const primerLunes = () => { const d = `${mes}-01`; return F.sumarDias(d, 1 - F.diaSemana(d)); };
  function diasDelMes() {
    const [y, m] = mes.split('-').map(Number), ult = `${mes}-${pad2(F.diasDelMes(y, m))}`, fin = F.sumarDias(ult, 7 - F.diaSemana(ult)), L = [];
    for (let d = primerLunes(); d <= fin; d = F.sumarDias(d, 1)) L.push(d);
    return L;
  }
  const fLargo = f => `${DIA_LARGO[F.diaSemana(f)]} ${Number(f.slice(8))}`;
  // si están al día lo dice el latido del agente del PC de Jose Luis (agente_estado, fila 'noticias', cada 5 min);
  // no la última noticia cambiada: el agente solo sube las nuevas o cambiadas y en una semana tranquila no cambia ninguna
  function estadoNoticias() {
    const a = store.fila('agente_estado', 'noticias');
    if (!a) return 'Las noticias clave llegan cuando el agente del PC de Jose Luis está encendido';
    const d = a.detalle || {}, vivo = Date.now() - new Date(a.latido).getTime() < 15 * 60000;
    if (vivo && d.calendario_ok) return `Noticias clave al día · comprobadas a las ${F.horaDe(d.comprobadas_en || a.latido)}`;
    const ult = d.comprobadas_en ? ` · noticias del ${F.fmtDiaHora(d.comprobadas_en)}` : '';
    return vivo ? `Calendario Alpha apagado${ult}` : `PC de Jose Luis apagado${ult}`;
  }
  // sin ninguna noticia ni señal del agente (no se sube ninguna), el calendario no habla de noticias ni enseña su interruptor
  const hayNoticias = () => store.filas('noticias_clave').length > 0 || !!store.fila('agente_estado', 'noticias');
  const pistaHTML = () => { const n = hayNoticias();
    return `${n ? esc(estadoNoticias()) : ''}<span class="tuto">${n ? ' · ' : ''}${tactil() ? 'toca un día para abrirlo' : 'doble clic en un día para abrirlo'}</span>`; };
  function celdaHTML(f, porDia) {
    const D = diaDe(f) || {}, col = colorDia(f), hoyF = F.hoy();
    const propios = (porDia.get(f) || []).filter(x => x.k === 'n' || !x.rutina);   // la rutina no se pinta en el mes
    const max = D.nota ? 2 : 3;
    const cls = ['cd', f.slice(0, 7) !== mes && 'fuera', f === hoyF && 'hoy', f < hoyF && 'pasado', F.diaSemana(f) > 5 && 'finde', col && 'marcado', f === celdaSel && 'sel'].filter(Boolean).join(' ');
    return `<button class="${cls}" data-f="${f}"${col ? ` style="--dc:${col}"` : ''} aria-label="${esc(fLargo(f))}${propios.length ? ` · ${propios.length} cosa${propios.length === 1 ? '' : 's'}` : ''}">`
      + `<span class="cd-n"><b>${Number(f.slice(8))}</b></span>${D.importancia ? `<span class="cd-imp">${IMP[D.importancia].n}</span>` : ''}${D.nota ? `<span class="cd-nota">${esc(D.nota)}</span>` : ''}`
      + propios.slice(0, max).map(x => `<span class="cd-it${x.k === 'n' ? ' nt-clave' : ''}"><i style="--c:${x.c}"></i>${x.ini ? `<em>${x.ini}</em>` : ''}<span>${esc(x.titulo)}</span></span>`).join('')
      + `${propios.length > max ? `<span class="cd-mas">+${propios.length - max} más</span>` : ''}<span class="cd-puntos">${propios.slice(0, 5).map(x => `<i style="--c:${x.c}"></i>`).join('')}</span></button>`;
  }
  function paginaHTML() {
    const [y, m] = mes.split('-').map(Number), nombre = F.fmtMes(y, m).split(' de ')[0];
    return `<div class="card cal-cab"><h2>${esc(nombre)}<small>${y}</small></h2>
      <div class="cal-nav">${mes !== F.hoy().slice(0, 7) ? '<button class="pastilla" data-mes="hoy">Hoy</button>' : ''}<button class="redondo" data-mes="-1" aria-label="Mes anterior">‹</button><button class="redondo" data-mes="1" aria-label="Mes siguiente">›</button></div>
      <div class="cal-ley">${IMP.slice(1).map(i => `<span><i style="--c:${i.c}"></i>${i.n}</span>`).join('')}${hayNoticias() ? `<button class="pastilla ${verNoticias ? 'on' : ''}" data-notcl="1">${verNoticias ? 'Noticias clave: sí' : 'Noticias clave: no'}</button>` : ''}<span class="pista" id="calPista">${pistaHTML()}</span></div></div>
      <div class="cal-sem">${SEM_CORTA.map(d => `<span>${d}</span>`).join('')}</div>
      <div class="cal-rej" id="calRej"></div>`;
  }
  function repintarCeldas() {
    const r = cont.querySelector('#calRej'); if (!r) return;
    const dias = diasDelMes(), porDia = indice(dias[0], dias[dias.length - 1]);
    const h = dias.map(f => celdaHTML(f, porDia)).join('');
    if (r._html !== h) { r.innerHTML = h; r._html = h; }
    if (ocultaF) { const c = r.querySelector(`.cd[data-f="${ocultaF}"]`); if (c) c.style.visibility = 'hidden'; }
    const p = cont.querySelector('#calPista'); if (p) p.innerHTML = pistaHTML();
  }
  function pintarPagina(dir = 0) {
    cont.innerHTML = paginaHTML();
    repintarCeldas();
    if (dir && !QUIETO) {
      cont.querySelector('#calRej')?.animate([{ opacity: 0, transform: `translateX(${dir * 60}px)` }, { opacity: 1, transform: 'none' }], { duration: DUR(), easing: EASE() });
      cont.querySelector('.cal-cab h2')?.animate([{ opacity: 0, transform: `translateY(${dir * 10}px)` }, { opacity: 1, transform: 'none' }], { duration: DUR(), easing: EASE() });
    }
  }
  function cambiarMes(k) {
    const [y, m] = mes.split('-').map(Number);
    const nuevo = k === 'hoy' ? F.hoy().slice(0, 7) : (() => { const t = y * 12 + (m - 1) + Number(k); return `${Math.floor(t / 12)}-${pad2((t % 12) + 1)}`; })();
    if (nuevo === mes) return;
    const dir = nuevo > mes ? 1 : -1; mes = nuevo;
    history.replaceState(null, '', `#/calendario/${mes}`);
    pintarPagina(dir);
  }
  function alternarNoticias() {
    verNoticias = !verNoticias; try { localStorage.setItem(CLAVE_NOT, verNoticias ? 'si' : 'no'); } catch { /* nada */ }
    const b = cont.querySelector('[data-notcl]'); if (b) { b.classList.toggle('on', verNoticias); b.textContent = verNoticias ? 'Noticias clave: sí' : 'Noticias clave: no'; }
    repintarTodo();
    avisar(verNoticias ? 'Noticias clave a la vista' : 'Noticias clave ocultas', '', verNoticias ? '#ff453a' : '#8e8e96');
  }
  const seleccionarCelda = c => { celdaSel = c.dataset.f; cont.querySelectorAll('.cd.sel').forEach(x => x.classList.remove('sel')); c.classList.add('sel'); };

  /* ---- filas del día (las del día hinchado). Se repintan siempre que cambia algo (también con el compositor abierto:
         el compositor vive aparte, en .cmp-sitio, y no se toca) ---- */
  const borrarHTML = (t, f) => `<div class="borrar-fila">Es de una rutina (↻ ${esc(describir(t.rrule, t.fecha))}). ¿Qué borro? <button class="op2" data-borrar1="${esc(t.id)}" data-f="${f}">Solo el ${esc(fLargo(f))}</button><button class="op2 rojo" data-borrartodo="${esc(t.id)}" data-f="${f}">Toda la rutina</button><button class="op2" data-borrarno="1">Nada</button></div>`;
  function filaHTML(x, f) {
    const not = x.k === 'n', dur = x.ini && x.fin ? durTxt((minDe(x.fin) - minDe(x.ini) + 1440) % 1440) : '';
    const p = !not && store.perfil(x.persona);
    const meta = not ? `<span class="chip nc">Noticia clave</span>${x.nota ? `<span>${esc(x.nota)}</span>` : ''}`
      : `${x.tipo === 'evento' ? '<span class="chip">Evento</span>' : ''}${x.rutina ? `<span class="chip">↻ ${esc(describir(x.t.rrule, x.t.fecha))}</span>` : ''}${x.nota ? `<span>${esc(x.nota)}</span>` : ''}${p ? `<span class="av-p" style="--c:${colorOk(p.color) ? p.color : '#8e8e96'}" title="${esc(p.nombre)}">${esc((p.nombre || '?').slice(0, 1))}</span>` : ''}`;
    return `<div class="ev ${x.hecha ? 'h' : ''} ${not ? 'noticia' : ''} ${!not && CMP?.id === x.id ? 'editando' : ''}" data-it="${esc(x.id)}" data-f="${f}" data-k="${x.k}" style="--c:${x.c}">
      <div class="hr">${x.ini || '—'}<small>${not ? 'dato macro' : x.ini ? (x.fin ? `${x.fin}<span class="dur"> · ${dur}</span>` : 'puntual') : 'sin hora'}</small></div>
      <span class="bar"></span>
      <div class="cont"><b>${esc(x.titulo)}</b><small class="meta">${meta}</small></div>
      <span class="ev-acc">${not ? `<button class="del" data-ocultar="${esc(x.id)}" title="Quitar esta noticia de tu calendario" aria-label="Quitar esta noticia">${PAPELERA}</button>`
        : `<button data-editit="${esc(x.id)}" title="Cambiar" aria-label="Cambiar">${LAPIZ}</button><button class="del" data-borrarit="${esc(x.id)}" title="Borrar" aria-label="Borrar">${PAPELERA}</button>`}</span>
      ${not ? '<span class="ncl">!</span>' : `<span class="ck">${CK}</span>`}</div>${!not && borrarPend?.id === x.id && borrarPend.f === f ? borrarHTML(x.t, f) : ''}`;
  }
  function filasHTML(f) {
    const L = itemsDe(f), sin = L.filter(x => !x.ini), con = L.filter(x => x.ini), esHoy = f === F.hoy(), ahora = minDe(F.horaDe());
    let h = sin.length ? `<div class="ev-sec">Todo el día</div>${sin.map(x => filaHTML(x, f)).join('')}${con.length ? '<div class="ev-sec">Por horas</div>' : ''}` : '';
    let puesto = !esHoy;
    for (const x of con) { if (!puesto && minDe(x.ini) > ahora) { h += `<div class="ahora">${F.horaDe()}</div>`; puesto = true; } h += filaHTML(x, f); }
    if (!puesto && con.length) h += `<div class="ahora">${F.horaDe()}</div>`;
    if (!L.length) h += '<div class="libre chica"><b>Día libre</b>Añade abajo lo que haya que hacer o un evento.</div>';
    return h;
  }
  const botonMasHTML = f => `<button class="mas-dia" data-abrircmp="${f}"><span>+</span>Añadir a este día</button>`;

  /* ---- el compositor: texto, hora con ruedas, tipo, quién, repetir, color y detalle. Hay UNO como mucho y vive en
         .cmp-sitio, debajo de las filas (para añadir y para cambiar: la fila que se cambia se queda marcada) ---- */
  function repClave(t) {
    if (!esRutina(t)) return 'no';
    if (t.tipo !== 'permanente' || t.hasta) return 'igual';   // con fecha de fin (temporal) o cada N…: se deja como está
    const r = String(t.rrule).toUpperCase();
    if (r === REGLA.lv) return 'lv';
    if (r === REGLA.diario || r === 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR,SA,SU') return 'diario';
    if (/^FREQ=WEEKLY;BYDAY=(MO|TU|WE|TH|FR|SA|SU)$/.test(r)) return 'sem';
    return 'igual';                                           // mensual, cada N semanas…: se deja como está
  }
  function horaPorDefecto(f) {                               // hoy: el siguiente cuarto de hora; otro día: las 9
    if (f !== F.hoy()) return '09:00';
    const m = Math.ceil((minDe(F.horaDe()) + 1) / 15) * 15;
    return m >= 1440 ? '23:45' : hhmm(m);
  }
  const limpio = s => String(s ?? '').replace(/\s+/g, ' ').trim();
  function compositorHTML(f, x, base) {
    const t = x?.t || null, b = base || {};
    const persona = t ? personaDe(t) : (b.persona || yo());
    CMP = { f, id: t?.id || null, tipo: t ? (t.es_evento ? 'evento' : 'tarea') : (b.tipo || 'tarea'), persona,
      rep: t ? repClave(t) : (b.rep || 'no'),
      // el color heredado (de la persona, el grupo…) se enseña pero NO se guarda como suyo: solo si se elige uno
      propio: !!t && colorOk(t.color), colorTocado: !t && !!b.colorTocado && colorOk(b.c),
      c: (t ? colorDe(t) : (b.colorTocado && colorOk(b.c) ? b.c : colorDe({ persona }))).toLowerCase(),
      ini: t?.hora ? F.horaCorta(t.hora) : horaPorDefecto(f), fin: t?.hora && t.duracion_min ? F.sumarMinutosHora(t.hora, t.duracion_min) : '',
      sin: !!t && !t.hora, campo: 'ini', titulo0: limpio(t?.titulo), notas0: limpio(t?.notas) };
    Object.assign(CMP, { tipo0: CMP.tipo, persona0: CMP.persona, rep0: CMP.rep, ini0: CMP.ini, fin0: CMP.fin, sin0: CMP.sin });   // lo de partida
    const op = (attr, k, n, on) => `<button class="op2 ${on ? 'on' : ''}" data-${attr}="${esc(k)}">${esc(n)}</button>`;
    const reps = [['no', 'No'], ['lv', 'Lun–Vie'], ['sem', `Cada ${DIA_LARGO[F.diaSemana(f)]}`], ['diario', 'A diario']];
    if (CMP.rep === 'igual') reps.unshift(['igual', `Como está (${describir(t.rrule, t.fecha)})`]);
    const conFin = !CMP.sin && !!CMP.fin;
    return `<div class="cmp" data-cmp="${f}">
      ${t ? `<div class="cmp-que">Cambiando «${esc(t.titulo)}»</div>` : ''}
      <div class="cmp-f"><input class="cmp-t" value="${esc(CMP.titulo0)}" maxlength="200" placeholder="${t ? 'Texto' : 'Qué hay que hacer o qué pasa…'}" autocomplete="off" spellcheck="false" enterkeyhint="done">
        <button class="btnA" data-cmpok="1">${t ? 'Guardar' : 'Añadir'}</button><button class="redondo" data-cmpno="1" title="${t ? 'Cancelar' : 'Cerrar'}" aria-label="${t ? 'Cancelar' : 'Cerrar'}">×</button></div>
      <div class="cmp-tiempo">
        <div class="relojes ${CMP.sin ? 'apagado' : ''}"><span class="banda"></span><div class="rueda" data-rueda="h" tabindex="0" aria-label="Horas"></div><b class="dos">:</b><div class="rueda" data-rueda="m" tabindex="0" aria-label="Minutos"></div></div>
        <div class="horas-ch"><button class="hch ${CMP.sin ? '' : 'on'}" data-hch="ini"><small>Empieza</small><b>${CMP.sin ? '—' : CMP.ini}</b></button>
          <button class="hch ${conFin && minDe(CMP.fin) < minDe(CMP.ini) ? 'sig' : ''} ${conFin && minDe(CMP.fin) === minDe(CMP.ini) ? 'mal' : ''}" data-hch="fin"${conFin && minDe(CMP.fin) < minDe(CMP.ini) ? ' title="Acaba al día siguiente"' : ''}><small>Acaba</small><b>${conFin ? CMP.fin : '—'}</b><i data-hfinq="1" title="Quitar la hora de fin" ${conFin ? '' : 'hidden'}>×</i></button>
          <button class="op2 ${CMP.sin ? 'on' : ''}" data-hsin="1">Todo el día</button></div>
      </div>
      <div class="cmp-o">
        <span class="grp">${op('cmptipo', 'tarea', 'Tarea', CMP.tipo === 'tarea')}${op('cmptipo', 'evento', 'Evento', CMP.tipo === 'evento')}</span>
        <span class="grp">${perfiles().map(p => op('cmpquien', p.id, nombreCorto(p), CMP.persona === p.id)).join('')}</span>
        <span class="grp">Repetir ${reps.map(([k, n]) => op('cmprep', k, n, CMP.rep === k)).join('')}</span>
        <span class="sws">${COLS.map(c => `<button class="sw ${c === CMP.c ? 'on' : ''}" data-cmpc="${c}" style="--c:${c}" title="Color" aria-label="Color ${c}"></button>`).join('')}<label class="sw-mas ${COLS.includes(CMP.c) ? '' : 'on'}" title="Otro color"><input type="color" class="cmp-col" value="${CMP.c}"></label></span>
      </div>
      <input class="cmp-nota" value="${esc(CMP.notas0)}" maxlength="1000" placeholder="Detalle (opcional): dónde, con quién, un enlace…" autocomplete="off" spellcheck="false" enterkeyhint="done">
      ${t && esRutina(t) ? `<div class="cmp-av">Es de una rutina (↻ ${esc(describir(t.rrule, t.fecha))}): el cambio vale para todos los días. Si eliges «No» en Repetir, se queda solo en este día.</div>` : ''}
    </div>`;
  }
  function pintarHorasCh(box) {
    if (!CMP || !box) return;
    const ch = k => box.querySelector(`[data-hch="${k}"]`); if (!ch('ini')) return;
    const conFin = !CMP.sin && !!CMP.fin;
    ch('ini').querySelector('b').textContent = CMP.sin ? '—' : CMP.ini;
    ch('fin').querySelector('b').textContent = conFin ? CMP.fin : '—';
    ch('fin').classList.toggle('mal', conFin && minDe(CMP.fin) === minDe(CMP.ini));   // dura 0: no vale
    ch('fin').classList.toggle('sig', conFin && minDe(CMP.fin) < minDe(CMP.ini));     // acaba pasada la medianoche
    ch('fin').title = conFin && minDe(CMP.fin) < minDe(CMP.ini) ? 'Acaba al día siguiente' : '';
    ch('fin').querySelector('[data-hfinq]').hidden = !conFin;
    box.querySelectorAll('[data-hch]').forEach(b => b.classList.toggle('on', !CMP.sin && b.dataset.hch === CMP.campo));
    box.querySelector('.relojes').classList.toggle('apagado', CMP.sin);
    box.querySelector('[data-hsin]').classList.toggle('on', CMP.sin);
  }
  function aplicarHora(v) {                                  // la hora de las ruedas, al campo activo (Empieza o Acaba)
    if (CMP.campo === 'ini') {                               // mover el inicio arrastra el final (misma duración, aunque pase la medianoche)
      const dur = CMP.fin ? (minDe(CMP.fin) - minDe(CMP.ini) + 1440) % 1440 : 0;
      CMP.ini = v; if (CMP.fin && dur > 0) CMP.fin = hhmm((minDe(v) + dur) % 1440);
    } else CMP.fin = v;
  }
  function montarRelojes(box) {
    const rel = box?.querySelector('.relojes'); if (!rel || !CMP) return;
    const [h, mi] = CMP.ini.split(':').map(Number);
    const cambio = () => { if (!CMP) return; aplicarHora(`${pad2(CMP.rH.valor())}:${pad2(CMP.rM.valor())}`); pintarHorasCh(box); };
    CMP.rH = crearRueda(rel.querySelector('[data-rueda="h"]'), 24, h, cambio);
    CMP.rM = crearRueda(rel.querySelector('[data-rueda="m"]'), 60, mi, cambio);
  }
  const ponerRelojes = () => { if (!CMP?.rH) return; const [h, mi] = CMP[CMP.campo].split(':').map(Number); CMP.rH.poner(h); CMP.rM.poner(mi); };
  function pintarSws(box) {                                  // marca la muestra del color actual (o «otro color»)
    const sws = box?.querySelector('.sws'); if (!sws || !CMP) return;
    let alguno = false;
    sws.querySelectorAll('.sw').forEach(b => { const on = b.dataset.cmpc === CMP.c; b.classList.toggle('on', on); alguno = alguno || on; });
    sws.querySelector('.sw-mas')?.classList.toggle('on', !alguno);
    const inp = sws.querySelector('.cmp-col'); if (inp && !alguno) inp.value = CMP.c;
  }
  function abrirCompositor(f, x, base) {
    if (!hoja || hoja.f !== f) return;
    const sitio = hoja.el.querySelector('.cmp-sitio'); if (!sitio) return;
    borrarPend = null;
    sitio.innerHTML = compositorHTML(f, x, base);            // si había otro abierto, se va: nunca hay dos
    repintarHojaLista();                                     // marca la fila que se está cambiando
    const box = sitio.querySelector('.cmp'); if (!box) return;
    montarRelojes(box);
    if (!QUIETO) box.animate([{ opacity: 0, transform: 'translateY(-6px) scale(.98)' }, { opacity: 1, transform: 'none' }], { duration: DUR(), easing: EASE() });
    const ti = box.querySelector('.cmp-t'); ti.focus({ preventScroll: true }); if (x) ti.select();
    hoja.reajustar();
    box.scrollIntoView({ block: 'nearest', behavior: QUIETO ? 'auto' : 'smooth' });
  }
  function cerrarCompositor() {
    CMP = null;
    if (!hoja) return;
    const sitio = hoja.el.querySelector('.cmp-sitio');
    if (sitio?.querySelector('.cmp')) { sitio.innerHTML = botonMasHTML(hoja.f); hoja.reajustar(); }
    repintarHojaLista();                                     // quita la marca de la fila
  }
  async function guardarCompositor() {
    const box = hoja?.el.querySelector('.cmp-sitio .cmp'); if (!box || !CMP || CMP.enviando) return;
    const ti = box.querySelector('.cmp-t'), titulo = limpio(ti.value);
    if (!titulo) { ti.focus(); if (!QUIETO) ti.animate([{ transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'none' }], { duration: 240 }); return; }
    if (CMP.rH && !CMP.sin) {                                // con la rueda aún girando cuenta donde va a parar, no por donde pasa
      const v = `${pad2(CMP.rH.final())}:${pad2(CMP.rM.final())}`;
      if (v !== CMP[CMP.campo]) { aplicarHora(v); pintarHorasCh(box); }
    }
    const C = CMP, f = C.f;
    const hora = C.sin ? null : `${C.ini}:00`;
    const durMin = !C.sin && C.fin ? ((minDe(C.fin) - minDe(C.ini) + 1440) % 1440) || null : null;   // 23:00 → 01:00 = 2 h (pasa la medianoche)
    const notas = limpio(box.querySelector('.cmp-nota').value) || null;
    const color = C.colorTocado && colorOk(C.c) ? C.c : null;
    const regla = C.rep === 'lv' ? REGLA.lv : C.rep === 'diario' ? REGLA.diario : C.rep === 'sem' ? `FREQ=WEEKLY;BYDAY=${SIGLAS[F.diaSemana(f)]}` : null;
    const base = { tipo: C.tipo, persona: C.persona, rep: C.rep === 'igual' ? 'no' : C.rep, c: C.c, colorTocado: C.colorTocado };
    try {
      if (C.id) {
        const t = store.fila('tareas', C.id);
        if (!t) return cerrarCompositor();
        // solo va lo que se ha cambiado aquí: lo demás (una duración sin hora, unas notas en varias líneas, el color
        // heredado, el fin de una rutina…) se queda como estaba
        const cambios = {};
        if (titulo !== C.titulo0) cambios.titulo = titulo;
        if ((notas || '') !== C.notas0) cambios.notas = notas;
        if (C.persona !== C.persona0) cambios.persona = C.persona || null;
        if (C.tipo !== C.tipo0) cambios.es_evento = C.tipo === 'evento';
        if (C.sin !== C.sin0 || C.ini !== C.ini0 || C.fin !== C.fin0) Object.assign(cambios, { hora, duracion_min: durMin });
        if (color && color !== String(t.color || '').toLowerCase()) cambios.color = color;
        if (C.rep !== C.rep0 && C.rep !== 'igual') {           // la regla solo se toca si se ha cambiado «Repetir»
          if (regla && esRutina(t)) cambios.rrule = regla;       // sigue siendo la misma rutina: su tipo, su inicio y su fin
          else if (regla) Object.assign(cambios, { tipo: 'permanente', rrule: regla, fecha: f, hasta: null, excepciones: [] });
          else if (esRutina(t)) Object.assign(cambios, { tipo: 'puntual', rrule: null, fecha: f, hasta: null, excepciones: [] });
        }
        if (!Object.keys(cambios).length) return cerrarCompositor();
        const POR_DEFECTO = { excepciones: [], es_evento: false };   // columnas que no admiten vacío
        const antes = Object.fromEntries(Object.keys(cambios).map(k => [k, t[k] ?? POR_DEFECTO[k] ?? null]));
        // el compositor sigue abierto hasta que se guarda: si falla (sin red…), lo escrito sigue ahí para reintentar
        C.enviando = true; box.classList.add('enviando');
        try { await store.actualizar('tareas', { id: t.id }, cambios); }
        finally { C.enviando = false; box.classList.remove('enviando'); }
        if (CMP === C) cerrarCompositor();
        // rutina ↔ única cambia la clave de «hecha» (el día ↔ 1970-01-01): la marca de este día pasa a la clave nueva, igual
        const k0 = claveOcurrencia(t, f), k1 = claveOcurrencia({ ...t, ...cambios }, f);
        const h0 = k0 !== k1 ? store.fila('tareas_hechas', { tarea_id: t.id, ocurrencia: k0 }) : null;
        let movida = false;
        if (h0 && !store.fila('tareas_hechas', { tarea_id: t.id, ocurrencia: k1 })) {
          await store.insertar('tareas_hechas', { tarea_id: t.id, ocurrencia: k1, hecha_por: h0.hecha_por, hecha_en: h0.hecha_en }); movida = true;
        }
        avisar(`Cambiado · ${titulo}`, hora ? C.ini : '', colorDe({ ...t, ...cambios }), async () => {
          try {
            await store.actualizar('tareas', { id: t.id }, antes);
            if (movida && store.fila('tareas_hechas', { tarea_id: t.id, ocurrencia: k1 })) await store.quitar('tareas_hechas', { tarea_id: t.id, ocurrencia: k1 });
          } catch (e) { fallo(e); }
        });
      } else {
        const nueva = { id: crypto.randomUUID(), titulo, notas, hora, duracion_min: durMin, persona: C.persona || null, color, es_evento: C.tipo === 'evento',
          tipo: regla ? 'permanente' : 'puntual', rrule: regla, fecha: f, hasta: null, excepciones: [] };
        abrirCompositor(f, null, base);                        // se queda abierto para la siguiente (ya: sin esperar a la red)
        try { await store.insertar('tareas', nueva); }
        catch (e) {                                            // no se ha guardado: lo escrito vuelve al compositor (si sigue sin tocar)
          const b2 = hoja?.f === f && hoja.el.querySelector('.cmp-sitio .cmp');
          if (b2 && CMP && !CMP.id && !b2.querySelector('.cmp-t').value) {
            b2.querySelector('.cmp-t').value = titulo; b2.querySelector('.cmp-nota').value = notas || '';
            Object.assign(CMP, { ini: C.ini, fin: C.fin, sin: C.sin, campo: 'ini' }); ponerRelojes(); pintarHorasCh(b2);
          }
          throw e;
        }
        avisar(titulo, (hora ? C.ini : 'sin hora') + (regla ? ` · ↻ ${describir(nueva.rrule, nueva.fecha)}` : ''), colorDe(nueva),
          () => store.papelera('tareas', nueva.id).catch(fallo));
      }
    } catch (e) { fallo(e); repintarHojaLista(); }
  }

  /* ---- marcar, borrar y quitar noticias ---- */
  async function marcar(fila) {
    const f = fila.dataset.f, t = store.fila('tareas', fila.dataset.it); if (!t) return;
    const clave = { tarea_id: t.id, ocurrencia: claveOcurrencia(t, f) };
    const h0 = store.fila('tareas_hechas', clave);            // quién y cuándo la marcó: «Deshacer» la deja tal cual (como en Hoy)
    try {
      if (h0) await store.quitar('tareas_hechas', clave);
      else await store.insertar('tareas_hechas', { ...clave, hecha_por: yo(), hecha_en: new Date().toISOString() });
      if (!h0 && !QUIETO) { const o = document.createElement('span'); o.className = 'onda'; fila.querySelector('.ck')?.appendChild(o); setTimeout(() => o.remove(), 700); }
      avisar(h0 ? `Desmarcada · ${t.titulo}` : t.titulo, h0 ? '' : 'hecha', h0 ? '#8e8e96' : colorDe(t), async () => {
        try {                                                 // lo contrario de lo que se hizo (no «alternar»: el otro pudo tocarla)
          if (h0) { if (!store.fila('tareas_hechas', clave)) await store.insertar('tareas_hechas', { ...clave, hecha_por: h0.hecha_por, hecha_en: h0.hecha_en }); }
          else if (store.fila('tareas_hechas', clave)) await store.quitar('tareas_hechas', clave);
        } catch (e) { fallo(e); }
      });
    } catch (e) { fallo(e); }
  }
  function pedirBorrar(btn) {
    const fila = btn.closest('.ev'), f = fila.dataset.f, t = store.fila('tareas', fila.dataset.it); if (!t) return;
    if (!esRutina(t)) return borrar(t, f, false);
    borrarPend = { id: t.id, f };                            // la pregunta va debajo de su fila (y sobrevive a los repintados)
    repintarHojaLista();
  }
  async function borrar(t, f, soloEste) {
    borrarPend = null; hoja?.el.querySelector('.borrar-fila')?.remove();
    if (CMP?.id === t.id) cerrarCompositor();                // se estaba cambiando justo esa
    const fila = hoja?.el.querySelector(`.ev[data-it="${CSS.escape(t.id)}"]`);
    const hecho = async () => {
      try {
        if (esRutina(t) && soloEste) {                     // la lista de excepciones de AHORA (el otro pudo quitar otro día)
          const ex0 = store.fila('tareas', t.id)?.excepciones || [], yaEstaba = ex0.includes(f);
          await store.actualizar('tareas', { id: t.id }, { excepciones: [...new Set([...ex0, f])].sort() });
          repintarHojaLista();
          const exAhora = () => store.fila('tareas', t.id)?.excepciones || [];
          return avisar(`Quitada solo el ${fLargo(f)} · ${t.titulo}`, '', '#8e8e96',
            yaEstaba ? null : () => store.actualizar('tareas', { id: t.id }, { excepciones: exAhora().filter(d => d !== f) }).catch(fallo));
        }
        await store.papelera('tareas', t.id);
        repintarHojaLista();
        avisar(`${esRutina(t) ? 'Rutina borrada' : 'Borrado'} · ${t.titulo}`, '', '#8e8e96', () => store.restaurar('tareas', t.id).catch(fallo));
      } catch (e) { fallo(e); repintarHojaLista(); }
    };
    if (fila && !QUIETO) fila.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateX(-28px)' }], { duration: 200, easing: 'ease-in', fill: 'forwards' }).onfinish = hecho; else hecho();
  }
  async function ocultarNoticia(id) {
    const n = store.fila('noticias_clave', id);
    const poner = oculta => store.upsert('noticias_ocultas', { usuario: yo(), noticia_id: id, oculta }, 'usuario,noticia_id');
    try { await poner(true); avisar(`Noticia quitada · ${n?.titulo || ''}`, '', '#8e8e96', () => poner(false).catch(fallo)); }
    catch (e) { fallo(e); }
  }

  /* ---- importancia, color y nota del día (compartidos) ---- */
  async function ponerDia(f, cambios) {
    const D = diaDe(f) || { fecha: f, importancia: 0, color: null, nota: null };
    const nuevo = { ...D, ...cambios };
    try {
      if (!nuevo.importancia && !nuevo.color && !nuevo.nota) { if (diaDe(f)) await store.quitar('dias_calendario', { fecha: f }); }
      else await store.upsert('dias_calendario', { fecha: f, ...cambios, editado_por: yo() }, 'fecha');   // firmado ya en local (el trigger pone lo mismo)
    } catch (e) { fallo(e); }
    if (hoja?.f === f) { pintarColorHoja(hoja.el, f); repintarImps(); }
  }
  // la nota del día (compartida) se guarda al dejar de escribir (450 ms) y al salir del campo, siempre en orden (una
  // cadena). Si el otro la cambia mientras escribes, se queda la tuya y se avisa («Deshacer» = vuelve la suya); si no
  // habías escrito nada, se ve la suya sin más. Los ecos de lo que guardas tú (llegan tarde y en cualquier orden) no son
  // «un cambio del otro».
  let tNota = null, notaPendiente = null, notaTocada = false, notaVista = '', cadenaNota = Promise.resolve();
  const notasMias = new Map();                               // «día|texto» → cuándo lo guardamos (los ecos llegan en segundos)
  const pedidas = new Map();                                 // día → último texto pedido que la cadena aún no ha guardado (red lenta)
  const notaDe = f => (pedidas.has(f) ? pedidas.get(f) : (diaDe(f)?.nota || ''));
  // eco nuestro = un texto que guardamos aquí hace poco Y firmado por nosotros (si el otro escribe lo mismo, no es eco)
  const esEcoMio = (f, v, D) => { const t0 = notasMias.get(`${f}|${v}`); return t0 !== undefined && performance.now() - t0 < 10000 && (!D || D.editado_por === yo()); };
  const limpiaNota = s => (String(s ?? '').trim() ? String(s).replace(/\s+$/, '').slice(0, 2000) : '');
  const guardarNota = (f, v) => {
    if (hoja?.f === f) notaVista = v;                       // notaVista es la del día abierto (no la de otro día)
    notasMias.set(`${f}|${v}`, performance.now()); pedidas.set(f, v);
    cadenaNota = cadenaNota.then(() => ponerDia(f, { nota: v || null })).catch(fallo)   // un fallo no atasca la cadena
      .then(() => { if (pedidas.get(f) === v) pedidas.delete(f); });
    return cadenaNota;
  };
  const guardarNotaYa = () => { clearTimeout(tNota); tNota = null; const p = notaPendiente; notaPendiente = null; p?.(); };
  function notaCambiada(ta) {
    crecer(ta); hoja?.reajustar();
    const f = hoja?.f; if (!f) return;
    notaTocada = true;
    notaPendiente = () => guardarNota(f, limpiaNota(ta.value));
    clearTimeout(tNota); tNota = setTimeout(guardarNotaYa, 450);
  }
  function notaSale(ta, f) {                                 // al salir del campo o al cerrar el día
    guardarNotaYa();
    const mia = limpiaNota(ta.value);
    if (f && notaTocada && mia !== notaVista) guardarNota(f, mia);      // la tuya, después de un cambio del otro
    else if (!notaTocada && mia !== notaVista) { ta.value = notaVista; crecer(ta); }
    notaTocada = false;
  }
  function notaDeFuera(ta, f) {                              // ha cambiado la nota guardada: ¿es del otro?
    const D = diaDe(f), srv = D?.nota || '';
    if (srv === notaVista || esEcoMio(f, srv, D)) return;
    notaVista = srv;
    if (document.activeElement === ta && notaTocada && limpiaNota(ta.value) !== srv) {
      const p = D?.editado_por && D.editado_por !== yo() ? store.perfil(D.editado_por) : null;
      avisar(p ? `${nombreCorto(p)} ha cambiado la nota de este día` : 'La nota de este día ha cambiado en otro sitio', 'se queda la tuya', '#ffd60a', () => {
        if (hoja?.f === f) {                                  // solo si sigue abierto ESE día: lo que se escribe en otro no se toca
          clearTimeout(tNota); tNota = null; notaPendiente = null; notaTocada = false;
          const t2 = hoja.el.querySelector('.hd-nota'); if (t2) { t2.value = srv; crecer(t2); hoja.reajustar(); }
        }
        return guardarNota(f, srv);
      });
    } else if (!notaPendiente) { ta.value = srv; crecer(ta); hoja?.reajustar(); notaTocada = false; }
  }
  function impsHTML(f) {
    const D = diaDe(f) || {}, conColor = colorOk(D.color);
    return `<div class="imps">${IMP.map((i, k) => `<button class="imp ${(D.importancia || 0) === k ? 'on' : ''}" data-imp="${k}" style="--c:${i.c || '#8e8e96'}">${i.n}</button>`).join('')}<label class="sw-mas ${conColor ? 'on' : ''}" title="Otro color para este día"><input type="color" class="dia-col" value="${conColor ? D.color.toLowerCase() : IMP[D.importancia || 0]?.c || '#0a84ff'}"></label>${conColor ? '<button class="pastilla" data-dcq="1">Quitar color</button>' : ''}</div>`;
  }
  function hojaDiaHTML(f) {
    const [y, m] = f.split('-').map(Number);
    return `<div class="hd-cab"><span class="num">${Number(f.slice(8))}</span><div><small>${f === F.hoy() ? 'Hoy · ' : ''}${esc(F.fmtMes(y, m))}</small><b>${DIA_LARGO[F.diaSemana(f)]}</b></div></div>
      <div class="hd-l">Importancia del día</div>${impsHTML(f)}
      <div class="hd-l">Nota del día</div>
      <textarea class="hd-nota" rows="1" maxlength="2000" placeholder="Algo que recordar este día…" spellcheck="false">${esc(notaDe(f))}</textarea>
      <div class="hd-l">Lo que hay ese día · por horas</div>
      <div class="hd-lista"><div class="hd-filas">${filasHTML(f)}</div><div class="cmp-sitio" data-cmpf="${f}">${botonMasHTML(f)}</div></div>
      <div class="hd-pie"><button class="pastilla" data-verhoy="${f}">Abrir en Hoy</button><span class="pista tuto">${tactil() ? 'Arrastra hacia abajo para cerrar' : 'Esc o clic fuera para cerrar'}</span></div>`;
  }
  function pintarColorHoja(el, f) { const c = colorDia(f); el.classList.toggle('marcado', !!c); if (c) el.style.setProperty('--dc', c); else el.style.removeProperty('--dc'); }
  function repintarImps() {                                 // en su sitio: el selector de color no se cambia mientras se usa
    if (!hoja) return; const a = hoja.el.querySelector('.imps'); if (!a) return;
    const D = diaDe(hoja.f) || {}, imp = D.importancia || 0, conColor = colorOk(D.color);
    a.querySelectorAll('[data-imp]').forEach(b => b.classList.toggle('on', +b.dataset.imp === imp));
    const inp = a.querySelector('.dia-col');
    if (inp && document.activeElement !== inp) { inp.parentElement.classList.toggle('on', conColor); inp.value = conColor ? D.color.toLowerCase() : IMP[imp]?.c || '#0a84ff'; }
    const q = a.querySelector('[data-dcq]');
    if (conColor && !q) { a.insertAdjacentHTML('beforeend', '<button class="pastilla" data-dcq="1">Quitar color</button>'); hoja.reajustar(); }
    else if (!conColor && q) { q.remove(); hoja.reajustar(); }      // puede bajar o subir una línea: la hoja se ajusta
  }
  function repintarHojaLista() {                             // solo las filas: el compositor (en .cmp-sitio) no se toca
    if (!hoja) return; const l = hoja.el.querySelector('.hd-filas'); if (!l) return;
    const h = filasHTML(hoja.f); if (l._html !== h) { l.innerHTML = h; l._html = h; hoja.reajustar(); }
  }
  function repintarTodo() {
    if (CMP?.id) { const t = store.fila('tareas', CMP.id); if (!t || t.borrado_en) cerrarCompositor(); }   // la ha borrado el otro
    repintarCeldas(); repintarHojaLista(); repintarImps();
    if (hoja) { pintarColorHoja(hoja.el, hoja.f); const ta = hoja.el.querySelector('.hd-nota'); if (ta) notaDeFuera(ta, hoja.f); }
  }

  /* ---- el día que se hincha (doble clic; en el móvil, un toque) ---- */
  function abrirDia(cell) {
    if (hoja || !cell?.dataset.f) return;
    hojaSaliendo?.();
    const f = cell.dataset.f; CMP = null; borrarPend = null; abiertoEn = performance.now();
    guardarNotaYa(); notaTocada = false; notaVista = notaDe(f);   // con guardados aún en cola, manda lo último escrito
    seleccionarCelda(cell);
    getSelection()?.removeAllRanges();
    // el móvil tumbado (poco alto) también va como hoja que sube desde abajo
    const conTeclado = document.activeElement === cell;     // abierto con Enter: el foco entra en la hoja y vuelve al cerrar
    const rc = cell.getBoundingClientRect(), r0 = { left: rc.left, top: rc.top, width: rc.width, height: rc.height };
    let movil = innerWidth < 640 || innerHeight < 500, W = Math.min(640, innerWidth - (movil ? 0 : 40));
    const r1 = { left: (innerWidth - W) / 2, top: 0, width: W, height: 200 };
    const velo = document.createElement('div'); velo.className = 'velo';
    const el = document.createElement('div'); el.className = 'hd'; el.dataset.f = f; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', fLargo(f));
    el.innerHTML = `<div class="asa"></div><button class="xS" aria-label="Cerrar">×</button><div class="dentro" style="width:${W - 2}px">${hojaDiaHTML(f)}</div>`;
    pintarColorHoja(el, f);
    document.body.append(velo, el);
    el.querySelectorAll('.hd-nota').forEach(crecer);
    el.querySelector('.hd-filas')._html = filasHTML(f);
    const disp = () => innerHeight - (movil ? 24 : 80);
    const natural = () => {                         // alto del contenido (en .scroll, scrollHeight no baja del alto de la caja: no encogía)
      const d = el.querySelector('.dentro'), st = d.scrollTop;
      d.style.height = 'auto'; const h = d.scrollHeight; d.style.height = ''; d.scrollTop = st;
      return 17 + h;
    };
    const colocar = h => { r1.height = h; r1.top = movil ? innerHeight - h : (innerHeight - h) / 2; };
    colocar(Math.min(natural(), disp())); el.classList.toggle('scroll', natural() > disp());
    ocultaF = f; cell.style.visibility = 'hidden';
    const rad0 = parseFloat(getComputedStyle(cell).borderTopLeftRadius) || 22;
    let dy = 0, cerrando = false, acabado = false, celdaVuelta = false, devolver = false;
    const FUNDIDO = 0.18;                               // al cerrar, la hoja se funde con la celda de verdad en el último tramo
    const verCelda = () => {
      if (celdaVuelta) return; celdaVuelta = true;
      if (hoja?.f === f) return;
      if (ocultaF === f) ocultaF = null;
      const c2 = cont.querySelector(`.cd[data-f="${f}"]`); if (c2) c2.style.visibility = '';
    };
    const acabar = () => {
      if (acabado) return; acabado = true;
      detener(mP); detener(mD); detener(mA);
      velo.remove(); el.remove(); verCelda();
      if (hojaSaliendo === acabar) hojaSaliendo = null;
      if (devolver && !hoja) cont.querySelector(`.cd[data-f="${f}"]`)?.focus({ preventScroll: true });   // con teclado: a su celda
    };
    const pintar = p => {
      const k = (a, b) => a + (b - a) * p, s = Math.max(0, Math.min(1, p));
      Object.assign(el.style, { left: `${k(r0.left, r1.left)}px`, top: `${k(r0.top, r1.top) + dy}px`, width: `${k(r0.width, r1.width)}px`, height: `${k(r0.height, r1.height)}px`, borderRadius: `${k(rad0, movil ? 30 : 34)}px`,
        boxShadow: `0 ${Math.round(40 * s)}px ${Math.round(120 * s)}px rgba(0,0,0,${s.toFixed(3)})` });
      velo.style.opacity = s * Math.max(0, 1 - dy / 500);
      if (cerrando) { const o = Math.max(0, Math.min(1, p / FUNDIDO)); el.style.opacity = o; if (o < 1) verCelda(); if (o <= 0) acabar(); }
    };
    const mP = new Muelle(0, pintar, { k: 210, c: 22, eps: 0.001 });
    const mD = new Muelle(0, x => { dy = x; pintar(mP.x); }, { k: 300, c: 28, eps: 0.1 });
    const mA = new Muelle(r1.height, h => { colocar(h); pintar(mP.x); }, { k: 260, c: 26, eps: 0.2 });
    pintar(0); mP.a(1); setTimeout(() => el.classList.add('abierta'), 60);
    const cerrar = sinVolver => {
      if (hoja?.el !== el) return;
      const ta = el.querySelector('.hd-nota');       // lo último escrito en la nota no se pierde
      if (ta) notaSale(ta, f); else guardarNotaYa();
      devolver = el.contains(document.activeElement);
      hoja = null; CMP = null; borrarPend = null; el.classList.remove('abierta'); el.classList.add('cerrando');
      velo.style.pointerEvents = el.style.pointerEvents = 'none';
      hojaSaliendo = acabar;
      repintarCeldas();                              // la celda ya trae lo nuevo (sigue oculta hasta que la hoja llegue)
      if (sinVolver || QUIETO) {
        verCelda();
        el.animate([{ opacity: 1 }, { opacity: 0, transform: 'scale(.96)' }], { duration: 200, easing: 'ease-in', fill: 'forwards' });
        velo.animate([{ opacity: +velo.style.opacity || 1 }, { opacity: 0 }], { duration: 220, fill: 'forwards' }).onfinish = acabar;
        return;
      }
      const c = cont.querySelector(`.cd[data-f="${f}"]`);
      if (c) { const r = c.getBoundingClientRect(); Object.assign(r0, { left: r.left, top: r.top, width: r.width, height: r.height }); }
      else Object.assign(r0, { left: r1.left + r1.width / 2 - 30, top: r1.top + r1.height / 2 - 30, width: 60, height: 60 });
      cerrando = true;
      mD.a(0); mP.a(0, { k: 260, c: 26, eps: 0.004, fin: acabar });
    };
    // reajustar(true): sin muelle, ya (sale o se va el teclado: el campo en el que se escribe no puede quedar debajo)
    const reajustar = inmediato => {
      if (hoja?.el !== el) return;
      const n = natural(), obj = Math.min(n, disp()); el.classList.toggle('scroll', n > disp());
      if (inmediato) { detener(mA); mA.x = mA.obj = obj; mA.v = 0; colocar(obj); pintar(mP.x); }
      else { mA.x = r1.height; mA.a(obj); }
    };
    // girar el móvil (o cambiar el ancho de la ventana): la hoja se vuelve a medir y colocar, no se cierra (el borrador del
    // compositor se perdía)
    const medir = () => {
      if (hoja?.el !== el) return;
      movil = innerWidth < 640 || innerHeight < 500; W = Math.min(640, innerWidth - (movil ? 0 : 40));
      Object.assign(r1, { left: (innerWidth - W) / 2, width: W });
      el.querySelector('.dentro').style.width = `${W - 2}px`;
      reajustar(true);
    };
    hoja = { f, el, cerrar, reajustar, medir };
    if (conTeclado) { el.tabIndex = -1; el.focus({ preventScroll: true }); }
    velo.addEventListener('click', () => { if (performance.now() - abiertoEn > 350) cerrar(); });   // el 2.º clic de un doble clic no cierra
    el.addEventListener('click', clicHoja);
    el.addEventListener('input', entradaHoja);
    el.addEventListener('change', ev => { if (ev.target.matches('.dia-col')) repintarImps(); });
    el.addEventListener('keydown', teclaHoja);
    el.addEventListener('focusout', ev => { if (hoja?.el === el && ev.target.matches?.('.hd-nota')) notaSale(ev.target, f); });
    // arrastrar hacia abajo (desde el asa o la cabecera): goma hacia arriba y cierre por distancia o velocidad
    let y0 = null, tPrev = 0, yPrev = 0, vel = 0;
    el.addEventListener('pointerdown', ev => {
      if (ev.target.closest('button, input, textarea, label, .ev, .cmp, .borrar-fila')) return;
      // con el día largo (se desplaza), solo la cabecera y el asa arrastran la hoja: lo demás desplaza la lista (si el arrastre
      // empezaba también ahí, el navegador se quedaba el gesto y la lista no se movía)
      if (el.classList.contains('scroll') && !ev.target.closest('.hd-cab, .asa')) return;
      y0 = ev.clientY - dy; yPrev = ev.clientY; tPrev = performance.now(); vel = 0; el.setPointerCapture(ev.pointerId); detener(mD);
    });
    el.addEventListener('pointermove', ev => {
      if (y0 === null) return;
      const raw = ev.clientY - y0, t = performance.now(); vel = (ev.clientY - yPrev) / Math.max(1, t - tPrev); yPrev = ev.clientY; tPrev = t;
      dy = raw > 0 ? raw : -Math.sqrt(-raw) * 4; mD.x = dy; pintar(mP.x);
    });
    const soltar = () => { if (y0 === null) return; y0 = null; if (dy > 130 || vel > 0.7) cerrar(); else mD.a(0, { v: vel * 1000 }); };
    el.addEventListener('pointerup', soltar);
    // cancelado = el navegador se ha quedado el gesto (desplazar la lista del día): vuelve a su sitio, NO se cierra
    // (un deslizamiento rápido para subir la lista cerraba el día por la velocidad)
    el.addEventListener('pointercancel', () => { if (y0 === null) return; y0 = null; mD.a(0); });
  }
  function clicHoja(ev) {
    if (!hoja || performance.now() - abiertoEn < 350) return;   // el 2.º clic del doble clic que la ha abierto
    const g = s => ev.target.closest(s); let n;
    const f = hoja.f;
    if (g('.xS')) return hoja.cerrar();
    if ((n = g('[data-imp]'))) return ponerDia(f, { importancia: +n.dataset.imp });
    if (g('[data-dcq]')) return ponerDia(f, { color: null });
    if ((n = g('[data-verhoy]'))) { hoja.cerrar(true); return navegar(`dia/${n.dataset.verhoy}`); }
    if ((n = g('[data-abrircmp]'))) return abrirCompositor(n.dataset.abrircmp);
    if (g('[data-cmpok]')) return guardarCompositor();
    if (g('[data-cmpno]')) return cerrarCompositor();
    const marcarOp = b => b.parentElement.querySelectorAll('.op2').forEach(x => x.classList.toggle('on', x === b));
    if (g('[data-hfinq]')) { if (CMP) { CMP.fin = ''; if (CMP.campo === 'fin') { CMP.campo = 'ini'; ponerRelojes(); } pintarHorasCh(g('.cmp')); } return; }
    if ((n = g('[data-hch]'))) { if (CMP) { CMP.sin = false; CMP.campo = n.dataset.hch; if (CMP.campo === 'fin' && !CMP.fin) CMP.fin = hhmm((minDe(CMP.ini) + 60) % 1440); ponerRelojes(); pintarHorasCh(n.closest('.cmp')); } return; }
    if ((n = g('[data-hsin]'))) { if (CMP) { CMP.sin = !CMP.sin; pintarHorasCh(n.closest('.cmp')); } return; }
    if ((n = g('[data-cmptipo]'))) { if (CMP) CMP.tipo = n.dataset.cmptipo; return marcarOp(n); }
    if ((n = g('[data-cmpquien]'))) {
      if (CMP) {
        CMP.persona = n.dataset.cmpquien;
        if (!CMP.colorTocado && !CMP.propio) {               // el color heredado sigue a la persona (el elegido a mano, no)
          CMP.c = colorDe({ ...(CMP.id ? store.fila('tareas', CMP.id) || {} : {}), color: null, persona: CMP.persona }).toLowerCase();
          pintarSws(n.closest('.cmp'));
        }
      }
      return marcarOp(n);
    }
    if ((n = g('[data-cmprep]'))) { if (CMP) CMP.rep = n.dataset.cmprep; return marcarOp(n); }
    if ((n = g('[data-cmpc]'))) { if (CMP) { CMP.c = n.dataset.cmpc; CMP.colorTocado = true; } n.parentElement.querySelectorAll('.sw, .sw-mas').forEach(x => x.classList.toggle('on', x === n)); return; }
    if (g('.cmp')) return;
    if ((n = g('[data-editit]'))) { const x = buscarItem(n.dataset.editit, f); if (x) abrirCompositor(f, x); return; }
    if ((n = g('[data-borrarit]'))) return pedirBorrar(n);
    if ((n = g('[data-borrar1]'))) { const t = store.fila('tareas', n.dataset.borrar1); if (t) borrar(t, n.dataset.f, true); return; }
    if ((n = g('[data-borrartodo]'))) { const t = store.fila('tareas', n.dataset.borrartodo); if (t) borrar(t, n.dataset.f, false); return; }
    if (g('[data-borrarno]')) { borrarPend = null; repintarHojaLista(); return; }
    if (g('.borrar-fila')) return;
    if ((n = g('[data-ocultar]'))) return ocultarNoticia(n.dataset.ocultar);
    if ((n = g('.ev[data-k="t"]'))) return marcar(n);
  }
  function entradaHoja(ev) {
    const t = ev.target;
    if (t.matches('.hd-nota')) return notaCambiada(t);
    if (t.matches('.dia-col') && hoja) { const f = hoja.f; t.parentElement.classList.add('on'); hoja.el.style.setProperty('--dc', t.value); clearTimeout(t._t); t._t = setTimeout(() => ponerDia(f, { color: t.value }), 250); return; }
    if (t.matches('.cmp-col') && CMP) { CMP.c = t.value.toLowerCase(); CMP.colorTocado = true; t.closest('.sws').querySelectorAll('.sw').forEach(b => b.classList.remove('on')); t.parentElement.classList.add('on'); }
  }
  function teclaHoja(ev) {
    const t = ev.target;
    if (t.closest?.('.cmp')) {
      if (ev.key === 'Enter' && (t.tagName === 'INPUT' || t.matches('.rueda'))) { ev.preventDefault(); guardarCompositor(); }
      else if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); cerrarCompositor(); }
      return;
    }
    if (t.matches?.('.hd-nota') && ev.key === 'Escape') { ev.stopPropagation(); t.blur(); }
  }

  /* ---- eventos de la página ---- */
  cont.addEventListener('click', ev => {
    const g = s => ev.target.closest(s); let n;
    if ((n = g('[data-mes]'))) return cambiarMes(n.dataset.mes);
    if (g('[data-notcl]')) return alternarNoticias();
    if ((n = g('.cd'))) {
      // ratón: un clic selecciona y el doble clic abre (si un clic abriera el día ya seleccionado, el 2.º clic del doble
      // caería en la hoja recién abierta: marcaba una tarea o la cerraba). Dedo o teclado: abre a la primera.
      const dedo = ev.pointerType ? ev.pointerType !== 'mouse' : tactil();
      if (dedo || ev.detail === 0) abrirDia(n); else seleccionarCelda(n);
    }
  });
  cont.addEventListener('dblclick', ev => { const c = ev.target.closest('.cd'); if (c) { ev.preventDefault(); abrirDia(c); } });
  cont.addEventListener('keydown', ev => { if (ev.key === 'Enter' && ev.target.matches?.('.cd')) { ev.preventDefault(); abrirDia(ev.target); } });
  const teclaGlobal = ev => {
    if (!hoja) return;
    if (ev.key === 'Escape' && !ev.target.closest?.('.cmp, .hd-nota')) { ev.preventDefault(); hoja.cerrar(); return; }
    if (/^[1-9]$/.test(ev.key) && !ev.target.closest?.('input, textarea')) ev.stopPropagation();   // con el día abierto, los números no cambian de pestaña
  };
  document.addEventListener('keydown', teclaGlobal, true);
  let ancho = innerWidth;   // cambio de ANCHO (girar, redimensionar): se vuelve a medir; solo de alto (teclado): se recoloca
  const alCambiarTam = () => {
    const giro = innerWidth !== ancho; ancho = innerWidth; if (!hoja) return;
    if (giro) hoja.medir(); else hoja.reajustar(true);      // la hoja se recoloca ya, sin muelle…
    const a = document.activeElement;                        // …y lo que se está escribiendo queda a la vista
    if (a && a !== document.body && hoja.el.contains(a)) a.scrollIntoView({ block: 'nearest' });
  };
  addEventListener('resize', alCambiarTam);
  const quitarOyente = store.on(['tareas', 'tareas_hechas', 'dias_calendario', 'noticias_clave', 'noticias_ocultas', 'perfiles', 'grupos', 'etiquetas'], repintarTodo);
  // el latido del agente (cada minuto) solo cambia la línea de estado: repintar el mes entero no hace falta
  const quitarLatido = store.on(['agente_estado'], () => { const p = cont.querySelector('#calPista'); if (p) p.innerHTML = pistaHTML(); });
  const reloj = setInterval(() => { repintarHojaLista(); repintarCeldas(); }, 30000);   // la línea de «ahora» y el cambio de día

  pintarPagina();
  return () => {
    hoja?.cerrar(true); hojaSaliendo?.();
    document.removeEventListener('keydown', teclaGlobal, true);
    removeEventListener('resize', alCambiarTam);
    quitarOyente(); quitarLatido(); clearInterval(reloj); guardarNotaYa();
  };
}
