// Motor de muelles de la v2 «Fluido»: física real (se puede interrumpir a media animación) y la misma
// física horneada como curva CSS linear() en --muelle / --muelle-d para las transiciones.

export const QUIETO = matchMedia('(prefers-reduced-motion: reduce)').matches;

const activos = new Set();
let corriendo = false;
let tAnt = 0;
function bucle(t) {
  let dt = (t - tAnt) / 1000;
  if (!(dt > 0)) dt = 1 / 60;
  dt = Math.min(dt, 0.034);
  tAnt = t;
  for (const m of activos) m.paso(dt);
  if (activos.size) requestAnimationFrame(bucle); else corriendo = false;
}

/** Para un muelle en seco (un dedo lo agarra a media animación: la rueda de la hora, la hoja del día). */
export function detener(m) { activos.delete(m); }

export class Muelle {
  constructor(x, fn, { k = 260, c = 24, eps = 0.01, fin = null } = {}) { Object.assign(this, { x, v: 0, obj: x, fn, k, c, eps, fin }); }
  a(obj, op = {}) {
    Object.assign(this, op);
    this.obj = obj;
    if (QUIETO) { this.x = obj; this.v = 0; this.fn(obj, 0); this.fin?.(); return this; }
    activos.add(this);
    if (!corriendo) { corriendo = true; tAnt = performance.now(); requestAnimationFrame(bucle); }
    return this;
  }
  paso(dt) {
    const n = 4;
    const h = dt / n;
    for (let i = 0; i < n; i++) { const f = -this.k * (this.x - this.obj) - this.c * this.v; this.v += f * h; this.x += this.v * h; }
    if (Math.abs(this.v) < this.eps && Math.abs(this.x - this.obj) < this.eps) {
      this.x = this.obj; this.v = 0; activos.delete(this); this.fn(this.x, 0); this.fin?.(); return;
    }
    this.fn(this.x, this.v);
  }
}

(function hornear() {
  if (!CSS.supports('transition-timing-function', 'linear(0, 1)')) return;
  let x = 0, v = 0, t = 0;
  const p = [0];
  const dt = 1 / 120;
  while (t < 2) {
    for (let i = 0; i < 2; i++) { const f = -230 * (x - 1) - 21 * v; v += (f * dt) / 2; x += (v * dt) / 2; }
    t += dt;
    p.push(+x.toFixed(4));
    if (Math.abs(v) < 0.002 && Math.abs(x - 1) < 0.002) break;
  }
  const paso = Math.max(1, Math.floor(p.length / 50));
  const s = p.filter((_, i) => i % paso === 0);
  s.push(1);
  document.documentElement.style.setProperty('--muelle', `linear(${s.join(',')})`);
  document.documentElement.style.setProperty('--muelle-d', `${Math.round(t * 1000)}ms`);
})();

export const EASE = () => getComputedStyle(document.documentElement).getPropertyValue('--muelle').trim() || 'cubic-bezier(.3,1.4,.5,1)';
export const DUR = () => parseInt(getComputedStyle(document.documentElement).getPropertyValue('--muelle-d'), 10) || 500;
// lo que mide la barra del sistema por arriba (iPhone con la agenda abierta desde el icono: la página va por debajo de la hora);
// 0 en el PC. Se mide con una sonda de altura var(--sa-t) (= env(safe-area-inset-top), ver fluido.css)
let sondaSA = null;
export function zonaArriba() {
  if (!sondaSA?.isConnected) {
    sondaSA = document.createElement('div');
    sondaSA.style.cssText = 'position:fixed;top:0;left:0;width:0;height:var(--sa-t,0px);visibility:hidden;pointer-events:none';
    document.body.append(sondaSA);
  }
  return sondaSA.offsetHeight || 0;
}

/** Número que rueda con muelle hasta su valor nuevo. */
export function rodar(nodo, a, sufijo = '') {
  if (!nodo) return;
  const m = nodo._m || (nodo._m = new Muelle(parseFloat(nodo.textContent) || 0, x => { nodo.textContent = Math.round(x) + sufijo; }, { k: 120, c: 16, eps: 0.05 }));
  m.a(a);
}

/** Abre/cierra una caja con altura natural, con muelle. */
export function plegar(caja, abrir) {
  const desde = caja.getBoundingClientRect().height;
  caja.style.height = 'auto';
  const hasta = abrir ? caja.scrollHeight : 0;
  caja.style.height = `${desde}px`;
  const m = caja._m || (caja._m = new Muelle(desde, x => { caja.style.height = `${Math.max(0, x)}px`; }, { k: 240, c: 24, eps: 0.3 }));
  m.x = desde;
  m.a(hasta, { fin: () => { if (abrir) caja.style.height = 'auto'; } });
}

/** Entrada escalonada de filas. */
export function entrada(nodos, { dy = 14, paso = 28 } = {}) {
  if (QUIETO) return;
  [...nodos].forEach((n, i) => n.animate(
    [{ opacity: 0, transform: `translateY(${dy}px)` }, { opacity: 1, transform: 'none' }],
    { duration: 520, delay: Math.min(i, 14) * paso, easing: EASE(), fill: 'backwards' }));
}

/** Brillo que sigue al ratón en las tarjetas (delegado: vale para las que se creen después). */
export function brilloTarjetas(raiz) {
  raiz.addEventListener('pointermove', ev => {
    const c = ev.target.closest?.('.card');
    if (!c) return;
    const r = c.getBoundingClientRect();
    c.style.setProperty('--mx', `${ev.clientX - r.left}px`);
    c.style.setProperty('--my', `${ev.clientY - r.top}px`);
  });
}
