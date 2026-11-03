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
  assert.ok(seg[0] <= 2.6, 'los primeros pisos salen cada 2 o 3 días (v1.6: las misiones cobran al cierre de la semana y del mes)');
  assert.ok(seg[4] >= 2.5 * seg[0], 'el último tramo es mucho más lento');
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
  // v1.5: con la compensación de fin de semana, faltar uno o dos días de lunes a viernes no cuesta XP si se recupera el sábado y el domingo
  const oneDay = play({ miss: d => d % 7 === 3 }).e.state.tower!;
  assert.ok(oneDay <= perfect + 2, `falla 1 día por semana (compensado): ${oneDay} vs ${perfect}`);
  const threeDays = play({ miss: d => [2, 3, 4].includes(d % 7) }).e.state.tower!;
  assert.ok(threeDays === null || threeDays > perfect, `faltan 3 días por semana (Orden no llega a 5 ambientes): ${threeDays} vs ${perfect}`);
});

test('v1.3: el XP se suma el mismo día, pero el piso sube como máximo uno por día', () => {
  const e = new Engine(); let prev = 1, paid = 0;
  for (let d = 0; d < 120; d++) {
    const dd = d % 7, wi = e.weekInfo(d), m = wi.n === 1 && dd === 0;   // libro y arreglo temprano: días de mucho XP
    const r = e.processDay({ gym: true, read: true, aero: true, clean: true, room: ROOMS[dd % 6], food: true, dweek: dd === 6, book: m, repair: m });
    for (const x of r.events) paid += x.paid;
    assert.ok(r.floor - prev <= 1, `día ${d}: subió ${r.floor - prev} pisos`); prev = r.floor;
    assert.ok(e.xpFloor() >= r.floor, 'el piso nunca va por delante del XP');
  }
  assert.ok(Math.abs(e.state.xp - paid) < 1e-6, 'todo el XP ganado está sumado');
});

test('v1.3: las diarias también se multiplican por la racha', () => {
  const e = new Engine(); let k = 0;
  for (let d = 0; d < 35; d++) {   // primer mes perfecto: racha 1 desde el cierre de noviembre
    const dd = d % 7, wi = e.weekInfo(d), m = wi.n === wi.of && dd === 6; if (dd === 0) k = 0;
    e.processDay({ gym: true, read: true, aero: true, clean: true, room: ROOMS[k++ % 6], food: true, dweek: dd === 6, book: m, repair: m });
  }
  assert.equal(e.state.s, 1);
  const daily = e.processDay({ gym: true }).events.find(x => x.kind === 'D')!;   // lunes 7-dic-2026
  assert.equal(daily.mult, 1.5);
  assert.equal(daily.amount, 75);
});

test('v1.4: alimentación por tipo de comida (carne, verduras, basura)', () => {
  const week = (days: DayInput[]) => { const e = new Engine({ foodRule: { meat: 3, veg: 3, junkMax: 3 }, gameCapH: undefined }); let pet = false; for (let d = 0; d < 7; d++) pet = e.processDay(days[d] ?? {}).completed.pet || pet; return { e, pet }; };
  const C = { meat: true }, V = { veg: true }, CV = { meat: true, veg: true }, B = { junk: true };
  // 3 de carne + 3 de verduras, sin basura → alimenta (+10 XP de mascota)
  let r = week([CV, CV, CV, {}, {}, {}, {}]); assert.equal(r.e.state.px.F, 10); assert.ok(r.pet);
  assert.equal(r.e.state.foodWk, 3, 'diarias aprobadas');
  // hasta 3 días con basura sigue aprobando
  r = week([{ ...CV, ...B }, { ...CV, ...B }, { ...CV, ...B }, {}, {}, {}, {}]); assert.equal(r.e.state.px.F, 10);
  // 4 días con basura falla
  r = week([{ ...CV, ...B }, { ...CV, ...B }, { ...CV, ...B }, B, {}, {}, {}]); assert.equal(r.e.state.px.F, 0); assert.equal(r.e.state.feedStreak, 1);
  // solo carne no alcanza
  r = week([C, C, C, C, C, V, V]); assert.equal(r.e.state.px.F, 0);
  // la basura sola no aprueba la diaria
  r = week([B, {}, {}, {}, {}, {}, {}]); assert.equal(r.e.state.foodWk, 0);
  // no da XP de torre
  assert.equal(week([CV, CV, CV, CV, CV, CV, CV]).e.state.xp, 0);
});
