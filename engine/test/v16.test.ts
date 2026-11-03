import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine, levelOf } from '../src/engine/engine.ts';

const ROOMS = ['cocina', 'bano', 'habitacion', 'living', 'oficina', 'patio'];
const sum = (r: any, cat: string, kind: string) => r.events.filter((x: any) => x.cat === cat && x.kind === kind).reduce((a: number, x: any) => a + x.amount, 0);
const cost = (e: Engine) => e.cfg.A * Math.pow(e.cfg.r, levelOf(e.state.xp, e.cfg.A, e.cfg.r) - 1);

test('v1.6: la semanal no paga nada durante la semana; el domingo paga el 8 % del costo del piso si se cumplió', () => {
  const e = new Engine();
  for (let d = 0; d < 6; d++) assert.equal(sum(e.processDay(d < 3 ? { gym: true } : {}), 'F', 'W'), 0, `día ${d}: nada`);
  const c = cost(e); assert.ok(Math.abs(sum(e.processDay({}), 'F', 'W') - 0.08 * c) < 1e-6, 'domingo: 8 % del piso');
  const f = new Engine(); let w = 0; for (let d = 0; d < 7; d++) w += sum(f.processDay(d < 2 ? { gym: true } : {}), 'F', 'W');
  assert.equal(w, 0, 'con 2 de 3 sesiones no se paga nada');
});

test('v1.6: la mensual paga el 6 % del piso el lunes siguiente al cierre del mes; con 15 de 16 sesiones no paga nada', () => {
  const run = (sessions: number) => {
    const e = new Engine(); let done = 0, before = 0, monday = 0, c = 0;
    for (let d = 0; d < 28; d++) { const act = d % 7 < 5 && done < sessions; if (act) done++; before += sum(e.processDay(act ? { gym: true } : {}), 'F', 'M'); }
    c = cost(e); monday = sum(e.processDay({}), 'F', 'M');
    return { before, monday, c };
  };
  const a = run(16); assert.equal(a.before, 0, 'nada antes del cierre'); assert.ok(Math.abs(a.monday - 0.06 * a.c) < 1e-6, 'el lunes: 6 % del piso');
  assert.equal(run(15).monday, 0, '15 de 16: nada');
});

/** Ganancia del día / costo del piso siguiente al actual: si siempre es < 1, es imposible subir 2 pisos en un día. */
function worstRatio(pat: (d: number, e: Engine) => any, days: number) {
  const e = new Engine({ dayFloorCap: 0 }); let lv = 1, worst = 0;
  for (let d = 0; d < days; d++) { const x0 = e.state.xp; e.processDay(pat(d, e)); const g = e.state.xp - x0;
    if (lv < 100) worst = Math.max(worst, g / (e.cfg.A * Math.pow(e.cfg.r, lv))); lv = levelOf(e.state.xp, e.cfg.A, e.cfg.r); }
  return worst;
}

test('v1.6: el primer mes, jugado de cualquier forma, nunca permite subir 2 pisos en un día (sin el tope de pantalla)', () => {
  let worst = 0;
  for (let mask = 0; mask < 128; mask++) for (const bk of [-1, 0, 4, 13, 20, 27]) for (const all of [false, true]) {
    let k = 0;
    worst = Math.max(worst, worstRatio((d) => { const dd = d % 7, a = !!(mask & (1 << dd)); if (dd === 0) k = 0;
      return { gym: a, read: a, aero: a, rooms: a ? (all ? ROOMS.slice(0, 5) : [ROOMS[k++ % 6]]) : [], food: a, gameH: a ? 1 : 0, book: d === bk, repair: d === bk }; }, 36));
  }
  assert.ok(worst < 1, `peor día del primer mes: ${worst.toFixed(3)} del piso siguiente`);
});

test('v1.6: en todo el año (perfecto, mínimo indispensable, faltas compensadas el domingo) nunca se suben 2 pisos en un día', () => {
  const pats: Record<string, (dd: number, n: number, of: number) => any> = {
    perfecto: (dd, n, of) => { const a = dd < 5; return { gym: a, read: a, aero: a, rooms: a ? [ROOMS[dd]] : [], food: a, book: n === of && dd === 4, repair: n === of && dd === 4 }; },
    minimo: (dd, n, of) => ({ gym: dd < 4, aero: dd < 3, read: dd < 3, rooms: dd === 0 ? ROOMS.slice(0, 5) : [], book: n === of && dd === 0, repair: n === of && dd === 0 }),
    domingo: (dd, n, of) => { const a = dd < 4 || dd === 6; return { gym: a, read: a, aero: a, rooms: a ? [ROOMS[dd % 6]] : [], food: a, book: n === of && dd === 3, repair: n === of && dd === 3 }; },
  };
  for (const [name, f] of Object.entries(pats)) { const w = worstRatio((d, e) => { const wi = e.weekInfo(d); return f(d % 7, wi.n, wi.of); }, 460); assert.ok(w < 1, `${name}: ${w.toFixed(3)}`); }
});

test('v1.6: el año perfecto abre el piso 100 el 28-dic-2027 (día 421) sin XP perdido ni bloqueos', () => {
  const e = new Engine();
  for (let d = 0; d < 900 && e.state.tower === null; d++) {
    const dd = d % 7, wi = e.weekInfo(d), a = dd < 5, m = wi.n === wi.of && dd === 4;
    e.processDay({ gym: a, read: a, aero: a, rooms: a ? [ROOMS[dd]] : [], food: a, book: m, repair: m });
  }
  assert.equal(e.state.tower, 421); assert.equal(e.state.lostClamp + e.state.lostBlock, 0); assert.equal(e.state.blocks.length, 0);
});
