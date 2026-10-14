// WINRATE — por símbolo, sin opinión: winrate final (TP/SL) y de validación (tiempo o condiciones),
// con n, intervalo de confianza 95 % de Wilson, últimos 10/20 y lo que no cuenta aparte.
// No se colorea contra el 50 %: con R:R ≠ 1 el equilibrio no es el 50 %.

import { el, selector, reemplazar, vacio, numero } from '../ui.js';

const TFS = ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w'];

/** Intervalo de Wilson al 95 % → [bajo, alto] en %. */
export function wilson(k, n) {
  if (!n) return null;
  const z = 1.96;
  const p = k / n;
  const d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d;
  const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.max(0, (c - h) * 100), Math.min(100, (c + h) * 100)];
}

export function montar(cont, ctx) {
  const { store, F } = ctx;
  ctx.titulo('Winrate por símbolo');
  const f = { autor: '', tf: '', modo: '', etiqueta: '', desde: '', hasta: '' };
  const filtros = el('div', { class: 'filtros' });
  const tarjetas = el('div', { class: 'g4' });
  const tabla = el('div', { class: 'card tabla-card' });
  const lienzo = el('canvas');
  cont.append(
    el('div', { class: 'sec' }, el('span', {}, 'Winrate')), filtros, tarjetas,
    el('div', { class: 'sec' }, el('span', {}, 'Por símbolo')), tabla,
    el('div', { class: 'sec' }, el('span', {}, 'Evolución del winrate final (acumulado)')),
    el('div', { class: 'card' }, el('div', { class: 'chart-wrap alto' }, lienzo)),
    el('div', { class: 'card-sub', style: { marginTop: '10px' } },
      'Winrate final = ganados / (ganados + perdidos). Winrate de validación = válidos / (válidos + fallos), donde «fallo» incluye el fallo en temporalidad. ',
      'No cuentan: no activados, anulados, abiertos ni sin datos. IC 95 % de Wilson: con pocos setups el margen es grande.'));
  let grafico = null;

  function filtrados() {
    const desde = f.desde ? F.madridAInstante(f.desde, '00:00').getTime() : -Infinity;
    const hasta = f.hasta ? F.madridAInstante(F.sumarDias(f.hasta, 1), '00:00').getTime() : Infinity;
    return store.vivas('setups', s => !s.anulado_en).filter(s => {
      const t = new Date(s.t0).getTime();
      return (!f.autor || s.autor === f.autor) && (!f.tf || s.temporalidad === f.tf) && (!f.modo || s.modo === f.modo)
        && (!f.etiqueta || (s.etiquetas || []).includes(f.etiqueta)) && t >= desde && t < hasta;
    }).map(s => ({ s, e: store.fila('setup_estado', s.id) || {} }));
  }

  function estadisticas(filas) {
    const res = filas.filter(x => x.e.resultado).sort((a, b) => (a.e.resultado_en || '').localeCompare(b.e.resultado_en || ''));
    const g = res.filter(x => x.e.resultado === 'ganado').length;
    const val = filas.filter(x => ['valido', 'fallo'].includes(x.e.validacion));
    const v = val.filter(x => x.e.validacion === 'valido').length;
    const ultimos = n => { const u = res.slice(-n); return u.length ? [u.filter(x => x.e.resultado === 'ganado').length, u.length] : null; };
    return {
      n: filas.length, g, p: res.length - g, resueltos: res.length,
      v, fallos: val.length - v, validados: val.length,
      temporalidad: filas.filter(x => x.e.validacion === 'fallo' && /temporalidad/i.test(x.e.validacion_motivo || '')).length,
      noAct: filas.filter(x => x.e.estado === 'no_activado').length,
      abiertos: filas.filter(x => ['pendiente', 'esperando', 'en_curso'].includes(x.e.estado || 'pendiente')).length,
      sinDatos: filas.filter(x => x.e.estado === 'sin_datos').length,
      ambiguos: filas.filter(x => x.e.ambiguo).length,
      u10: ultimos(10), u20: ultimos(20),
    };
  }

  const porc = (k, n) => (n ? `${numero((k / n) * 100, 1)}%` : '—');
  const ic = (k, n) => { const w = wilson(k, n); return w ? `${numero(w[0], 0)}–${numero(w[1], 0)}%` : ''; };

  function pintarFiltros() {
    const sel = (k, ops) => selector(ops, f[k], { class: 'entrada', onchange: e => { f[k] = e.target.value; pintar(); } });
    const fecha = k => el('input', { type: 'date', class: 'entrada', value: f[k], onchange: e => { f[k] = e.target.value; pintar(); } });
    reemplazar(filtros,
      sel('autor', [['', 'Los dos'], ...store.perfiles().map(p => [p.id, p.nombre])]),
      sel('tf', [['', 'Toda temporalidad'], ...TFS]),
      sel('modo', [['', 'Tiempo y condiciones'], ['tiempo', 'Por tiempo'], ['condiciones', 'Por condiciones']]),
      sel('etiqueta', [['', 'Toda etiqueta'], ...store.etiquetas('setups').map(e => [e.id, e.nombre])]),
      el('label', { class: 'filtro-fecha' }, 'desde ', fecha('desde')),
      el('label', { class: 'filtro-fecha' }, 'hasta ', fecha('hasta')));
  }

  function pintar() {
    pintarFiltros();
    const filas = filtrados();
    const t = estadisticas(filas);
    const tarjeta = (clase, lbl, val, sub) => el('div', { class: `card accent ${clase}` }, el('div', { class: 'card-lbl' }, lbl), el('div', { class: 'card-val' }, val), el('div', { class: 'card-sub' }, sub));
    reemplazar(tarjetas,
      tarjeta('ac-g', 'Winrate final', porc(t.g, t.resueltos), `${t.g} ganados · ${t.p} perdidos · IC ${ic(t.g, t.resueltos) || '—'}`),
      tarjeta('ac-i', 'Winrate de validación', porc(t.v, t.validados), `${t.v} válidos · ${t.fallos} fallos (${t.temporalidad} en temporalidad)`),
      tarjeta('ac-o', 'Últimos 10 / 20', `${t.u10 ? porc(...t.u10) : '—'} / ${t.u20 ? porc(...t.u20) : '—'}`, 'winrate final de los más recientes'),
      tarjeta('ac-p', 'Setups', String(t.n), `${t.abiertos} abiertos · ${t.noAct} no activados${t.sinDatos ? ` · ${t.sinDatos} sin datos` : ''}`));

    const simbolos = [...new Set(filas.map(x => x.s.simbolo))].sort();
    if (!simbolos.length) { reemplazar(tabla, vacio('Todavía no hay setups con estos filtros.')); pintarGrafico([]); return; }
    const cab = ['Símbolo', 'n', 'Ganados', 'Perdidos', 'Winrate final', 'IC 95 %', 'Últ. 10', 'Últ. 20', 'Válidos', 'Fallos', 'Winrate valid.', 'En temp.', 'No activ.', 'Abiertos', 'Ambiguos'];
    const fila = (nombre, st, total = false) => el('tr', { class: total ? 'total' : '' },
      el('td', { class: 'sim' }, nombre), el('td', {}, String(st.n)), el('td', { class: 'verde' }, String(st.g)), el('td', { class: 'rojo' }, String(st.p)),
      el('td', { class: 'fuerte' }, porc(st.g, st.resueltos)), el('td', { class: 'muted' }, ic(st.g, st.resueltos)),
      el('td', {}, st.u10 ? porc(...st.u10) : '—'), el('td', {}, st.u20 ? porc(...st.u20) : '—'),
      el('td', {}, String(st.v)), el('td', {}, String(st.fallos)), el('td', { class: 'fuerte' }, porc(st.v, st.validados)),
      el('td', {}, String(st.temporalidad)), el('td', { class: 'muted' }, String(st.noAct)), el('td', { class: 'muted' }, String(st.abiertos)), el('td', { class: 'muted' }, String(st.ambiguos)));
    reemplazar(tabla, el('div', { class: 'tabla-scroll' }, el('table', { class: 'tabla mono' },
      el('thead', {}, el('tr', {}, cab.map(c => el('th', {}, c)))),
      el('tbody', {}, ...simbolos.map(sim => fila(store.fila('simbolos', sim)?.nombre || sim, estadisticas(filas.filter(x => x.s.simbolo === sim)))),
        simbolos.length > 1 ? fila('TODOS', t, true) : null))));
    pintarGrafico(filas, simbolos);
  }

  function pintarGrafico(filas, simbolos = []) {
    if (typeof Chart === 'undefined') return;
    const COLORES = ['#10b981', '#6366f1', '#f59e0b', '#ec4899', '#3b82f6', '#f97316', '#ef4444'];
    const serie = (lista) => {
      let g = 0, n = 0;
      return lista.filter(x => x.e.resultado).sort((a, b) => a.e.resultado_en.localeCompare(b.e.resultado_en)).map(x => {
        n += 1; if (x.e.resultado === 'ganado') g += 1;
        return { x: new Date(x.e.resultado_en).getTime(), y: Math.round((g / n) * 1000) / 10 };
      });
    };
    const top = simbolos.map(s => [s, filas.filter(x => x.s.simbolo === s && x.e.resultado).length]).sort((a, b) => b[1] - a[1]).slice(0, 6).filter(x => x[1] > 0);
    const datasets = [
      { label: 'Todos', data: serie(filas), borderColor: '#e2e2f0', backgroundColor: '#e2e2f0', borderWidth: 2, pointRadius: 2, tension: 0.2 },
      ...top.map(([s], i) => ({ label: store.fila('simbolos', s)?.nombre || s, data: serie(filas.filter(x => x.s.simbolo === s)), borderColor: COLORES[i % COLORES.length], backgroundColor: COLORES[i % COLORES.length], borderWidth: 1.5, pointRadius: 2, tension: 0.2 })),
    ];
    const etiquetaX = v => F.fmtDia(v);
    if (!grafico) {
      grafico = new Chart(lienzo, { type: 'line', data: { datasets }, options: {
        responsive: true, maintainAspectRatio: false, parsing: false,
        scales: {
          x: { type: 'linear', ticks: { color: '#6b6b8a', font: { size: 10 }, callback: etiquetaX, maxTicksLimit: 8 }, grid: { color: '#1a1a26' } },
          y: { min: 0, max: 100, ticks: { color: '#6b6b8a', font: { size: 10 }, callback: v => `${v}%` }, grid: { color: '#1a1a26' } },
        },
        plugins: { legend: { labels: { color: '#e2e2f0', font: { size: 11 }, boxWidth: 10 } },
          tooltip: { backgroundColor: '#1a1a26', borderColor: '#2a2a3d', borderWidth: 1, titleColor: '#e2e2f0', bodyColor: '#e2e2f0',
            callbacks: { title: c => F.fmtDiaHora(c[0].parsed.x), label: c => ` ${c.dataset.label}: ${c.parsed.y}%` } } },
      } });
    } else { grafico.data.datasets = datasets; grafico.update(); }
  }

  const quitar = store.on(['setups', 'setup_estado', 'simbolos', 'etiquetas', 'perfiles'], pintar);
  pintar();
  return () => { quitar(); grafico?.destroy(); };
}
