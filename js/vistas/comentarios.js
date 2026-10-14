// Hilo de comentarios de los dos (sobre un setup, una anotación o una tarea). Se actualiza en vivo.

import { el, avatar, error, reemplazar, confirmar, toast } from '../ui.js';

export function hiloComentarios(caja, ctx, entidad, entidadId) {
  const { store, F } = ctx;
  const lista = el('div', { class: 'hilo' });
  const texto = el('textarea', { rows: 2, class: 'entrada', placeholder: 'Escribe un comentario… (Ctrl+Enter envía)' });
  const enviar = async () => {
    const t = texto.value.trim();
    if (!t) return;
    texto.value = '';
    try {
      await store.insertar('comentarios', { entidad, entidad_id: entidadId, texto: t, autor: store.usuarioId(), creado_en: new Date().toISOString() });
    } catch (e) { texto.value = t; error(e); }
  };
  texto.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); enviar(); } });
  caja.append(el('div', { class: 'card hilo-card' }, lista,
    el('div', { class: 'hilo-nuevo' }, texto, el('button', { class: 'btn btn-primario', onclick: enviar }, 'ENVIAR'))));

  function pintar() {
    const cs = store.comentarios(entidad, entidadId);
    reemplazar(lista, cs.length ? cs.map(c => {
      const autor = store.perfil(c.autor);
      const mio = c.autor === store.usuarioId();
      return el('div', { class: `comentario ${mio ? 'mio' : ''}` },
        avatar(autor, 26),
        el('div', { class: 'comentario-cuerpo' },
          el('div', { class: 'comentario-cab' },
            el('b', {}, autor?.nombre || '¿?'),
            el('span', { class: 'card-sub' }, c.creado_en ? F.fmtDiaHora(c.creado_en) : 'ahora'),
            c.editado_en && el('span', { class: 'card-sub' }, '(editado)'),
            mio && el('button', { class: 'enlace peq', onclick: async () => {
              if (!await confirmar('¿Borrar este comentario?', { si: 'Borrar', peligro: true })) return;
              try { await store.papelera('comentarios', c.id); toast('Comentario borrado', 'ok', { accion: () => store.restaurar('comentarios', c.id).catch(error) }); }
              catch (e) { error(e); }
            } }, 'borrar')),
          el('div', { class: 'comentario-texto' }, c.texto)));
    }) : el('div', { class: 'card-sub' }, 'Sin comentarios todavía.'));
  }
  const quitar = store.on(['comentarios', 'perfiles'], pintar);
  pintar();
  return quitar;
}
