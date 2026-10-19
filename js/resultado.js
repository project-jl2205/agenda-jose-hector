// Resultado de un setup: lo marcáis vosotros (Jose Luis o Héctor). El agente de MT5 solo hace fotos;
// nada de lo que escribe en setup_estado decide el estado ni cuenta para el winrate.

export const RESULTADOS = {
  ganado: ['GANADO', 'verde'], perdido: ['PERDIDO', 'rojo'], breakeven: ['BREAKEVEN', 'ambar'], no_activado: ['NO ACTIVADO', 'gris'],
  cerrado_antes: ['CERRADO ANTES', 'azul'], parciales: ['PARCIALES', 'azul'],
};

/** R de salir a un precio concreto (positivo a favor, negativo en contra). */
export function rDePrecio(s, precio) {
  const riesgo = Math.abs(s.entrada - s.sl);
  if (!riesgo || precio === null || precio === undefined || precio === '' || Number.isNaN(+precio)) return null;
  return (s.direccion === 'largo' ? +precio - s.entrada : s.entrada - +precio) / riesgo;
}

/** R de varias salidas parciales [{ precio, pct }]: media ponderada por el % de la posición. */
export function rDeSalidas(s, salidas) {
  if (!salidas?.length) return null;
  let total = 0;
  for (const x of salidas) {
    const r = rDePrecio(s, x.precio);
    if (r === null) return null;
    total += (r * +x.pct) / 100;
  }
  return total;
}

const porSigno = ['cerrado_antes', 'parciales'];

/** Nivel del TP n (1 = «tp», 2… = «tps»). */
export const nivelTp = (s, n) => (n > 1 ? (s.tps || [])[n - 2] : s.tp);

/** Estado que se enseña: anulado, el resultado marcado, pendiente (antes de la hora) o por cerrar. */
export function estadoSetup(s) {
  if (s.anulado_en) return { clave: 'anulado', texto: 'ANULADO', color: 'gris' };
  if (s.resultado) {
    let [texto, color] = RESULTADOS[s.resultado] || [String(s.resultado).toUpperCase(), 'gris'];
    if (porSigno.includes(s.resultado)) { const r = rConseguido(s) ?? 0; color = r > 0 ? 'verde' : r < 0 ? 'rojo' : 'ambar'; }
    const conTp = s.resultado === 'ganado' && (s.tps || []).length;
    return { clave: s.resultado, texto: conTp ? `${texto} · TP${s.resultado_tp || 1}` : texto, color };
  }
  if (new Date(s.t0) > new Date()) return { clave: 'pendiente', texto: 'PENDIENTE', color: 'gris' };
  return { clave: 'por_cerrar', texto: 'POR CERRAR', color: 'azul' };
}

/** R conseguidas: ganado = distancia al TP alcanzado / riesgo; perdido = −1; breakeven = 0; si no, null. */
export function rConseguido(s) {
  const riesgo = Math.abs(s.entrada - s.sl);
  if (s.anulado_en || !riesgo) return null;
  if (s.resultado === 'ganado') return Math.abs(nivelTp(s, s.resultado_tp || 1) - s.entrada) / riesgo;
  if (s.resultado === 'perdido') return -1;
  if (s.resultado === 'breakeven') return 0;
  if (s.resultado === 'cerrado_antes') return rDePrecio(s, s.resultado_precio);
  if (s.resultado === 'parciales') return rDeSalidas(s, s.resultado_salidas);
  return null;
}

/** Para el winrate: un cierre anticipado o con parciales cuenta como ganado, perdido o breakeven según el signo de sus R. */
export function resultadoEfectivo(s) {
  if (s.anulado_en || !s.resultado) return null;
  if (!porSigno.includes(s.resultado)) return s.resultado;
  const r = rConseguido(s);
  if (r === null) return null;
  return r > 0 ? 'ganado' : r < 0 ? 'perdido' : 'breakeven';
}
