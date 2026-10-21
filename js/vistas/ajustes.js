// AJUSTES — perfil, estado del agente, etiquetas, símbolos, papelera, instalar en el móvil y salir.

import { el, campo, selector, modal, chip, toast, error, confirmar, reemplazar, vacio, avatar } from '../ui.js';
import { nuevoSimbolo } from './setups.js';

const AMBITOS = [['todas', 'Todo'], ['tareas', 'Tareas'], ['mercado', 'Mercado'], ['setups', 'Setups']];
const PAPELERA = [['grupos', 'Grupo', g => g.nombre], ['tareas', 'Tarea', t => t.titulo], ['anotaciones', 'Anotación', a => a.titulo],
  ['setups', 'Setup', s => `${s.simbolo} ${s.temporalidad}`], ['herramientas', 'Herramienta', h => h.nombre], ['etiquetas', 'Etiqueta', e => e.nombre],
  ['comentarios', 'Comentario', c => c.texto.slice(0, 60)]];

export function montar(cont, ctx) {
  const { store, F, db } = ctx;
  ctx.titulo('Ajustes');
  const perfil = el('div', {}), agente = el('div', {}), etiquetas = el('div', {}), simbolos = el('div', {}), papelera = el('div', {});
  cont.append(
    el('div', { class: 'g2' },
      el('div', {}, el('div', { class: 'sec' }, el('span', {}, 'Tu perfil')), perfil),
      el('div', {}, el('div', { class: 'sec' }, el('span', {}, 'Agente de setups')), agente)),
    el('div', { class: 'sec' }, el('span', {}, 'Etiquetas por campo')), etiquetas,
    el('div', { class: 'sec' }, el('span', {}, 'Símbolos')), simbolos,
    el('div', { class: 'sec' }, el('span', {}, 'Papelera')), papelera,
    el('div', { class: 'sec' }, el('span', {}, 'Instalar en el móvil')),
    el('div', { class: 'card texto-largo' },
      el('p', {}, el('b', {}, 'Android (Chrome): '), 'abre la web → menú ⋮ (arriba a la derecha) → «Instalar aplicación» o «Añadir a pantalla de inicio».'),
      el('p', {}, el('b', {}, 'iPhone (Safari): '), 'abre la web → botón Compartir (cuadrado con flecha) → «Añadir a pantalla de inicio».'),
      el('p', { class: 'card-sub' }, 'Se abre a pantalla completa como una app. Los datos son los mismos que en el PC y se actualizan solos.')),
    el('div', { style: { marginTop: '20px', display: 'flex', gap: '10px', flexWrap: 'wrap' } },
      el('button', { class: 'btn btn-peligro', onclick: async () => { if (await confirmar('¿Salir de la agenda en este dispositivo?', { si: 'Salir' })) { await db.auth.salir(); location.reload(); } } }, 'SALIR'),
      db.enDemo() && el('button', { class: 'btn', onclick: async () => {
        if (!await confirmar('¿Borrar los datos del modo demo de este navegador y volver a los de ejemplo?', { si: 'Reiniciar demo', peligro: true })) return;
        try { localStorage.removeItem('agenda-jh-demo-v1'); } catch { /* nada */ }
        location.reload();
      } }, 'REINICIAR DEMO')));

  function pintarPerfil() {
    const yo = store.usuario();
    const nombre = el('input', { value: yo.nombre });
    const color = el('input', { type: 'color', value: yo.color });
    const inicio = el('input', { type: 'time', value: String(yo.jornada_inicio || '09:00').slice(0, 5) });
    const fin = el('input', { type: 'time', value: yo.jornada_fin ? String(yo.jornada_fin).slice(0, 5) : '' });
    reemplazar(perfil, el('div', { class: 'card' },
      el('div', { class: 'perfil-cab' }, avatar(yo, 40), el('div', {}, el('b', {}, yo.nombre), el('div', { class: 'card-sub' }, yo.email))),
      el('div', { class: 'fila-campos' }, campo('Nombre', nombre), campo('Color', color)),
      el('div', { class: 'fila-campos' }, campo('Empiezo el día a las', inicio), campo('Termino a las (opcional)', fin)),
      el('button', { class: 'btn btn-primario', onclick: async () => {
        try {
          await store.actualizar('perfiles', { id: yo.id }, {
            nombre: nombre.value.trim() || yo.nombre, color: color.value,
            jornada_inicio: `${inicio.value || '09:00'}:00`, jornada_fin: fin.value ? `${fin.value}:00` : null,
          });
          toast('Perfil guardado');
        } catch (e) { error(e); }
      } }, 'GUARDAR')));
  }

  function pintarAgente() {
    const a = store.fila('agente_estado', 'setups');
    const fila = (k, v, clase = '') => el('div', { class: 'tool-row' }, el('span', {}, k), el('span', { class: clase }, v));
    if (!a) { reemplazar(agente, el('div', { class: 'card' }, el('p', { class: 'texto-largo' }, 'El agente aún no ha dado señales. Corre en el PC de Jose Luis (necesita MT5 abierto): «INSTALAR AGENTE AGENDA.bat» lo deja arrancando solo.'))); return; }
    const min = (Date.now() - new Date(a.latido).getTime()) / 60000;
    reemplazar(agente, el('div', { class: 'card' },
      fila('Último latido', `${F.fmtDiaHora(a.latido)} (${F.fmtRelativo(a.latido)})`, min < 3 ? 'verde' : min < 15 ? 'ambar' : 'rojo'),
      fila('MT5', a.mt5_ok ? 'conectado' : 'sin conexión', a.mt5_ok ? 'verde' : 'rojo'),
      fila('Reloj', a.reloj_ok ? 'cuadra con UTC' : 'descuadrado: no evalúa', a.reloj_ok ? 'verde' : 'rojo'),
      fila('Versión', a.version || '—'),
      a.ultimo_error && fila('Último error', `${a.ultimo_error}${a.ultimo_error_en ? ' · ' + F.fmtDiaHora(a.ultimo_error_en) : ''}`, 'rojo'),
      el('div', { class: 'card-sub', style: { marginTop: '8px' } }, 'Verde: latido de hace menos de 3 min. Ámbar: hasta 15 min. Rojo: caído (lo verás en la cabecera de todas las pantallas).')));
  }

  function pintarEtiquetas() {
    const es = store.vivas('etiquetas').sort((a, b) => a.ambito.localeCompare(b.ambito) || a.nombre.localeCompare(b.nombre));
    reemplazar(etiquetas, el('div', { class: 'card' },
      es.length ? el('div', { class: 'chips' }, es.map(e => el('button', { class: 'chip', style: { '--c': e.color }, title: 'Editar', onclick: () => editarEtiqueta(e) }, `${e.nombre} · ${AMBITOS.find(x => x[0] === e.ambito)?.[1]}`))) : el('div', { class: 'card-sub' }, 'Sin etiquetas.'),
      el('button', { class: 'add-st-btn', onclick: () => editarEtiqueta(null) }, '+ Nueva etiqueta')));
  }
  function editarEtiqueta(e) {
    const nombre = el('input', { value: e?.nombre || '' });
    const color = el('input', { type: 'color', value: e?.color || '#6366f1' });
    const ambito = selector(AMBITOS, e?.ambito || 'tareas');
    const botones = [];
    if (e) botones.push({ texto: 'A la papelera', tipo: 'peligro', accion: async () => { await store.papelera('etiquetas', e.id); toast('Etiqueta a la papelera', 'ok', { accion: () => store.restaurar('etiquetas', e.id).catch(error) }); } });
    botones.push({ texto: 'Cancelar' }, { texto: 'GUARDAR', tipo: 'primario', accion: async () => {
      if (!nombre.value.trim()) { toast('Pon un nombre.', 'err'); return false; }
      const datos = { nombre: nombre.value.trim(), color: color.value, ambito: ambito.value };
      if (e) await store.actualizar('etiquetas', { id: e.id }, datos); else await store.insertar('etiquetas', datos);
    } });
    modal({ titulo: e ? 'EDITAR ETIQUETA' : 'NUEVA ETIQUETA', ancho: 420, botones, cuerpo: el('div', {}, campo('Nombre', nombre), el('div', { class: 'fila-campos' }, campo('Campo', ambito), campo('Color', color))) });
  }

  function pintarSimbolos() {
    const ss = store.filas('simbolos').sort((a, b) => a.simbolo.localeCompare(b.simbolo));
    const VER = { ok: ['comprobado en MT5', 'verde'], pendiente: ['sin comprobar', 'ambar'], no_existe: ['NO existe en MT5', 'rojo'] };
    reemplazar(simbolos, el('div', { class: 'card' },
      ss.length ? el('div', { class: 'tabla-scroll' }, el('table', { class: 'tabla' },
        el('thead', {}, el('tr', {}, ['Símbolo MT5', 'Nombre', 'Mercado', 'Decimales', 'Estado', ''].map(c => el('th', {}, c)))),
        el('tbody', {}, ss.map(s => el('tr', { class: s.activo ? '' : 'apagada' },
          el('td', { class: 'mono' }, s.simbolo), el('td', {}, s.nombre || '—'), el('td', {}, s.mercado || '—'), el('td', {}, s.digitos ?? '—'),
          el('td', { class: VER[s.verificado]?.[1] }, VER[s.verificado]?.[0] || s.verificado),
          el('td', {}, el('button', { class: 'btn btn-peq', onclick: async () => {
            try { await store.actualizar('simbolos', { simbolo: s.simbolo }, { activo: !s.activo }); } catch (e) { error(e); }
          } }, s.activo ? 'Ocultar' : 'Mostrar'))))))) : el('div', { class: 'card-sub' }, 'Sin símbolos.'),
      el('button', { class: 'add-st-btn', onclick: () => nuevoSimbolo(store) }, '+ Añadir símbolo'),
      el('div', { class: 'card-sub', style: { marginTop: '8px' } }, 'El agente comprueba en MT5 cada símbolo nuevo y rellena sus decimales.')));
  }

  function pintarPapelera() {
    const items = PAPELERA.flatMap(([tabla, tipo, texto]) => store.filas(tabla, f => f.borrado_en).map(f => ({ tabla, tipo, texto: texto(f), f })))
      .sort((a, b) => b.f.borrado_en.localeCompare(a.f.borrado_en)).slice(0, 60);
    reemplazar(papelera, items.length ? el('div', { class: 'card' }, el('div', { class: 'st-list' }, items.map(i => el('div', { class: 'st-item' },
      chip(i.tipo, '#6b6b8a'), el('span', { class: 'st-txt' }, i.texto), el('span', { class: 'card-sub' }, F.fmtDiaHora(i.f.borrado_en)),
      // setups y comentarios: solo los restaura quien los hizo
      ['setups', 'comentarios'].includes(i.tabla) && i.f.autor !== store.usuarioId()
        ? el('span', { class: 'card-sub' }, `de ${store.perfil(i.f.autor)?.nombre || 'tu compañero'}`)
        : el('button', { class: 'btn btn-peq', onclick: () => store.restaurar(i.tabla, i.f.id).then(() => toast('Restaurado')).catch(error) }, 'RESTAURAR'))))) : vacio('La papelera está vacía.'));
  }

  function pintar(ts) {
    if (!ts || ts.has('perfiles')) pintarPerfil();
    pintarAgente(); pintarEtiquetas(); pintarSimbolos(); pintarPapelera();
  }
  const quitar = store.on(['perfiles', 'agente_estado', 'etiquetas', 'simbolos', 'grupos', 'tareas', 'anotaciones', 'setups', 'herramientas', 'comentarios'], pintar);
  const reloj = setInterval(pintarAgente, 30000);
  pintar();
  return () => { quitar(); clearInterval(reloj); };
}
