// Paridad de js/recurrencia.js con dateutil (rrule_casos.json, generado por generar_casos_rrule.py).
import fs from 'fs';
import { ocurrencias } from '../js/recurrencia.js';
const casos = JSON.parse(fs.readFileSync(new URL('./rrule_casos.json', import.meta.url), 'utf8'));
let fallos = 0;
for (const c of casos) {
  const obtenido = ocurrencias({ tipo: 'periodica', fecha: c.fecha, rrule: c.rrule, hasta: c.hasta }, c.desde, c.fin);
  const ok = JSON.stringify(obtenido) === JSON.stringify(c.esperado);
  if (!ok) { fallos++; console.log(`FALLO ${c.rrule} desde ${c.fecha}\n  esperado ${c.esperado.join(',')}\n  obtenido ${obtenido.join(',')}`); }
}
console.log(`${casos.length - fallos}/${casos.length} casos iguales que dateutil`);
process.exit(fallos ? 1 : 0);
