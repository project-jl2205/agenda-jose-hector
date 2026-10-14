// Fechas y horas en Europe/Madrid.
// En la base de datos todo va en UTC (timestamptz); aquí se convierte para mostrarlo y para leer
// lo que se teclea, que SIEMPRE es hora de Madrid. Los días "puros" se manejan como 'AAAA-MM-DD'.

export const TZ = 'Europe/Madrid';

const dos = n => String(n).padStart(2, '0');

const fmtPartes = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

/** Año, mes, día, hora, minuto y segundo de pared en Madrid para un instante. */
export function partes(instante = new Date()) {
  const d = instante instanceof Date ? instante : new Date(instante);
  const p = {};
  for (const { type, value } of fmtPartes.formatToParts(d)) p[type] = value;
  return { y: +p.year, m: +p.month, d: +p.day, hh: +p.hour, mm: +p.minute, ss: +p.second };
}

/** 'AAAA-MM-DD' del día de Madrid en que cae un instante. */
export function diaDe(instante = new Date()) {
  const p = partes(instante);
  return `${p.y}-${dos(p.m)}-${dos(p.d)}`;
}
export const hoy = () => diaDe(new Date());

/** 'HH:MM' de pared en Madrid. */
export function horaDe(instante = new Date()) {
  const p = partes(instante);
  return `${dos(p.hh)}:${dos(p.mm)}`;
}

// ---- aritmética de días puros (sin zona) -------------------------------------------------------
const msDia = 86400000;
function aMs(dia) { const [y, m, d] = dia.split('-').map(Number); return Date.UTC(y, m - 1, d); }
function deMs(ms) { const d = new Date(ms); return `${d.getUTCFullYear()}-${dos(d.getUTCMonth() + 1)}-${dos(d.getUTCDate())}`; }

export const sumarDias = (dia, n) => deMs(aMs(dia) + n * msDia);
/** Días de a hasta b (b − a). */
export const diferenciaDias = (a, b) => Math.round((aMs(b) - aMs(a)) / msDia);
/** 1 = lunes … 7 = domingo. */
export function diaSemana(dia) { const w = new Date(aMs(dia)).getUTCDay(); return w === 0 ? 7 : w; }
export const diasDelMes = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();   // m: 1-12

// ---- semanas ISO ('2026-W42') -------------------------------------------------------------------
export function semanaISO(dia) {
  const jueves = aMs(dia) + (4 - diaSemana(dia)) * msDia;
  const y = new Date(jueves).getUTCFullYear();
  const n = Math.floor((jueves - Date.UTC(y, 0, 1)) / msDia / 7) + 1;
  return `${y}-W${dos(n)}`;
}
export function lunesDe(semana) {
  const [y, w] = semana.split('-W').map(Number);
  const ene4 = `${y}-01-04`;
  return sumarDias(sumarDias(ene4, 1 - diaSemana(ene4)), (w - 1) * 7);
}
export const diasDeSemana = semana => Array.from({ length: 7 }, (_, i) => sumarDias(lunesDe(semana), i));
export const semanaActual = () => semanaISO(hoy());
export const moverSemana = (semana, n) => semanaISO(sumarDias(lunesDe(semana), 7 * n));
export const numeroSemana = semana => +semana.split('-W')[1];

// ---- Madrid <-> instante UTC --------------------------------------------------------------------
function desfaseMs(instante) {
  const p = partes(instante);
  const comoUTC = Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm, p.ss);
  return comoUTC - Math.floor(instante.getTime() / 1000) * 1000;
}

/** Instante (Date) de una fecha y hora de pared de Madrid. Dos pasadas por el cambio de hora. */
export function madridAInstante(dia, hora = '00:00') {
  const [y, m, d] = dia.split('-').map(Number);
  const [hh, mi] = hora.split(':').map(Number);
  const pared = Date.UTC(y, m - 1, d, hh, mi);
  let t = pared - desfaseMs(new Date(pared));
  t = pared - desfaseMs(new Date(t));
  return new Date(t);
}

/** Para rellenar formularios: { dia: 'AAAA-MM-DD', hora: 'HH:MM' } en Madrid. */
export const instanteAMadrid = instante => ({ dia: diaDe(instante), hora: horaDe(instante) });

// ---- formatos en español ------------------------------------------------------------------------
const fH = new Intl.DateTimeFormat('es-ES', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const fD = new Intl.DateTimeFormat('es-ES', { timeZone: TZ, day: 'numeric', month: 'short' });
const fDL = new Intl.DateTimeFormat('es-ES', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' });
const fM = new Intl.DateTimeFormat('es-ES', { timeZone: TZ, month: 'long', year: 'numeric' });
const sinPunto = s => s.replace('.', '');
const mediodia = dia => new Date(aMs(dia) + 12 * 3600000);   // un día puro, sin riesgo de cambiar de día

export const fmtHora = ts => fH.format(new Date(ts));                       // 14:05
export const fmtDia = ts => sinPunto(fD.format(new Date(ts)));             // 13 oct
export const fmtDiaHora = ts => `${fmtDia(ts)} ${fmtHora(ts)}`;            // 13 oct 14:05
export const fmtDiaLargo = ts => fDL.format(new Date(ts));                  // lunes, 13 de octubre
export const fmtDiaStr = dia => fmtDia(mediodia(dia));
export const fmtDiaLargoStr = dia => fmtDiaLargo(mediodia(dia));
export const fmtMes = (y, m) => fM.format(new Date(Date.UTC(y, m - 1, 15)));  // octubre de 2026

export const NOMBRES_DIA = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];
export const NOMBRES_DIA_LARGO = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

export function rangoSemanaTexto(semana) {
  const d = diasDeSemana(semana);
  return `${fmtDiaStr(d[0])} – ${fmtDiaStr(d[6])}`;
}

/** «hace 20 s», «hace 3 min», «hace 2 h», «hace 4 días». */
export function fmtRelativo(ts) {
  const s = Math.max(0, Math.round((Date.now() - new Date(ts).getTime()) / 1000));
  if (s < 60) return `hace ${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 48) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} días`;
}

/** Minutos desde medianoche de una hora 'HH:MM[:SS]'. */
export const minutosDe = hora => { const [h, m] = String(hora).split(':').map(Number); return h * 60 + (m || 0); };
export const horaCorta = hora => (hora ? String(hora).slice(0, 5) : '');
export function sumarMinutosHora(hora, min) {
  const t = (minutosDe(hora) + min) % 1440;
  return `${dos(Math.floor(t / 60))}:${dos(t % 60)}`;
}
