// SEMANA (v2 Fluido) — mismos datos que la Semana de siempre (grupos, tareas, tareas_hechas,
// notas_semana, arrastre de pendientes), con la cara de la demo Fluido: cifra grande con líquido,
// una tarjeta por persona, grupos que se pliegan con muelle, marcar con onda y aviso en la isla.
// «Para Claude» (8-nov, SQL 006): </> en cada tarea y en «Nueva tarea…» (también desde el móvil); la tarea guarda su
// proyecto en tareas.claude y en el PC sale en la pestaña Prompts con su prompt ya hecho («↗ prompt» lleva a él).

import { el, modal, campo, selector, confirmar, avatar, debounce, error, reemplazar } from '../../../js/ui.js';
import { editarTarea } from '../../../js/vistas/tarea-editor.js';
import { Muelle, rodar, plegar, entrada } from '../motor.js';

const COLORES = ['#f59e0b', '#6366f1', '#10b981', '#ec4899', '#f97316', '#3b82f6', '#ef4444'];
const PRI_COLORES = { URGENTE: '#ef4444', ALTA: '#f59e0b', MEDIA: '#3b82f6' };
const ABIERTOS = 'agenda-jh-grupos-abiertos';
const CK = '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const LAPIZ = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg>';
const PAPELERA = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>';
const CHEV = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>';
const IZQ = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>';
const DER = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>';
const svgEn = (tag, attrs, s) => { const n = el(tag, attrs); n.innerHTML = s; return n; };

export function montar(cont, ctx) {
  const { store, F, navegar, params, avisar } = ctx;
  const semana = /^\d{4}-W\d{2}$/.test(params[0] || '') ? params[0] : F.semanaActual();
  const anterior = F.moverSemana(semana, -1);
  const esActual = semana === F.semanaActual();

  let abiertos = {};
  try { abiertos = JSON.parse(localStorage.getItem(ABIERTOS) || '{}'); } catch { /* sin almacenamiento */ }
  const guardarAbiertos = () => { try { localStorage.setItem(ABIERTOS, JSON.stringify(abiertos)); } catch { /* nada */ } };

  // ---- datos ----
  const gruposSemana = () => store.vivas('grupos', g => g.semana === semana).sort((a, b) => a.orden - b.orden || (a.creado_en || '').localeCompare(b.creado_en || ''));
  const tareasDe = g => store.vivas('tareas', t => t.grupo_id === g.id).sort((a, b) => a.orden - b.orden || (a.creado_en || '~').localeCompare(b.creado_en || '~'));
  const hecha = t => store.hecha(t.id);
  const personaDe = (t, g) => t.persona || g.persona;
  const pctDe = (h, n) => (n ? Math.round((h / n) * 100) : 0);
  const pctGrupo = g => { const ts = tareasDe(g); return pctDe(ts.filter(hecha).length, ts.length); };
  const totales = () => {
    const filas = gruposSemana().flatMap(g => tareasDe(g).map(t => ({ t, g })));
    const h = filas.filter(({ t }) => hecha(t)).length;
    return { filas, n: filas.length, hechas: h, pct: pctDe(h, filas.length) };
  };
  const bandejaPend = () => store.vivas('tareas', t => !t.fecha && !t.grupo_id && !t.rrule && !store.hecha(t.id)).length;

  // ---- «para Claude» (SQL 006): sin la tabla de fichas en la base no sale nada de esto ----
  const conClaude = () => !store.disponible || store.disponible('claude_fichas');
  const fichas = () => store.filas('claude_fichas').sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
  const fichaDe = comp => store.fila('claude_fichas', comp) || null;
  let compNueva = (() => { try { return localStorage.getItem('agenda-jh-comp-nueva') || ''; } catch { return ''; } })();
  const compPorDefecto = () => (fichaDe(compNueva) ? compNueva : fichas()[0]?.proyecto || 'agenda');
  // el proyecto se adivina por el texto (como en la demo); si no, el último que elegiste
  const adivina = txt => (/terminal|lote|orden|gr[aá]fic/i.test(txt) ? 'terminal' : /agenda|tarea|setup|nota/i.test(txt) ? 'agenda'
    : /calendario|macro|dato|noticia/i.test(txt) ? 'calendario' : /app|insomniac|mongo|radar/i.test(txt) ? 'app' : null);
  const compPara = txt => { const c = adivina(txt); return c && fichaDe(c) ? c : compPorDefecto(); };
  const nuevoClaude = comp => ({ comp, nota: '', manual: null, enviado: null, n: Date.now() });
  const codNueva = new Map();   // grupo → proyecto de las «ideas para Claude» que se van añadiendo (o nada)
  const esMovil = () => matchMedia('(max-width: 820px)').matches;
  const colorComp = comp => fichaDe(comp)?.color || '#0a84ff';

  // ---- esqueleto ----
  const hero = el('div', { class: 'hero' });
  const chips = el('div', { class: 'chips-m' });
  const col1 = el('div', { class: 'col' });
  const col2 = el('div', { class: 'col' });
  const vacioGrupos = el('div', { class: 'card libre', hidden: true });
  const notas = el('div', { class: 'notas-sem' });
  cont.append(hero, chips, vacioGrupos, el('div', { class: 'cols2' }, col1, col2),
    el('button', { class: 'nuevo-grupo', onclick: () => editarGrupo(null) }, '+ Nuevo grupo'),
    el('div', { class: 'etq sec-f' }, 'Notas de la semana'),
    el('div', { class: 'card notas-card' }, notas, el('div', { class: 'nota-pie-g' }, 'Se guardan solas y las ve el otro al momento')));

  // ---- cabecera: cifra + personas ----
  let N = {};
  function construirHero() {
    const T = totales();
    const liq = el('i', { style: { width: `${T.pct}%` } });
    N = { pct: el('span', {}, String(T.pct)), hechas: el('b', {}, String(T.hechas)), total: el('span', {}, String(T.n)), liq, personas: new Map(), bandeja: null, arrastre: el('div', { class: 'arrastre' }) };
    const nav = el('div', { class: 'sem-nav' },
      svgEn('button', { class: 'redondo', title: 'Semana anterior', onclick: () => navegar(`semana/${anterior}`) }, IZQ),
      !esActual && el('button', { class: 'pildora', onclick: () => navegar('semana') }, 'Esta semana'),
      svgEn('button', { class: 'redondo', title: 'Semana siguiente', onclick: () => navegar(`semana/${F.moverSemana(semana, 1)}`) }, DER));
    const grande = el('div', { class: 'card big' },
      el('div', { class: 'etq-fila' }, el('div', { class: 'etq' }, `Semana ${F.numeroSemana(semana)} · ${F.rangoSemanaTexto(semana)}`), nav),
      el('div', { class: 'cifra' }, N.pct, el('small', {}, '%')),
      el('div', { class: 'liquido' }, liq),
      el('p', { class: 'sub-hero' }, N.hechas, ' de ', N.total, ' tareas', esActual ? ' · márcalas al completarlas' : ''),
      N.arrastre);
    const orden = [...new Set(gruposSemana().map(g => g.persona).filter(Boolean))];
    const perfiles = store.perfiles().sort((a, b) => (orden.indexOf(a.id) + 1 || 99) - (orden.indexOf(b.id) + 1 || 99)).slice(0, 2);
    const duo = el('div', { class: 'duo' }, perfiles.map(p => {
      const b = el('b', {}, '0');
      const sm = el('small');
      N.personas.set(p.id, { b, sm });
      const av = avatar(p, 40);
      av.classList.add('av-g');
      if (p.id === store.usuarioId()) av.classList.add('en-linea');
      return el('div', { class: 'card per', style: { '--c': p.color } }, av, el('div', {}, b, sm));
    }),
    el('a', { class: 'card per', href: '#/dia', title: 'Ver la bandeja en Hoy' },
      el('span', { class: 'av-g av-bandeja' }, '✦'), el('div', {}, N.bandeja = el('b', {}, '0'), el('small', {}, 'en la bandeja'))));
    reemplazar(hero, grande, duo);
    pintarNumeros(true);
  }
  function pintarNumeros(salto) {
    const T = totales();
    if (salto) { N.pct.textContent = T.pct; N.hechas.textContent = T.hechas; N.total.textContent = T.n; }
    else { rodar(N.pct, T.pct); rodar(N.hechas, T.hechas); N.total.textContent = T.n; }
    const m = N.liq._m || (N.liq._m = new Muelle(T.pct, x => { N.liq.style.width = `${Math.max(0, x)}%`; }, { k: 140, c: 14, eps: 0.05 }));
    m.a(T.pct);
    for (const [id, { b, sm }] of N.personas) {
      const suyas = T.filas.filter(({ t, g }) => personaDe(t, g) === id);
      const h = suyas.filter(({ t }) => hecha(t)).length;
      if (salto) b.textContent = h; else rodar(b, h);
      const p = store.perfil(id);
      sm.textContent = `de ${suyas.length} · ${p?.nombre || ''}${id === store.usuarioId() ? ' · tú' : ''}`;
    }
    if (salto) N.bandeja.textContent = bandejaPend(); else rodar(N.bandeja, bandejaPend());
    pintarArrastre();
  }

  // ---- mercado de la semana (solo lectura: se edita en Mercado) ----
  function pintarChips() {
    const desde = F.madridAInstante(F.lunesDe(semana), '00:00').getTime();
    const hasta = desde + 7 * 864e5;
    const ev = store.vivas('anotaciones', a => { const x = new Date(a.fecha_hora).getTime(); return x >= desde && x < hasta; })
      .sort((a, b) => a.fecha_hora.localeCompare(b.fecha_hora));
    reemplazar(chips, ev.map(a => el('a', { class: 'chipm', href: '#/mercado', title: 'Ver en Mercado' },
      el('i', { style: { opacity: String(0.34 + a.importancia * 0.22) } }),
      el('div', {}, el('b', {}, a.titulo), el('small', {}, `${F.NOMBRES_DIA[F.diaSemana(F.diaDe(a.fecha_hora)) - 1]} ${F.fmtHora(a.fecha_hora)}`)))));
    chips.hidden = !ev.length;
  }

  // ---- grupos ----
  const L = 2 * Math.PI * 17;
  const nodos = new Map();   // id grupo → { sec, firma, filas: Map(id tarea → fila), entrada }
  const borradores = new Map();

  function anillo(p, color) {
    // el <svg> entero va dentro de un span: creado con createElement('svg') no se pintaría (espacio de nombres HTML)
    return svgEn('span', { class: 'anillo-c' }, `<svg class="anillo" viewBox="0 0 42 42"><circle cx="21" cy="21" r="17" stroke="#ffffff12"/><circle class="v" cx="21" cy="21" r="17" stroke="${/^#[0-9a-f]{3,8}$/i.test(color) ? color : '#30d158'}" stroke-dasharray="${L}" stroke-dashoffset="${L * (1 - p / 100)}"/></svg>`);
  }
  const firmaGrupo = g => JSON.stringify([g.nombre, g.color, g.persona, g.prioridad, tareasDe(g).map(t => [t.id, t.titulo, t.persona, t.fecha, t.hora, t.origen_tarea_id, t.claude ? [t.claude.comp, t.claude.enviado?.como || ''] : 0])]);

  function filaTarea(g, t) {
    const fila = el('div', { class: 't', dataset: { t: t.id }, tabindex: 0, role: 'checkbox' });
    const ck = svgEn('span', { class: 'ck' }, CK);
    const resp = t.persona && t.persona !== g.persona ? store.perfil(t.persona) : null;
    const tx = el('div', { class: 'tx' },
      el('span', {}, t.titulo),
      t.origen_tarea_id && el('em', { class: 'arr', title: 'Venía de la semana anterior' }, ' ↩'),
      t.fecha && el('em', { class: 'fch' }, ` · ${F.fmtDiaStr(t.fecha)}${t.hora ? ' ' + F.horaCorta(t.hora) : ''}`));
    const quien = el('span', { class: 'quien' });
    const pp = t.claude && conClaude() ? el('span', { class: `pp ${t.claude.enviado ? 'env' : ''}`, dataset: { acc: 'prompt' },
      title: esMovil() ? 'Tiene su prompt: lo verás en el PC, en Prompts' : 'Ver su prompt (Prompts)' }, t.claude.enviado ? `✓ ${t.claude.enviado.como || 'mandado'}` : '↗ prompt') : '';
    const acc = el('span', { class: 't-acc' },
      conClaude() && el('button', { class: `cod ${t.claude ? 'on' : ''}`, dataset: { acc: 'codigo' },
        title: t.claude ? 'Quitar de Prompts' : 'Para Claude: tendrá su prompt en el PC (Prompts)' }, '</>'),
      svgEn('button', { title: 'Editar la tarea (fecha, hora, persona, etiquetas…)', dataset: { acc: 'editar' } }, LAPIZ),
      svgEn('button', { class: 'del', title: 'A la papelera', dataset: { acc: 'borrar' } }, PAPELERA));
    fila.append(ck, tx, pp, resp ? avatar(resp, 20) : '', quien, acc);
    fila.addEventListener('click', ev => {
      const a = ev.target.closest('[data-acc]');
      if (a?.dataset.acc === 'editar') { ev.stopPropagation(); return editarTarea(t).catch(error); }
      if (a?.dataset.acc === 'borrar') { ev.stopPropagation(); return aPapelera('tareas', t, `Borrada · ${t.titulo}`); }
      if (a?.dataset.acc === 'codigo') { ev.stopPropagation(); return alternarClaude(t); }
      if (a?.dataset.acc === 'prompt') { ev.stopPropagation(); return verPrompt(t); }
      marcar(g, t, fila);
    });
    fila.addEventListener('dblclick', ev => { ev.preventDefault(); editarTarea(t).catch(error); });
    fila.addEventListener('keydown', ev => { if ((ev.key === 'Enter' || ev.key === ' ') && ev.target === fila) { ev.preventDefault(); marcar(g, t, fila); } });
    pintarHecha(fila, t);
    return fila;
  }
  function pintarHecha(fila, t) {
    const h = hecha(t);
    const quien = h ? store.perfil(h.hecha_por) : null;
    fila.classList.toggle('h', !!h);
    fila.setAttribute('aria-checked', h ? 'true' : 'false');
    fila.style.setProperty('--c', quien?.color || store.usuario()?.color || '#30d158');
    const q = fila.querySelector('.quien');
    reemplazar(q, quien ? [avatar(quien, 20), F.fmtHora(h.hecha_en)] : null);
    if (quien) q.title = `Hecha por ${quien.nombre} · ${F.fmtDiaHora(h.hecha_en)}`;
  }

  async function marcar(g, t, fila) {
    const antes = pctGrupo(g);
    const h = hecha(t);
    const n = tareasDe(g).length || 1;
    const dif = Math.round(100 / n) * (h ? -1 : 1);
    try {
      if (h) await store.quitar('tareas_hechas', { tarea_id: t.id, ocurrencia: '1970-01-01' });
      else {
        const o = el('span', { class: 'onda' });
        fila.querySelector('.ck').append(o);
        setTimeout(() => o.remove(), 700);
        await store.insertar('tareas_hechas', { tarea_id: t.id, ocurrencia: '1970-01-01', hecha_por: store.usuarioId(), hecha_en: new Date().toISOString() });
      }
      const ahora = pctGrupo(g);
      avisar(h ? `Desmarcada · ${t.titulo}` : t.titulo, `${ahora - antes >= 0 ? '+' : ''}${ahora - antes || dif} %`,
        h ? '#8e8e96' : (store.usuario()?.color || 'var(--ok)'), () => marcarDeshacer(t, h));
    } catch (e) { error(e); }
  }
  async function marcarDeshacer(t, estabaHecha) {
    try {
      if (estabaHecha) await store.insertar('tareas_hechas', { tarea_id: t.id, ocurrencia: '1970-01-01', hecha_por: estabaHecha.hecha_por, hecha_en: estabaHecha.hecha_en });
      else await store.quitar('tareas_hechas', { tarea_id: t.id, ocurrencia: '1970-01-01' });
    } catch (e) { error(e); }
  }
  async function aPapelera(tabla, fila, texto) {
    try {
      await store.papelera(tabla, fila.id);
      avisar(texto, '', '#ff453a', () => store.restaurar(tabla, fila.id).catch(error));
    } catch (e) { error(e); }
  }
  async function alternarClaude(t) {
    const antes = t.claude || null, nuevo = antes ? null : nuevoClaude(compPara(t.titulo));
    try {
      await store.actualizar('tareas', { id: t.id }, { claude: nuevo });
      if (nuevo) avisar(t.titulo, '</> prompt listo', colorComp(nuevo.comp));
      else avisar(`Quitada de Prompts · ${t.titulo}`, '', '#8e8e96', () => store.actualizar('tareas', { id: t.id }, { claude: antes }).catch(error));
    } catch (e) { error(e); }
  }
  function verPrompt(t) {
    if (esMovil()) return avisar('Su prompt te espera en el PC, en Prompts', '</>', 'var(--azul)');
    try { sessionStorage.setItem('agenda-jh-prompt-foco', t.id); } catch { /* sin almacenamiento */ }
    navegar('prompts');
  }
  async function anadir(g, input) {
    const titulo = input.value.trim();
    if (!titulo) return;
    const comp = conClaude() ? codNueva.get(g.id) : null;
    input.value = '';
    borradores.delete(g.id);
    try {
      await store.insertar('tareas', { titulo, grupo_id: g.id, tipo: 'puntual', orden: tareasDe(g).length, creado_por: store.usuarioId(),
        ...(comp ? { claude: nuevoClaude(comp) } : {}) });
      if (comp) avisar(titulo, '</> prompt listo', colorComp(comp));
    } catch (e) { input.value = titulo; error(e); }
  }

  function construirGrupo(g) {
    const ts = tareasDe(g);
    const p = pctGrupo(g);
    const ab = abiertos[g.id] !== false;   // abiertos por defecto
    const persona = store.perfil(g.persona);
    const n = el('span', { class: 'n' }, `${ts.filter(hecha).length}/${ts.length}`);
    const gh = el('div', { class: 'gh', role: 'button', tabindex: 0, 'aria-expanded': String(ab) },
      anillo(p, g.color),
      el('b', {}, g.nombre),
      g.prioridad === 'URGENTE' && el('span', { class: 'urg', title: 'Urgente' }, 'URGENTE'),
      persona && avatar(persona, 22),
      el('span', { class: 'g-acc' },
        svgEn('span', { role: 'button', title: 'Editar el grupo', dataset: { gacc: 'editar' } }, LAPIZ),
        svgEn('span', { role: 'button', class: 'del', title: 'Grupo a la papelera', dataset: { gacc: 'borrar' } }, PAPELERA)),
      n,
      svgEn('span', { class: 'chev' }, CHEV));
    const filas = new Map(ts.map(t => [t.id, filaTarea(g, t)]));
    const inp = el('input', { class: 't-in', placeholder: codNueva.get(g.id) ? 'Idea para Claude…' : 'Nueva tarea…', value: borradores.get(g.id) || '', enterkeyhint: 'done',
      oninput: e => borradores.set(g.id, e.target.value),
      onkeydown: e => { if (e.key === 'Enter') { e.preventDefault(); anadir(g, e.target); } if (e.key === 'Escape') e.target.blur(); } });
    // «Idea para Claude» (</>): lo que se añada sale en Prompts con el proyecto elegido en los chips
    const chipsC = conClaude() ? el('div', { class: 't-comps', hidden: !codNueva.get(g.id) },
      fichas().map(f => el('button', { class: `comp ${f.proyecto === codNueva.get(g.id) ? 'on' : ''}`, type: 'button', dataset: { comp: f.proyecto },
        style: { '--c': f.color }, onclick: ev => { ev.preventDefault(); ponerCompNueva(g, f.proyecto); } }, f.nombre))) : '';
    const cod = conClaude() ? el('button', { class: `t-cod ${codNueva.get(g.id) ? 'on' : ''}`, type: 'button',
      title: 'Idea para Claude: la tarea tendrá su prompt listo en el PC', onclick: ev => { ev.preventDefault(); alternarCodNueva(g); } }, '</>') : '';
    function pintarCodNueva() {
      const comp = codNueva.get(g.id);
      if (cod) cod.classList.toggle('on', !!comp);
      if (chipsC) { chipsC.hidden = !comp; chipsC.querySelectorAll('.comp').forEach(b => b.classList.toggle('on', b.dataset.comp === comp)); }
      inp.placeholder = comp ? 'Idea para Claude…' : 'Nueva tarea…';
    }
    function alternarCodNueva() { if (codNueva.get(g.id)) codNueva.delete(g.id); else codNueva.set(g.id, compPorDefecto()); pintarCodNueva(); inp.focus(); }
    function ponerCompNueva(_, comp) {
      codNueva.set(g.id, comp); compNueva = comp;
      try { localStorage.setItem('agenda-jh-comp-nueva', comp); } catch { /* sin almacenamiento */ }
      pintarCodNueva(); inp.focus();
    }
    const lista = el('div', { class: 'lista' }, [...filas.values()],
      el('label', { class: 't-nueva' }, el('span', { class: 'mas' }, '+'), inp, cod), chipsC);
    const cuerpo = el('div', { class: 'cuerpo', style: { height: ab ? 'auto' : '0px' } }, lista);
    const sec = el('section', { class: `card grupo ${ab ? 'ab' : ''} ${p === 100 && ts.length ? 'completo' : ''}`, dataset: { gid: g.id }, style: { '--gc': g.color } }, gh, cuerpo);
    const alternar = () => {
      const abrir = !sec.classList.contains('ab');
      abiertos[g.id] = abrir; guardarAbiertos();
      sec.classList.toggle('ab', abrir);
      gh.setAttribute('aria-expanded', String(abrir));
      plegar(cuerpo, abrir);
      if (abrir) entrada(lista.querySelectorAll('.t'), { dy: -8, paso: 35 });
    };
    gh.addEventListener('click', ev => {
      const a = ev.target.closest('[data-gacc]');
      if (a?.dataset.gacc === 'editar') return editarGrupo(g);
      if (a?.dataset.gacc === 'borrar') return borrarGrupo(g);
      alternar();
    });
    gh.addEventListener('keydown', ev => { if ((ev.key === 'Enter' || ev.key === ' ') && ev.target === gh) { ev.preventDefault(); alternar(); } });
    return { sec, firma: firmaGrupo(g), filas, entrada: inp, n };
  }
  function actualizarGrupo(g, nodo) {
    const ts = tareasDe(g);
    const p = pctGrupo(g);
    for (const t of ts) { const f = nodo.filas.get(t.id); if (f) pintarHecha(f, t); }
    nodo.sec.querySelector('.anillo .v').style.strokeDashoffset = L * (1 - p / 100);
    nodo.n.textContent = `${ts.filter(hecha).length}/${ts.length}`;
    nodo.sec.classList.toggle('completo', p === 100 && ts.length > 0);
  }

  function pintarGrupos(primera) {
    const grupos = gruposSemana();
    const vivos = new Set(grupos.map(g => g.id));
    for (const [id, nodo] of nodos) if (!vivos.has(id)) { nodo.sec.remove(); nodos.delete(id); }
    const enfocada = document.activeElement?.closest?.('.grupo')?.dataset.gid;
    const enfoqueEntrada = document.activeElement?.classList.contains('t-in');
    grupos.forEach((g, i) => {
      let nodo = nodos.get(g.id);
      const firma = firmaGrupo(g);
      if (!nodo || nodo.firma !== firma) {
        const nuevo = construirGrupo(g);
        if (nodo) {
          nodo.sec.replaceWith(nuevo.sec);
          // filas nuevas entran con muelle
          entrada([...nuevo.filas.keys()].filter(id => !nodo.filas.has(id)).map(id => nuevo.filas.get(id)), { dy: 10 });
        }
        nodo = nuevo;
        nodos.set(g.id, nodo);
        if (enfocada === g.id && enfoqueEntrada) { nodo.entrada.focus(); }
      } else actualizarGrupo(g, nodo);
      const col = i % 2 ? col2 : col1;
      if (nodo.sec.parentNode !== col || col.children[Math.floor(i / 2)] !== nodo.sec) col.insertBefore(nodo.sec, col.children[Math.floor(i / 2)] || null);
    });
    vacioGrupos.hidden = grupos.length > 0;
    reemplazar(vacioGrupos, el('b', {}, esActual ? 'Semana en blanco' : 'Esta semana no tiene grupos'),
      esActual ? 'Crea un grupo o trae lo que quedó pendiente de la semana pasada.' : '');
    if (primera) entrada(cont.querySelectorAll('.grupo.ab .t'));
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
      titulo: g ? 'Editar grupo' : 'Nuevo grupo', ancho: 520,
      cuerpo: el('div', {},
        campo('Nombre del grupo / persona', nombre),
        el('div', { class: 'fila-campos' }, campo('Persona', persona), campo('Prioridad', prioridad), campo('Color', color)),
        !g && el('div', { class: 'field' }, el('label', {}, 'Tareas (cada una suma el mismo %)'), listaTareas,
          el('button', { class: 'add-st-btn', type: 'button', onclick: filaNueva }, '+ Añadir tarea'))),
      botones: [{ texto: 'Cancelar' }, { texto: g ? 'Guardar' : 'Crear grupo', tipo: 'primario', accion: async () => {
        if (!nombre.value.trim()) { error('Pon un nombre al grupo.'); nombre.focus(); return false; }
        const datos = { nombre: nombre.value.trim(), persona: persona.value || null, prioridad: prioridad.value, color: color.value };
        if (g) { await store.actualizar('grupos', { id: g.id }, datos); return; }
        const nuevo = await store.insertar('grupos', { ...datos, semana, orden: gruposSemana().length, creado_por: store.usuarioId() });
        const titulos = [...listaTareas.querySelectorAll('input')].map(i => i.value.trim()).filter(Boolean);
        if (titulos.length) await store.insertar('tareas', titulos.map((titulo, i) => ({ titulo, grupo_id: nuevo.id, tipo: 'puntual', orden: i, creado_por: store.usuarioId() })));
        abiertos[nuevo.id] = true; guardarAbiertos();
        avisar(`Grupo creado · ${datos.nombre}`, titulos.length ? `${titulos.length} tareas` : '', datos.color);
      } }],
    });
  }
  async function borrarGrupo(g) {
    if (await confirmar(`¿Mandar el grupo «${g.nombre}» y sus tareas a la papelera? Se puede deshacer.`, { si: 'A la papelera', peligro: true })) {
      aPapelera('grupos', g, `Grupo borrado · ${g.nombre}`);
    }
  }

  // ---- arrastrar pendientes de la semana anterior ----
  const pendientesAnterior = () => store.vivas('grupos', g => g.semana === anterior)
    .flatMap(g => store.vivas('tareas', t => t.grupo_id === g.id && !store.hecha(t.id)))
    .filter(t => !store.vivas('tareas', x => x.origen_tarea_id === t.id).length);
  function pintarArrastre() {
    const n = pendientesAnterior().length;
    reemplazar(N.arrastre, n ? el('button', { class: 'pildora', title: 'Copia a esta semana lo que quedó sin hacer', onclick: () => arrastrar(false) },
      `↩ Traer ${n} pendiente${n === 1 ? '' : 's'} de la S${F.numeroSemana(anterior)}`) : null);
  }
  async function arrastrar(automatico) {
    try {
      const n = await ctx.db.rpc('arrastrar_semana', { p_origen: anterior, p_destino: semana });
      if (!ctx.db.enDemo()) await store.cargarTodo();
      if (n || !automatico) avisar(n ? `Traídas ${n} pendientes de la S${F.numeroSemana(anterior)}` : 'No había nada pendiente que traer', '', 'var(--azul)');
    } catch (e) { error(e); }
  }
  if (esActual && !gruposSemana().length && pendientesAnterior().length) {
    const marca = `agenda-jh-arrastre-${semana}`;
    let hecho = false;
    try { hecho = sessionStorage.getItem(marca) === '1'; sessionStorage.setItem(marca, '1'); } catch { /* nada */ }
    if (!hecho) arrastrar(true);
  }

  // ---- notas de la semana (4 cajas, compartidas) ----
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

  // ---- pintar ----
  construirHero();
  pintarChips();
  pintarGrupos(true);
  pintarNotas();
  const quitar = store.on(['grupos', 'tareas', 'tareas_hechas', 'notas_semana', 'perfiles', 'anotaciones'], ts => {
    if (ts.has('perfiles')) construirHero(); else pintarNumeros(false);
    if (ts.has('anotaciones')) pintarChips();
    if (ts.has('grupos') || ts.has('tareas') || ts.has('tareas_hechas') || ts.has('perfiles')) pintarGrupos(false);
    if (ts.has('notas_semana') || ts.has('perfiles')) pintarNotas();
  });
  return () => quitar();
}
