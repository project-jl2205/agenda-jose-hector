// PROMPTS (v2 «Fluido», 8-nov-2026, SQL 006) — la pestaña Prompts de la demo Fluido con datos reales. Solo en el PC.
//   · Cada tarea «para Claude» (tareas.claude; se marca con </> en Semana, también desde el móvil, o se escribe aquí arriba y va
//     a la bandeja) trae su prompt: plantilla fija, SIN IA = la tarea + lo que escribas en «Qué pasa ahora» + la ficha de su
//     proyecto (claude_fichas: en la base, porque llevan rutas y puertos del PC de Jose Luis y el código de la web es público).
//   · Lista agrupada por proyecto (Arreglo / Nuevo · sin mandar / mandado), unida con un hilo con muelle a su prompt, que se
//     puede editar a mano («volver a la plantilla»).
//   · «Abrir en Claude» = enlace <destino>://anthropic.claude-code/open?prompt=… (pestaña nueva de Claude con el prompt escrito,
//     sin enviar; el destino se elige por aparato: Antigravity IDE / Antigravity / VS Code). También Copiar y arrastrar (texto y
//     fichero .md). Las tres lo dejan «mandado», para los dos.
//   · Lo que se escribe se guarda en la tarea (lo ven los dos) y nunca se repinta debajo del cursor.
import { Muelle, QUIETO, EASE, DUR, detener, rodar } from '../motor.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const crecer = ta => { ta.style.height = 'auto'; ta.style.height = `${ta.scrollHeight + 2}px`; };
const ASA = '<svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor"><circle cx="2" cy="2" r="1.4"/><circle cx="8" cy="2" r="1.4"/><circle cx="2" cy="7" r="1.4"/><circle cx="8" cy="7" r="1.4"/><circle cx="2" cy="12" r="1.4"/><circle cx="8" cy="12" r="1.4"/></svg>';
const DESTINOS = { 'antigravity-ide': 'Antigravity IDE', antigravity: 'Antigravity', vscode: 'VS Code' };
const CLAVE_DEST = 'agenda-jh-destino', CLAVE_COMP = 'agenda-jh-comp-nueva', CLAVE_FOCO = 'agenda-jh-prompt-foco';
const ESPERA_GUARDAR = 700;
const leerLS = (k, def) => { try { return localStorage.getItem(k) || def; } catch { return def; } };
const ponerLS = (k, v) => { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } };
// tipo de tarea: arreglo (algo falla) o nuevo (algo que hacer); decide el tono del prompt (el criterio de la demo)
const esArreglo = titulo => !/^(añadir|crear|hacer|montar|mejorar|avisar|poner)\b/i.test(titulo) &&
  (/^(arregl|solucion|corr[ei][gc]|repar)/i.test(titulo) || /fall[aoó]|error|bug|no (funciona|va|carga|abre|sale)|problema|se cuelga|roto|429|duplicad/i.test(titulo));

export function montar(cont, ctx) {
  const { store, F, avisar, ui } = ctx;
  const fallo = e => ui.error(e);
  const hayTablas = () => !store.disponible || store.disponible('claude_fichas');
  const fichas = () => store.filas('claude_fichas').sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
  const ficha = comp => store.fila('claude_fichas', comp) || { proyecto: comp, nombre: comp, color: '#8e8e96', donde: '—', rutas: '—', probar: '—', cuidado: '—' };
  const colorOk = c => (/^#[0-9a-f]{6}$/i.test(c || '') ? c : '#8e8e96');
  const pendientes = () => store.vivas('tareas', t => t.claude && typeof t.claude === 'object' && !store.hecha(t.id))
    .sort((a, b) => (b.claude.n || 0) - (a.claude.n || 0));
  const tarea = id => { const t = id && store.fila('tareas', id); return t && !t.borrado_en && t.claude && !store.hecha(t.id) ? t : null; };
  const grupoTxt = t => (t.grupo_id ? `grupo ${store.fila('grupos', t.grupo_id)?.nombre || '—'}` : 'bandeja');
  const semanaTxt = () => `S${Number(String(F.semanaActual()).split('-W')[1])}`;
  const enviadoTxt = c => (c?.enviado?.en ? `${c.enviado.como || 'mandado'} ${F.diaDe(c.enviado.en) === F.hoy() ? F.horaDe(c.enviado.en) : F.fmtDiaHora(c.enviado.en)}` : 'sin mandar');
  let destino = DESTINOS[leerLS(CLAVE_DEST, '')] ? leerLS(CLAVE_DEST, '') : 'antigravity-ide';
  let compNueva = leerLS(CLAVE_COMP, '');
  const compPorDefecto = () => (store.fila('claude_fichas', compNueva) ? compNueva : fichas()[0]?.proyecto || 'agenda');

  /* ---- lo que se escribe (manda sobre los ecos del tiempo real mientras se guarda) ---- */
  const escrito = new Map();     // id → { nota?, manual? }: lo tecleado que aún no ha vuelto del almacén
  const tGuardar = new Map();    // `${id}|${campo}` → temporizador
  const claudeDe = t => ({ ...t.claude, ...(escrito.get(t.id) || {}) });
  function textoPrompt(t) {
    const c = claudeDe(t), f = ficha(c.comp), arreglo = esArreglo(t.titulo);
    return [t.titulo, '',
      `Dónde: ${f.donde}.`,
      `Ficheros: ${f.rutas}`,
      `Detalles: ${String(c.nota || '').trim() || (arreglo ? 'no sé exactamente qué falla; reprodúcelo primero y dime qué ves antes de cambiar nada.' : 'propón primero cómo lo harías en 3-4 líneas y espera mi OK.')}`,
      `Qué quiero: ${arreglo ? 'que quede arreglado' : 'que quede hecho'} y probado.`,
      `Cómo comprobarlo: ${f.probar}`,
      `Cuidado: ${f.cuidado}`, '',
      `(De la agenda · ${semanaTxt()} · ${grupoTxt(t)})`].join('\n');
  }
  const promptDe = t => { const c = claudeDe(t); return c.manual ?? textoPrompt(t); };
  async function guardar(t, cambios) {
    const actual = store.fila('tareas', t.id); if (!actual?.claude) return;
    try { await store.actualizar('tareas', { id: t.id }, { claude: { ...actual.claude, ...cambios } }); }
    catch (e) { fallo(e); }
  }
  function guardarLuego(t, campo, valor) {
    const e = escrito.get(t.id) || {}; e[campo] = valor; escrito.set(t.id, e);
    const k = `${t.id}|${campo}`; clearTimeout(tGuardar.get(k));
    tGuardar.set(k, setTimeout(async () => {
      tGuardar.delete(k);
      const ahora = escrito.get(t.id);
      if (!ahora || !(campo in ahora)) return;
      const v = ahora[campo];
      await guardar(t, { [campo]: v });
      const e2 = escrito.get(t.id);   // si no se ha vuelto a escribir mientras tanto, ya manda el almacén
      if (e2 && e2[campo] === v && !tGuardar.has(k)) { delete e2[campo]; if (!Object.keys(e2).length) escrito.delete(t.id); }
    }, ESPERA_GUARDAR));
  }
  function guardarYa() {
    for (const [k, tm] of tGuardar) { clearTimeout(tm); const [id, campo] = k.split('|'); const t = store.fila('tareas', id); const v = escrito.get(id)?.[campo]; if (t && v !== undefined) guardar(t, { [campo]: v }); }
    tGuardar.clear();
  }

  /* ---- selección (la de Semana con «↗ prompt», o la primera de la lista tal como se ve) ---- */
  let selK = null;
  try { selK = sessionStorage.getItem(CLAVE_FOCO); sessionStorage.removeItem(CLAVE_FOCO); } catch { /* nada */ }
  const enOrden = () => { const L = pendientes(); return fichas().map(f => f.proyecto).concat([...new Set(L.map(t => t.claude.comp))]).filter((x, i, a) => a.indexOf(x) === i).flatMap(c => L.filter(t => t.claude.comp === c)); };
  const elegirPorDefecto = () => { if (!tarea(selK)) selK = enOrden()[0]?.id || null; };

  /* ---- HTML ---- */
  const ahoraHTML = t => { const n = String(claudeDe(t).nota || '').trim(); return n ? `Ahora: ${esc(n)}` : '<em>Sin describir<span class="tuto">: elígelo y escribe qué pasa ahora</span></em>'; };
  function probHTML(t) {
    const c = t.claude, f = ficha(c.comp), arr = esArreglo(t.titulo), env = !!c.enviado?.en;
    return `<button class="prob ${t.id === selK ? 'sel' : ''}" type="button" data-k="${esc(t.id)}" style="--c:${colorOk(f.color)}"><span class="pb-est ${env ? 'env' : ''}"></span>
      <span class="pb-c"><b>${esc(t.titulo)}</b><span class="pb-ahora">${ahoraHTML(t)}</span>
      <span class="pb-meta"><span class="tipo ${arr ? 'arr' : 'nue'}">${arr ? 'Arreglo' : 'Nuevo'}</span><span class="estado ${env ? 'env' : ''}">${esc(enviadoTxt(c))}</span>${esc(t.grupo_id ? store.fila('grupos', t.grupo_id)?.nombre || '' : 'Bandeja')}</span></span></button>`;
  }
  function listaHTML() {
    const L = pendientes();
    if (!L.length) return '<div class="pr-vacio">Aún no hay tareas para Claude. Márcalas con <b>&lt;/&gt;</b> en Semana (también desde el móvil) o escribe una aquí arriba.</div>';
    const comps = fichas().map(f => f.proyecto).concat([...new Set(L.map(t => t.claude.comp))]).filter((x, i, a) => a.indexOf(x) === i);
    return comps.map(ck => {
      const de = L.filter(t => t.claude.comp === ck); if (!de.length) return '';
      const f = ficha(ck), m = de.filter(t => t.claude.enviado?.en).length;
      return `<div class="pl-cab" style="--c:${colorOk(f.color)}"><i></i><b>${esc(f.nombre)}</b><span>${de.length} · ${m} mandado${m === 1 ? '' : 's'}</span></div>${de.map(probHTML).join('')}`;
    }).join('');
  }
  function panelHTML(t) {
    const c = claudeDe(t), f = ficha(c.comp), man = c.manual != null, env = !!t.claude.enviado?.en;
    return `<div class="card panel" style="--c:${colorOk(f.color)}">
      <div class="pn-cab" draggable="true" data-p="${esc(t.id)}" title="Arrastra el prompt al chat de Claude"><span class="asa6">${ASA}</span><div><small>Prompt para Claude · ${esc(f.nombre)}</small><b>${esc(t.titulo)}</b></div><span class="estado ${env ? 'env' : ''}">${esc(enviadoTxt(t.claude))}</span></div>
      <div class="pn-l"><span>Qué pasa ahora</span></div>
      <textarea class="pn-nota" data-nota="${esc(t.id)}" rows="1" placeholder="Describe el problema tal como está ahora… (entra en el prompt)">${esc(c.nota || '')}</textarea>
      <div class="pn-l"><span>Proyecto</span></div>
      <div class="comps">${fichas().map(x => `<button class="comp ${x.proyecto === c.comp ? 'on' : ''}" type="button" data-cc="${esc(x.proyecto)}" style="--c:${colorOk(x.color)}">${esc(x.nombre)}</button>`).join('')}</div>
      <div class="pn-l"><span>Prompt · puedes editarlo</span><span class="manual" ${man ? '' : 'hidden'}>editado a mano · <button type="button" data-plantilla="1">volver a la plantilla</button></span></div>
      <textarea class="pn-texto" data-texto="${esc(t.id)}" spellcheck="false">${esc(promptDe(t))}</textarea>
      <div class="pr-acc"><button class="prim" type="button" data-abrir="1">Abrir en Claude ↗</button><button type="button" data-copiar="1">Copiar</button><button type="button" class="quitar" data-quitar="1" title="Quitar de Prompts (la tarea se queda)">Quitar</button></div></div>`;
  }

  /* ---- la página ---- */
  const raiz = document.createElement('div'); raiz.className = 'v-prompts'; cont.replaceChildren(raiz);
  function pintarPagina() {
    if (!hayTablas()) {
      raiz.innerHTML = '<div class="card big pr-cab"><div class="etq">Prompts para Claude</div><h2>Aún no están activados</h2><p>Falta aplicar en la base de datos el SQL 006 de la agenda (las fichas de los proyectos van allí, no en la web, que es pública).</p></div>';
      return;
    }
    elegirPorDefecto();
    if (!store.fila('claude_fichas', compNueva)) compNueva = compPorDefecto();
    const L = pendientes(), env = L.filter(t => t.claude.enviado?.en).length;
    raiz.innerHTML = `<div class="card big pr-cab"><div class="etq">Prompts para Claude</div><h2>Cada problema, unido a su prompt</h2>
        <p class="tuto">Elige un problema de la lista: la línea lo une con su prompt, que puedes leer y <b>editar</b>. Lo que escribas en «Qué pasa ahora» entra solo en el prompt. <b>Abrir en Claude</b> lo deja escrito en una pestaña nueva de Claude, sin enviar. Generado <b>sin IA</b>: la tarea, lo que escribas y la ficha de su proyecto.</p>
        <div class="destino">Abrir en ${Object.entries(DESTINOS).map(([k, n]) => `<button type="button" class="${k === destino ? 'on' : ''}" data-dest="${k}">${n}</button>`).join('')}</div>
        <div class="pr-nums"><span><b id="prListos">${L.length - env}</b>sin mandar</span><span><b id="prEnv">${env}</b>mandados</span></div></div>
      <div class="card nueva"><input id="prNueva" placeholder="Nueva tarea de código… p. ej. Arreglar el botón de cerrar del Terminal" autocomplete="off" spellcheck="false" maxlength="300">
        <div class="comps">${fichas().map(f => `<button class="comp ${f.proyecto === compNueva ? 'on' : ''}" type="button" data-cn="${esc(f.proyecto)}" style="--c:${colorOk(f.color)}">${esc(f.nombre)}</button>`).join('')}</div>
        <button class="btnA" type="button" id="prAdd">Añadir</button></div>
      <div class="prl" id="prl"><svg class="pr-hilo" id="prHilo"><path class="h-brillo"/><path class="h-base" pathLength="1"/><path class="h-flujo"/><circle class="h-aro" r="10"/><circle class="h-p h-p1" r="4.5"/><circle class="h-p h-p2" r="4.5"/></svg>
        <div class="prl-lista" id="prLista">${listaHTML()}</div><div class="prl-panel" id="prPanel"></div></div>
      <div class="fantasma" id="prFantasma" aria-hidden="true"><span>↗</span><div><small>Prompt para Claude</small><b></b></div></div>`;
    pintarPanel(false);
  }
  const panelCont = () => raiz.querySelector('#prPanel');
  function pintarPanel(animar) {
    const pan = panelCont(); if (!pan) return;
    const t = tarea(selK);
    pan.style.setProperty('--c', colorOk(t ? ficha(t.claude.comp).color : '#0a84ff'));
    pan.innerHTML = t ? panelHTML(t) : '';
    pan.querySelectorAll('.pn-nota, .pn-texto').forEach(crecer);
    colocarPanel();
    if (animar && t && !QUIETO) {
      pan.firstElementChild.animate([{ opacity: 0, transform: 'translateX(22px) scale(.97)', filter: 'blur(6px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }], { duration: DUR(), easing: EASE() });
      const base = raiz.querySelector('#prHilo .h-base');
      base?.animate([{ strokeDasharray: '1 1', strokeDashoffset: 1 }, { strokeDasharray: '1 1', strokeDashoffset: 0 }], { duration: 650, easing: EASE() });
    }
    requestAnimationFrame(() => medirHilo(animar ? 'muelle' : 'salto'));
  }
  // lo que llega del almacén: la lista se rehace; el panel solo si no se está escribiendo en él (si no, solo su estado)
  function refrescar() {
    if (!hayTablas() || !raiz.querySelector('#prl')) return pintarPagina();
    const antes = selK; elegirPorDefecto();
    const pan = panelCont(), lista = raiz.querySelector('#prLista'), prlN = raiz.querySelector('#prl');
    if (pan.parentElement !== prlN) prlN.append(pan);   // solo en el móvil va dentro de la lista; moverlo si no, le quitaría el foco
    lista.innerHTML = listaHTML();
    const L = pendientes(), env = L.filter(t => t.claude.enviado?.en).length;
    const a = raiz.querySelector('#prListos'), b = raiz.querySelector('#prEnv');
    if (a && +a.textContent !== L.length - env) rodar(a, L.length - env);
    if (b && +b.textContent !== env) rodar(b, env);
    const escribiendo = pan.contains(document.activeElement) && document.activeElement.matches('textarea');
    const t = tarea(selK);
    if (selK !== antes || !escribiendo) pintarPanel(selK !== antes);
    else if (t) {   // escribiendo: solo lo de alrededor (estado, proyecto, «editado a mano»)
      const est = pan.querySelector('.pn-cab .estado'); est.textContent = enviadoTxt(t.claude); est.classList.toggle('env', !!t.claude.enviado?.en);
      pan.querySelectorAll('[data-cc]').forEach(x => x.classList.toggle('on', x.dataset.cc === claudeDe(t).comp));
      const ta = pan.querySelector('.pn-texto');
      if (document.activeElement !== ta && claudeDe(t).manual == null) { ta.value = textoPrompt(t); crecer(ta); }
      colocarPanel(); medirHilo('seguir');
    }
  }
  function seleccionar(id) {
    if (!tarea(id)) return;
    const cambia = id !== selK; selK = id;
    raiz.querySelectorAll('.prob').forEach(b => b.classList.toggle('sel', b.dataset.k === id));
    pintarPanel(cambia);
  }

  /* ---- el hilo: une el problema elegido con su prompt, con muelle (el de la demo) ---- */
  const H = { x1: 0, y1: 0, x2: 0, y2: 0, listo: false };
  const dibujarHilo = () => {
    const svg = raiz.querySelector('#prHilo'); if (!svg) return;
    const { x1, y1, x2, y2 } = H, dx = Math.max(26, (x2 - x1) * 0.55);
    const d = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
    svg.querySelectorAll('path').forEach(p => p.setAttribute('d', d));
    const pon = (s, x, y) => { const c = svg.querySelector(s); c?.setAttribute('cx', x); c?.setAttribute('cy', y); };
    pon('.h-p1', x1, y1); pon('.h-aro', x1, y1); pon('.h-p2', x2, y2);
  };
  const mY1 = new Muelle(0, v => { H.y1 = v; dibujarHilo(); }, { k: 240, c: 22, eps: 0.2 });
  const mY2 = new Muelle(0, v => { H.y2 = v; dibujarHilo(); }, { k: 200, c: 22, eps: 0.2 });
  const anima = m => Math.abs(m.x - m.obj) > m.eps || Math.abs(m.v) > m.eps;
  function medirHilo(modo) {
    const prl = raiz.querySelector('#prl'); if (!prl) return;
    const svg = prl.querySelector('#prHilo'), sel = prl.querySelector('.prob.sel'), pan = panelCont();
    if (!sel || !pan?.firstElementChild || innerWidth <= 820) { if (svg) svg.style.opacity = 0; return; }
    const B = prl.getBoundingClientRect(), a = sel.getBoundingClientRect(), b = pan.getBoundingClientRect();
    H.x1 = a.right - B.left; H.x2 = b.left - B.left;
    const t1 = a.top + a.height / 2 - B.top, t2 = Math.min(b.top + 34, b.bottom - 24) - B.top;
    svg.style.setProperty('--c', sel.style.getPropertyValue('--c')); svg.style.opacity = 1;
    if (modo === 'salto' || !H.listo || (modo === 'seguir' && !anima(mY1) && !anima(mY2))) {
      detener(mY1); detener(mY2); mY1.x = mY1.obj = H.y1 = t1; mY2.x = mY2.obj = H.y2 = t2; mY1.v = mY2.v = 0; H.listo = true; dibujarHilo();
    } else { mY1.a(t1); mY2.a(t2); }
  }
  // en el móvil (si alguien llega aquí) el panel va justo debajo del elegido; en el PC, en su columna
  function colocarPanel() {
    const prl = raiz.querySelector('#prl'), pan = panelCont(); if (!prl || !pan) return;
    const sel = prl.querySelector('.prob.sel');
    if (innerWidth <= 820 && sel) { if (sel.nextElementSibling !== pan) sel.after(pan); }
    else if (pan.parentElement !== prl) prl.append(pan);
  }

  /* ---- acciones ---- */
  async function marcarEnviado(t, como) {
    guardarYa();
    await guardar(t, { enviado: { como, en: new Date().toISOString() } });
  }
  function abrirEnClaude(t) {
    const a = document.createElement('a');
    a.href = `${destino}://anthropic.claude-code/open?prompt=${encodeURIComponent(promptDe(t))}`; a.hidden = true;
    document.body.append(a); a.click(); a.remove();   // Chrome pregunta «¿Abrir …?» y Antigravity, la 1.ª vez, «Allow … to open this URI?»
    marcarEnviado(t, 'abierto');
    avisar(`Abriendo en ${DESTINOS[destino]}: pestaña nueva de Claude con el prompt escrito`, '↗', 'var(--azul)');
  }
  async function copiar(t) {
    const txt = promptDe(t);
    try { await navigator.clipboard.writeText(txt); }
    catch {
      const ta = document.createElement('textarea'); ta.value = txt; ta.style.cssText = 'position:fixed;left:-9999px';
      document.body.append(ta); ta.select(); try { document.execCommand('copy'); } catch { /* nada */ } ta.remove();
    }
    marcarEnviado(t, 'copiado');
    avisar('Prompt copiado · pégalo en Claude', t.titulo, 'var(--azul)');
  }
  async function quitar(t) {
    const antes = t.claude; guardarYa();
    try {
      await store.actualizar('tareas', { id: t.id }, { claude: null });
      avisar(`Quitada de Prompts · ${t.titulo}`, '', '#8e8e96', () => store.actualizar('tareas', { id: t.id }, { claude: antes }).catch(fallo));
    } catch (e) { fallo(e); }
  }
  async function nueva() {
    const inp = raiz.querySelector('#prNueva'), titulo = inp.value.trim();
    if (!titulo) return inp.focus();
    const id = crypto.randomUUID(), comp = compPorDefecto();
    inp.value = '';
    try {
      const p = store.insertar('tareas', { id, titulo, tipo: 'puntual', grupo_id: null, fecha: null, orden: 0, creado_por: store.usuarioId(),
        claude: { comp, nota: '', manual: null, enviado: null, n: Date.now() } });
      selK = id; refrescar();
      const nodo = raiz.querySelector(`.prob[data-k="${CSS.escape(id)}"]`);
      if (nodo && !QUIETO) nodo.animate([{ opacity: 0, transform: 'translateX(-18px) scale(.94)' }, { opacity: 1, transform: 'none' }], { duration: DUR(), easing: EASE() });
      avisar(titulo, 'con su prompt', colorOk(ficha(comp).color));
      setTimeout(() => panelCont()?.querySelector('.pn-nota')?.focus(), 350);
      await p;
    } catch (e) { if (!inp.value) inp.value = titulo; fallo(e); }
  }

  /* ---- eventos ---- */
  const alClic = ev => {
    const t = tarea(selK);
    const pb = ev.target.closest('.prob'); if (pb) return seleccionar(pb.dataset.k);
    const de = ev.target.closest('[data-dest]');
    if (de) { destino = de.dataset.dest; ponerLS(CLAVE_DEST, destino); raiz.querySelectorAll('[data-dest]').forEach(b => b.classList.toggle('on', b === de)); return; }
    const cn = ev.target.closest('[data-cn]');
    if (cn) { compNueva = cn.dataset.cn; ponerLS(CLAVE_COMP, compNueva); raiz.querySelectorAll('[data-cn]').forEach(b => b.classList.toggle('on', b === cn)); return raiz.querySelector('#prNueva')?.focus(); }
    if (ev.target.closest('#prAdd')) return nueva();
    if (!t) return;
    if (ev.target.closest('[data-abrir]')) return abrirEnClaude(t);
    if (ev.target.closest('[data-copiar]')) return copiar(t);
    if (ev.target.closest('[data-quitar]')) return quitar(t);
    const cc = ev.target.closest('[data-cc]');
    if (cc && cc.dataset.cc !== claudeDe(t).comp) { guardarYa(); return guardar(t, { comp: cc.dataset.cc }); }   // cambia de grupo en la lista y el hilo la sigue
    if (ev.target.closest('[data-plantilla]')) {
      const e = escrito.get(t.id); if (e) delete e.manual; clearTimeout(tGuardar.get(`${t.id}|manual`)); tGuardar.delete(`${t.id}|manual`);
      const pan = panelCont(), ta = pan.querySelector('.pn-texto'); ta.value = textoPrompt({ ...t, claude: { ...t.claude, manual: null } }); crecer(ta);
      pan.querySelector('.manual').hidden = true;
      return guardar(t, { manual: null });
    }
  };
  const alEscribir = ev => {
    const n = ev.target.closest?.('[data-nota]');
    if (n) {
      const t = tarea(n.dataset.nota); if (!t) return;
      crecer(n); guardarLuego(t, 'nota', n.value);
      const ta = panelCont().querySelector('.pn-texto');
      if (claudeDe(t).manual == null) { ta.value = textoPrompt(t); crecer(ta); }   // si lo editaste a mano, no se pisa
      const pa = raiz.querySelector(`.prob[data-k="${CSS.escape(t.id)}"] .pb-ahora`); if (pa) pa.innerHTML = ahoraHTML(t);
      return medirHilo('seguir');
    }
    const tx = ev.target.closest?.('[data-texto]');
    if (tx) { const t = tarea(tx.dataset.texto); if (!t) return; crecer(tx); guardarLuego(t, 'manual', tx.value); panelCont().querySelector('.manual').hidden = false; }
  };
  const alTecla = ev => {
    if (ev.target.id === 'prNueva') { if (ev.key === 'Enter') { ev.preventDefault(); nueva(); } else if (ev.key === 'Escape') ev.target.blur(); }
  };
  // arrastrar el prompt fuera de la ventana: el texto (y, soltado en el escritorio, un .md)
  let arrastre = null;
  const alArrastrar = ev => {
    const n = ev.target.closest?.('[data-p]'), t = n && tarea(n.dataset.p); if (!t) return;
    const txt = promptDe(t), dt = ev.dataTransfer;
    dt.effectAllowed = 'copy'; dt.setData('text/plain', txt);
    const nombre = `prompt-${t.titulo.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)}`;
    try { dt.setData('DownloadURL', `text/markdown:${nombre}.md:data:text/markdown;charset=utf-8,${encodeURIComponent(txt)}`); } catch { /* nada */ }
    const f = raiz.querySelector('#prFantasma'); if (f) { f.querySelector('b').textContent = t.titulo; dt.setDragImage(f, 24, 24); }
    arrastre = { n, t }; setTimeout(() => n.classList.add('volando'));
  };
  const alSoltar = ev => {
    if (!arrastre) return;
    const { n, t } = arrastre; arrastre = null; n.classList.remove('volando');
    if (ev.dataTransfer.dropEffect === 'none') return avisar('No se soltó en ningún sitio · usa «Abrir en Claude»', '', '#8e8e96');
    marcarEnviado(t, 'arrastrado');
    avisar(t.titulo, 'soltado ✓', 'var(--azul)');
  };
  const alAgarrar = ev => { const tk = ev.target.closest('.pn-cab')?.closest('.panel'); if (tk) tk._t = setTimeout(() => tk.classList.add('agarrado'), 110); };
  const alSoltarTicket = () => raiz.querySelectorAll('.panel').forEach(tk => { clearTimeout(tk._t); tk.classList.remove('agarrado'); });
  const alMover = () => requestAnimationFrame(() => medirHilo('seguir'));
  const alCambiarTam = () => { colocarPanel(); medirHilo('salto'); };
  raiz.addEventListener('click', alClic);
  raiz.addEventListener('input', alEscribir);
  raiz.addEventListener('keydown', alTecla);
  raiz.addEventListener('dragstart', alArrastrar);
  raiz.addEventListener('dragend', alSoltar);
  raiz.addEventListener('pointerdown', alAgarrar);
  addEventListener('pointerup', alSoltarTicket); addEventListener('pointercancel', alSoltarTicket);
  addEventListener('scroll', alMover, { passive: true });
  addEventListener('resize', alCambiarTam);
  const ro = new ResizeObserver(() => medirHilo('seguir'));

  pintarPagina();
  const prl = raiz.querySelector('#prl'); if (prl) ro.observe(prl);
  document.fonts?.ready.then(() => { if (raiz.isConnected) medirHilo('salto'); });
  const quitarOyente = store.on(['tareas', 'tareas_hechas', 'claude_fichas', 'grupos'], () => { refrescar(); const p2 = raiz.querySelector('#prl'); if (p2) ro.observe(p2); });
  if (innerWidth > 820 && !tarea(selK)) setTimeout(() => raiz.querySelector('#prNueva')?.focus({ preventScroll: true }), 420);

  return () => {
    guardarYa();
    quitarOyente(); ro.disconnect(); detener(mY1); detener(mY2);
    raiz.removeEventListener('click', alClic); raiz.removeEventListener('input', alEscribir); raiz.removeEventListener('keydown', alTecla);
    raiz.removeEventListener('dragstart', alArrastrar); raiz.removeEventListener('dragend', alSoltar); raiz.removeEventListener('pointerdown', alAgarrar);
    removeEventListener('pointerup', alSoltarTicket); removeEventListener('pointercancel', alSoltarTicket);
    removeEventListener('scroll', alMover); removeEventListener('resize', alCambiarTam);
  };
}
