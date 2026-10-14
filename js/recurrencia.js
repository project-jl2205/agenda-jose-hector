// Repeticiones de tareas: subconjunto de RRULE (RFC 5545) SIN DTSTART, con la misma semántica que
// dateutil.rrule en Python (la CLI y el agente usan dateutil; hay test de paridad en tests/).
//   FREQ=DAILY|WEEKLY|MONTHLY ; INTERVAL=n ; UNTIL=AAAAMMDD
//   BYDAY=MO,TU…   (DAILY: filtra días; WEEKLY: días de la semana; MONTHLY: todos esos días del mes)
//   BYDAY=1FR,-1MO (MONTHLY: n-ésimo día de la semana del mes; negativo = desde el final)
//   BYMONTHDAY=15,-1 (MONTHLY)
// DTSTART = tarea.fecha. El fin es el menor de tarea.hasta, UNTIL y el rango pedido.
// Semana empezando en lunes (WKST=MO, como dateutil por defecto).

import { sumarDias, diaSemana, diferenciaDias, diasDelMes } from './fechas.js';

const DIAS = { MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6, SU: 7 };
const SIGLAS = ['', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
const dos = n => String(n).padStart(2, '0');

export function parsear(rrule) {
  const r = { freq: null, intervalo: 1, byday: [], bymonthday: [], until: null };
  for (const trozo of String(rrule || '').split(';')) {
    const [k, v] = trozo.split('=');
    if (!k || v === undefined) continue;
    const clave = k.trim().toUpperCase();
    const valor = v.trim().toUpperCase();
    if (clave === 'FREQ') r.freq = valor;
    else if (clave === 'INTERVAL') r.intervalo = Math.max(1, parseInt(valor, 10) || 1);
    else if (clave === 'BYDAY') {
      r.byday = valor.split(',').filter(Boolean).map(x => {
        const m = x.match(/^([+-]?\d+)?(MO|TU|WE|TH|FR|SA|SU)$/);
        return m ? { n: m[1] ? parseInt(m[1], 10) : null, dow: DIAS[m[2]] } : null;
      }).filter(Boolean);
    } else if (clave === 'BYMONTHDAY') {
      r.bymonthday = valor.split(',').map(x => parseInt(x, 10)).filter(n => n && Math.abs(n) <= 31);
    } else if (clave === 'UNTIL') {
      const m = valor.match(/^(\d{4})(\d{2})(\d{2})/);
      if (m) r.until = `${m[1]}-${m[2]}-${m[3]}`;
    }
  }
  return r;
}

const menor = (...xs) => xs.filter(Boolean).sort()[0] || null;
const mayor = (...xs) => xs.filter(Boolean).sort().slice(-1)[0] || null;

/** Días ('AAAA-MM-DD') en que ocurre la tarea dentro de [desde, hasta], ordenados. */
export function ocurrencias(tarea, desde, hasta) {
  if (!tarea) return [];
  if (!tarea.rrule || tarea.tipo === 'puntual') {
    return tarea.fecha && tarea.fecha >= desde && tarea.fecha <= hasta ? [tarea.fecha] : [];
  }
  const inicio = tarea.fecha;
  if (!inicio) return [];
  const r = parsear(tarea.rrule);
  const fin = menor(hasta, tarea.hasta, r.until);
  if (!fin || fin < inicio || fin < desde) return [];
  const desdeEf = mayor(inicio, desde);
  const salida = new Set();
  const dentro = d => d >= desdeEf && d <= fin;

  if (r.freq === 'DAILY') {
    const filtro = r.byday.length ? new Set(r.byday.map(b => b.dow)) : null;
    const salto = Math.max(0, Math.ceil(diferenciaDias(inicio, desdeEf) / r.intervalo));
    for (let d = sumarDias(inicio, salto * r.intervalo); d <= fin; d = sumarDias(d, r.intervalo)) {
      if (!filtro || filtro.has(diaSemana(d))) if (dentro(d)) salida.add(d);
    }
  } else if (r.freq === 'WEEKLY') {
    const dias = r.byday.length ? [...new Set(r.byday.map(b => b.dow))].sort() : [diaSemana(inicio)];
    const lunesInicio = sumarDias(inicio, 1 - diaSemana(inicio));
    const semanas = Math.max(0, Math.floor(diferenciaDias(lunesInicio, desdeEf) / 7));
    const k0 = Math.floor(semanas / r.intervalo) * r.intervalo;
    for (let lunes = sumarDias(lunesInicio, 7 * k0); lunes <= fin; lunes = sumarDias(lunes, 7 * r.intervalo)) {
      for (const dow of dias) {
        const d = sumarDias(lunes, dow - 1);
        if (d >= inicio && dentro(d)) salida.add(d);
      }
    }
  } else if (r.freq === 'MONTHLY') {
    const [yi, mi, di] = inicio.split('-').map(Number);
    const [yd, md] = desdeEf.split('-').map(Number);
    const meses = Math.max(0, (yd * 12 + md) - (yi * 12 + mi));
    let k = Math.floor(meses / r.intervalo) * r.intervalo;
    for (;; k += r.intervalo) {
      const total = (yi * 12 + (mi - 1)) + k;
      const y = Math.floor(total / 12);
      const m = (total % 12) + 1;
      const primero = `${y}-${dos(m)}-01`;
      if (primero > fin) break;
      for (const d of diasDelMesSegunRegla(r, y, m, di)) {
        if (d >= inicio && dentro(d)) salida.add(d);
      }
    }
  }
  return [...salida].sort();
}

function diasDelMesSegunRegla(r, y, m, diaInicio) {
  const n = diasDelMes(y, m);
  const fecha = d => `${y}-${dos(m)}-${dos(d)}`;
  const res = [];
  if (r.bymonthday.length) {
    for (const x of r.bymonthday) {
      const d = x > 0 ? x : n + x + 1;
      if (d >= 1 && d <= n) res.push(fecha(d));
    }
  }
  if (r.byday.length) {
    const dowDel1 = diaSemana(fecha(1));
    for (const { n: ord, dow } of r.byday) {
      const primero = 1 + ((dow - dowDel1 + 7) % 7);
      const todos = [];
      for (let d = primero; d <= n; d += 7) todos.push(d);
      if (ord === null) todos.forEach(d => res.push(fecha(d)));
      else {
        const d = ord > 0 ? todos[ord - 1] : todos[todos.length + ord];
        if (d) res.push(fecha(d));
      }
    }
  }
  if (!r.bymonthday.length && !r.byday.length && diaInicio <= n) res.push(fecha(diaInicio));
  return res;
}

/** ¿Ocurre la tarea ese día? */
export const ocurreEn = (tarea, dia) => ocurrencias(tarea, dia, dia).length > 0;

/** Clave de ocurrencia para tareas_hechas: el día si se repite, 1970-01-01 si es única. */
export const claveOcurrencia = (tarea, dia) => (tarea.rrule && tarea.tipo !== 'puntual' ? dia : '1970-01-01');

/**
 * Construye la RRULE desde el formulario.
 *  { freq: 'DAILY'|'WEEKLY'|'MONTHLY', intervalo, dias: [1..7], modoMes: 'dia'|'ordinal',
 *    diaMes: 1..31|-1, ordinal: 1..4|-1, diaOrdinal: 1..7 }
 */
export function construir({ freq, intervalo = 1, dias = [], modoMes = 'dia', diaMes, ordinal, diaOrdinal }) {
  const partes = [`FREQ=${freq}`];
  if (intervalo > 1) partes.push(`INTERVAL=${intervalo}`);
  if ((freq === 'WEEKLY' || freq === 'DAILY') && dias.length) {
    partes.push(`BYDAY=${[...dias].sort().map(d => SIGLAS[d]).join(',')}`);
  }
  if (freq === 'MONTHLY') {
    if (modoMes === 'ordinal' && ordinal && diaOrdinal) partes.push(`BYDAY=${ordinal}${SIGLAS[diaOrdinal]}`);
    else if (diaMes) partes.push(`BYMONTHDAY=${diaMes}`);
  }
  return partes.join(';');
}

const NOMBRE = ['', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
const CORTO = ['', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];
const ORDINAL = { 1: 'primer', 2: 'segundo', 3: 'tercer', 4: 'cuarto', 5: 'quinto', '-1': 'último', '-2': 'penúltimo' };

/** Texto en español: «De lunes a viernes», «Cada 2 semanas: lun, jue», «Cada mes el último lunes»… */
export function describir(rrule, fechaInicio) {
  if (!rrule) return 'No se repite';
  const r = parsear(rrule);
  const cada = (n, uno, varios) => (n === 1 ? `Cada ${uno}` : `Cada ${n} ${varios}`);
  const lista = r.byday.filter(b => b.n === null).map(b => b.dow).sort();
  const laborables = lista.join(',') === '1,2,3,4,5';
  if (r.freq === 'DAILY') {
    if (laborables && r.intervalo === 1) return 'De lunes a viernes';
    const base = cada(r.intervalo, 'día', 'días');
    return lista.length ? `${base}: ${lista.map(d => CORTO[d]).join(', ')}` : base;
  }
  if (r.freq === 'WEEKLY') {
    if (laborables && r.intervalo === 1) return 'De lunes a viernes';
    const dias = lista.length ? lista : (fechaInicio ? [diaSemana(fechaInicio)] : []);
    const base = cada(r.intervalo, 'semana', 'semanas');
    return dias.length ? `${base}: ${dias.map(d => CORTO[d]).join(', ')}` : base;
  }
  if (r.freq === 'MONTHLY') {
    const base = cada(r.intervalo, 'mes', 'meses');
    const ord = r.byday.find(b => b.n !== null);
    if (ord) return `${base} el ${ORDINAL[ord.n] || ord.n + 'º'} ${NOMBRE[ord.dow]}`;
    if (r.bymonthday.length) return `${base} el día ${r.bymonthday.map(d => (d === -1 ? 'último' : d)).join(', ')}`;
    return fechaInicio ? `${base} el día ${+fechaInicio.slice(8)}` : base;
  }
  return 'Repetición personalizada';
}
