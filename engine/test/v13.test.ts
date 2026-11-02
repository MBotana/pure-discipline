import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine, cumXp } from '../src/engine/engine.ts';
import type { DayInput } from '../src/engine/types.ts';

const ROOMS = ['cocina', 'bano', 'habitacion', 'living', 'oficina', 'patio'];

/** Juega con la configuración por defecto (v1.3). `miss(d)` devuelve true si ese día no se hace nada. */
function play(opts: { miss?: (d: number) => boolean; book?: (d: number, n: number, of: number) => boolean; days?: number } = {}) {
  const e = new Engine(); const floors: number[] = []; let multi = 0, prev = 1, k = 0;
  for (let d = 0; d < (opts.days ?? 900); d++) {
    const dd = d % 7, wi = e.weekInfo(d); if (dd === 0) k = 0;
    const mark = opts.book ? opts.book(d, wi.n, wi.of) : (wi.n === wi.of && dd === 6);
    const inp: DayInput = opts.miss?.(d) ? {} : { gym: true, read: true, aero: true, clean: true, room: ROOMS[k++ % 6], food: true, dweek: dd === 6, book: mark, repair: mark };
    const r = e.processDay(inp); if (r.floor - prev > 1) multi++; prev = r.floor; floors.push(r.floor);
    if (e.state.tower !== null) break;
  }
  return { e, floors, multi, first: (n: number) => floors.findIndex(f => f >= n) };
}

test('v1.3: año perfecto abre el piso 100 alrededor del 31-dic-2027 sin perder XP', () => {
  const { e, multi, first } = play();
  const tower = e.state.tower!;
  console.log('v1.3 perfecto: piso 10 día', first(10), '· 25 día', first(25), '· 50 día', first(50), '· 75 día', first(75), '· 100 día', tower);
  assert.ok(tower >= 410 && tower <= 430, `día de apertura ${tower}`);           // 31-dic-2027 = día 424
  assert.equal(e.state.lostClamp + e.state.lostBlock, 0, 'XP perdido');
  assert.equal(e.state.blocks.length, 0, 'ningún bloqueo');
  assert.equal(multi, 0, 'nunca más de un piso por día');
});

test('v1.3: curva exponencial, rápida al principio y lenta al final', () => {
  const { first } = play();
  const seg = [[1, 10], [10, 25], [25, 50], [50, 75], [75, 100]].map(([a, b]) => (first(b) - (a === 1 ? 0 : first(a))) / (b - a));
  for (let k = 1; k < seg.length; k++) assert.ok(seg[k] > seg[k - 1], `días por piso crecientes: ${seg.map(x => x.toFixed(1)).join(' / ')}`);
  assert.ok(seg[0] <= 1.5, 'los primeros pisos salen en poco más de un día');
  assert.ok(seg[4] >= 6 * seg[0], 'el último tramo es mucho más lento');
});

test('v1.3: el momento del mes en que se marca el libro y el arreglo no hace perder XP', () => {
  for (const pick of [(d: number, n: number) => n === 1 && d % 7 === 0, (d: number, n: number) => n === 2 && d % 7 === 2, (d: number, n: number) => n === 3 && d % 7 === 4]) {
    const { e } = play({ book: pick });
    assert.equal(e.state.lostClamp + e.state.lostBlock, 0);
    assert.ok(e.state.tower !== null && e.state.tower >= 405 && e.state.tower <= 430, `apertura ${e.state.tower}`);
  }
});

test('v1.3: jugar con faltas termina más tarde que el juego perfecto', () => {
  const perfect = play().e.state.tower!;
  const oneDay = play({ miss: d => d % 7 === 3 }).e.state.tower!;
  assert.ok(oneDay > perfect, `falla 1 día por semana: ${oneDay} vs ${perfect}`);
});

test('v1.3: el sobrante de un día que ya subió un piso se cobra al día siguiente (no se pierde)', () => {
  const e = new Engine();
  let paid = 0, deferred = 0;
  for (let d = 0; d < 60; d++) {
    const dd = d % 7; const r = e.processDay({ gym: true, read: true, aero: true, clean: true, room: ROOMS[dd % 6], food: true, dweek: dd === 6 });
    for (const x of r.events) { if (x.kind === 'C') continue; paid += x.paid; deferred += x.deferred ?? 0; }
  }
  const carry = Object.values(e.state.carry!).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(e.state.xp - (paid + deferred - carry)) < 1e-6, 'todo el XP ganado está en la torre o pendiente para mañana');
  assert.ok(cumXp(2, e.cfg.A, e.cfg.r) === e.cfg.A);
});
