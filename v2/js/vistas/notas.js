// NOTAS DE MERCADO (v2 «Fluido», tanda 3, SQL 004) — la pestaña Notas de la demo con datos reales.
//   · Texto libre, como un .txt: lo escribes tú entero. Enter guarda con la hora en que la escribiste; Mayús+Enter, otra línea.
//   · Corregir: se pincha en su texto. Se guarda al parar de escribir y al salir; la hora de la nota NO cambia (la base
//     apunta la corrección: ✎). Si la dejas vacía, se va a la papelera (con «Deshacer»).
//   · Borrar = papelera (borrado_en) con «Deshacer»; nunca se borra de verdad.
//   · PRIVADAS: la base solo devuelve las de cada uno (RLS del SQL 004) y aquí además se filtra por autor.
//   · «Descargar .txt» con todas, por días.
//   · Lo que se está corrigiendo no se repinta nunca debajo del cursor; los guardados de cada nota van en cola (llegan en
//     orden) y lo escrito manda sobre los ecos del tiempo real hasta 10 s después de soltarla. Si un guardado falla, lo
//     escrito se queda (la hora sale en ámbar) y se reintenta al volver a tocarla o al salir de ella.
//   · Si la base aún no tiene la tabla (SQL 004 sin aplicar), lo dice y no deja escribir.
import { QUIETO, EASE, DUR } from '../motor.js';

const TABLA = 'notas_mercado';
const MAX = 20000;
const ESPERA_GUARDAR = 800;     // ms sin teclear antes de guardar una corrección
const MANDA_LO_ESCRITO = 10000; // ms después de soltar una nota en que lo escrito manda sobre los ecos
const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const crecer = ta => { ta.style.height = 'auto'; ta.style.height = `${ta.scrollHeight + 2}px`; };
const tactil = () => matchMedia('(pointer: coarse)').matches;
const leer = tx => tx.innerText.replace(/\n$/, '');
const CANDADO = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';

export function montar(cont, ctx) {
  const { store, F, avisar, ui } = ctx;
  const yo = () => store.usuarioId();
  const fallo = e => ui.error(e);
  const hayTabla = () => !store.disponible || store.disponible(TABLA);
  const otro = () => store.perfiles().find(p => p.id !== yo())?.nombre || 'el otro';
  const mias = () => store.vivas(TABLA, n => n.autor === yo())
    .sort((a, b) => Date.parse(a.creada_en) - Date.parse(b.creada_en) || String(a.id).localeCompare(String(b.id)));
  const diaTxt = iso => {
    const d = F.diaDe(iso), h = F.hoy(), largo = F.fmtDiaLargo(iso);
    return d === h ? `Hoy · ${largo}` : d === F.sumarDias(h, -1) ? `Ayer · ${largo}` : largo;
  };
  const cuandoTxt = iso => new Date(iso).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });

  /* ---- lo escrito y su cola de guardados ---- */
  const escrito = new Map();    // id → { texto, fijo, hasta, error }: manda sobre lo del almacén mientras se corrige y un rato después
  const cadena = new Map();     // id → promesa: los guardados de una nota, uno detrás de otro
  const tGuardar = new Map();   // id → temporizador del guardado al parar de escribir
  const enviando = new Map();   // id → cuántos guardados en vuelo
  const textoDe = n => { const e = escrito.get(n.id); return e && (e.fijo || performance.now() < e.hasta) ? e.texto : n.texto; };
  const enfocada = id => document.activeElement?.closest?.('.nt')?.dataset.n === id && cont.contains(document.activeElement);
  const enCola = (id, fn) => { const p = (cadena.get(id) || Promise.resolve()).then(fn); cadena.set(id, p.catch(() => {})); return p; };
  function soltar(id) {     // ya no se escribe en ella y no queda nada por guardar: el almacén vuelve a mandar (en un rato)
    const e = escrito.get(id);
    if (!e || enfocada(id) || tGuardar.has(id) || enviando.get(id) || e.error) return;
    e.fijo = false; e.hasta = performance.now() + MANDA_LO_ESCRITO;
  }
  function guardarTexto(id, texto, ya = false) {
    clearTimeout(tGuardar.get(id)); tGuardar.delete(id);
    const e = escrito.get(id) || {};
    Object.assign(e, { texto, fijo: true }); escrito.set(id, e);
    const lanzar = () => {
      tGuardar.delete(id);
      if (!e.texto.trim()) return Promise.resolve();          // vacía: no se guarda (al salir de ella se va a la papelera)
      return enCola(id, async () => {
        const t = e.texto.slice(0, MAX);
        const n = store.fila(TABLA, id);
        if (n && n.texto !== t) {
          enviando.set(id, (enviando.get(id) || 0) + 1);
          try { await store.actualizar(TABLA, { id }, { texto: t }); e.error = false; }
          catch (err) { e.error = true; e.fijo = true; fallo(err); }   // sin guardar: lo escrito se queda hasta que entre
          finally { enviando.set(id, enviando.get(id) - 1); }
        } else e.error = false;
        soltar(id); pintar();
      });
    };
    if (ya) return lanzar();
    tGuardar.set(id, setTimeout(lanzar, ESPERA_GUARDAR));
    return null;
  }

  /* ---- pintar (por claves: lo que ya está no se rehace; lo que se corrige no se toca) ---- */
  const notaHTML = n => `<div class="nt" data-k="n${esc(n.id)}" data-n="${esc(n.id)}"><time></time><div class="nt-tx" contenteditable="plaintext-only" spellcheck="false"></div><button class="nt-x" data-borrar="${esc(n.id)}" title="Borrar" aria-label="Borrar esta nota">×</button></div>`;
  function ponerNota(elN, n) {
    const e = escrito.get(n.id), corregida = !!(n.editada_en || (e && e.texto !== n.texto));
    const t = elN.querySelector('time'), h = `${esc(F.horaDe(n.creada_en))}${corregida ? '<i>✎</i>' : ''}`;
    if (t.innerHTML !== h) t.innerHTML = h;
    const titulo = `Escrita el ${cuandoTxt(n.creada_en)}${n.editada_en ? ` · corregida el ${cuandoTxt(n.editada_en)}` : ''}${e?.error ? ' · SIN GUARDAR: se reintenta al tocarla' : ''}`;
    if (t.title !== titulo) t.title = titulo;
    elN.classList.toggle('sin-guardar', !!e?.error);
    const tx = elN.querySelector('.nt-tx'), quiero = textoDe(n);
    if (document.activeElement !== tx && leer(tx) !== quiero) tx.textContent = quiero;
  }
  function crear(q) {
    const plantilla = document.createElement('template');
    plantilla.innerHTML = q.n && !q.d ? notaHTML(q.n) : `<div class="nt-dia" data-k="${q.k}"></div>`;
    return plantilla.content.firstElementChild;
  }
  function quitarNodo(x) {
    x.classList.add('saliendo'); delete x.dataset.k;
    if (QUIETO || !x.classList.contains('nt') || !x.animate) return x.remove();
    x.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateX(-24px)' }], { duration: 220, easing: 'ease-in' }).onfinish = () => x.remove();
  }
  function pintar(nuevaId) {
    const lista = cont.querySelector('#ntLista'); if (!lista) return;
    const ns = mias();
    const c = cont.querySelector('#ntCuenta'); if (c) c.textContent = `${ns.length} nota${ns.length === 1 ? '' : 's'}`;
    const bt = cont.querySelector('[data-txt]'); if (bt) bt.disabled = !ns.length;
    const quiero = []; let dia = '';
    for (const n of ns) { const d = F.diaDe(n.creada_en); if (d !== dia) { quiero.push({ k: `d${d}`, d, n }); dia = d; } quiero.push({ k: `n${n.id}`, n }); }
    let vacio = lista.querySelector('.nt-vacio');
    if (!quiero.length && !vacio) {
      vacio = document.createElement('div'); vacio.className = 'nt-vacio';
      vacio.textContent = hayTabla() ? 'Aún no hay notas. Escribe abajo lo que ves en el mercado y pulsa Enter: se guarda con la hora.'
        : 'Las notas aún no están activadas en la base de datos (falta aplicar el SQL 004 de la agenda): lo que escribieras no se podría guardar.';
      lista.prepend(vacio);
    } else if (quiero.length && vacio) vacio.remove();
    const hay = new Map([...lista.children].filter(x => x.dataset.k).map(x => [x.dataset.k, x]));
    let previo = vacio && !quiero.length ? vacio : null;
    for (const q of quiero) {
      let elq = hay.get(q.k);
      if (elq) hay.delete(q.k); else elq = crear(q);
      if (q.d) { const txt = diaTxt(q.n.creada_en); if (elq.textContent !== txt) elq.textContent = txt; } else ponerNota(elq, q.n);
      // en su sitio, sin mover lo que ya está bien colocado (mover un nodo le quita el foco a lo que se escribe)
      let sitio = previo ? previo.nextSibling : lista.firstChild;
      while (sitio && sitio.classList?.contains('saliendo')) sitio = sitio.nextSibling;
      if (elq !== sitio) lista.insertBefore(elq, sitio);
      previo = elq;
    }
    for (const x of hay.values()) quitarNodo(x);
    if (nuevaId && !QUIETO) {
      const elN = lista.querySelector(`.nt[data-n="${CSS.escape(nuevaId)}"]`);
      if (elN) {
        elN.animate([{ opacity: 0, transform: 'translateY(14px) scale(.98)', filter: 'blur(4px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }], { duration: DUR(), easing: EASE() });
        if (!tactil()) elN.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }

  /* ---- la página ---- */
  cont.innerHTML = `<div class="v-notas">
    <div class="card nt-cab"><div class="etq">Notas de mercado</div><h2>Lo que ves, con su hora</h2>
      <p class="tuto">Texto libre, como un .txt: lo escribes tú entero. Pulsa <b>Enter</b> y se guarda con la hora en que la escribiste; <b>Mayús+Enter</b> para otra línea. Para corregir una, pincha en su texto (la hora no cambia).</p>
      <div class="nt-meta"><span class="nt-priv">${CANDADO}Solo tú · ${esc(otro())} no las ve</span>
        <span class="nt-cnt" id="ntCuenta">0 notas</span><button class="nt-btn" data-txt="1" type="button">Descargar .txt</button></div></div>
    <div class="card nt-doc" data-hasta-el-final><div class="nt-lista" id="ntLista"></div>
      <div class="nt-comp" data-pegado-abajo><span class="hora" id="ntHora" title="La hora que llevará">${esc(F.horaDe(new Date()))}</span>
        <textarea id="ntNueva" rows="1" spellcheck="false" maxlength="${MAX}" aria-label="Nota nueva" placeholder="p. ej.: BTC rompe mi suelo marcado del día (80.000)… · Enter guarda"></textarea></div></div>
  </div>`;
  const ta = cont.querySelector('#ntNueva');
  if (!hayTabla()) { ta.disabled = true; ta.placeholder = 'Falta activar las notas en la base de datos (SQL 004)'; }
  pintar();

  async function nuevaNota() {
    const txt = ta.value.replace(/\s+$/, '');
    if (!txt.trim()) { ta.value = ''; crecer(ta); return; }     // solo espacios: no se guarda, y no se quedan escondidos en el campo
    if (!hayTabla()) return avisar('Las notas aún no están activadas', 'falta el SQL 004', '#ff453a');
    const n = { id: crypto.randomUUID(), autor: yo(), texto: txt, creada_en: new Date().toISOString() };
    ta.value = ''; crecer(ta);
    const p = store.insertar(TABLA, n);    // optimista: ya está en el almacén
    pintar(n.id);
    avisar(txt.split('\n')[0], F.horaDe(n.creada_en), '#ffd60a');
    try { await p; } catch (e) {
      if (!ta.value) { ta.value = txt; crecer(ta); }   // no se pierde lo escrito: vuelve al campo para reintentar
      fallo(e);
    }
  }
  function borrarNota(id) {
    const n = store.fila(TABLA, id); if (!n || n.borrado_en) return;
    const elN = cont.querySelector(`.nt[data-n="${CSS.escape(id)}"]`);
    if (elN?.classList.contains('saliendo')) return;               // ya se está borrando (vaciarla y pulsar su ×)
    if (elN) quitarNodo(elN);                                       // fuera al momento; si la base dijera que no, vuelve
    const e = escrito.get(id);
    clearTimeout(tGuardar.get(id)); tGuardar.delete(id);
    const cambios = { borrado_en: new Date().toISOString() };
    if (e && e.texto.trim() && e.texto !== n.texto) cambios.texto = e.texto.slice(0, MAX);   // lo último escrito se va con ella
    const primera = ((e?.texto.trim() ? e.texto : n.texto) || '').split('\n')[0];
    escrito.delete(id);
    enCola(id, () => store.actualizar(TABLA, { id }, cambios)).catch(fallo);
    avisar(`Nota borrada · ${primera}`, F.horaDe(n.creada_en), '#8e8e96', () => enCola(id, () => store.restaurar(TABLA, id)).catch(fallo));
  }
  function descargarTxt() {
    let dia = '', t = 'NOTAS DE MERCADO\n';
    for (const n of mias()) {
      const d = diaTxt(n.creada_en);
      if (d !== dia) { t += `\n== ${d} ==\n`; dia = d; }
      t += `${F.horaDe(n.creada_en)}  ${textoDe(n).replace(/\n/g, '\n       ')}\n`;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([t], { type: 'text/plain;charset=utf-8' }));
    a.download = `notas-mercado-${F.hoy()}.txt`; a.hidden = true; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  /* ---- eventos ---- */
  const alClic = ev => {
    const b = ev.target.closest('[data-borrar]'); if (b) return borrarNota(b.dataset.borrar);
    if (ev.target.closest('[data-txt]')) return descargarTxt();
  };
  const alEscribir = ev => {
    if (ev.target === ta) return crecer(ta);
    const tx = ev.target.closest?.('.nt-tx'); if (!tx) return;
    const id = tx.closest('.nt').dataset.n;
    guardarTexto(id, leer(tx));
    const n = store.fila(TABLA, id); if (n) ponerNota(tx.closest('.nt'), n);   // ✎ al momento
  };
  const alTecla = ev => {
    if (ev.target === ta) {
      if (ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing) { ev.preventDefault(); nuevaNota(); }
      else if (ev.key === 'Escape') ta.blur();
      return;
    }
    if (ev.target.closest?.('.nt-tx') && ev.key === 'Escape') ev.target.blur();
  };
  const alSalir = ev => {
    const tx = ev.target.closest?.('.nt-tx'); if (!tx) return;
    const elN = tx.closest('.nt'), id = elN?.dataset.n; if (!id || elN.classList.contains('saliendo')) return;
    const e = escrito.get(id); if (!e) return;
    if (!leer(tx).trim()) return borrarNota(id);                 // la ha dejado vacía: a la papelera (con «Deshacer»)
    guardarTexto(id, leer(tx), true);                              // lo pendiente, ya (y luego el almacén vuelve a mandar)
  };
  cont.addEventListener('click', alClic);
  cont.addEventListener('input', alEscribir);
  cont.addEventListener('keydown', alTecla);
  cont.addEventListener('focusout', alSalir);

  const quitarOyente = store.on([TABLA, 'perfiles'], () => {
    pintar();
    const pr = cont.querySelector('.nt-priv'); if (pr) pr.innerHTML = `${CANDADO}Solo tú · ${esc(otro())} no las ve`;
  });
  let diaPintado = F.hoy();
  const reloj = setInterval(() => {
    const h = cont.querySelector('#ntHora'); if (h) h.textContent = F.horaDe(new Date());
    if (F.hoy() !== diaPintado) { diaPintado = F.hoy(); pintar(); }   // «Hoy» pasa a «Ayer» a medianoche
  }, 15000);
  if (!tactil() && innerWidth > 820 && hayTabla()) setTimeout(() => { if (cont.isConnected) ta.focus({ preventScroll: true }); }, 420);

  return () => {
    // lo que quedara por guardar se guarda ya (al cambiar de pestaña no se pierde nada)
    for (const [id, t] of tGuardar) { clearTimeout(t); const e = escrito.get(id); if (e) { tGuardar.delete(id); guardarTexto(id, e.texto, true); } }
    quitarOyente(); clearInterval(reloj);
    cont.removeEventListener('click', alClic); cont.removeEventListener('input', alEscribir);
    cont.removeEventListener('keydown', alTecla); cont.removeEventListener('focusout', alSalir);
  };
}
