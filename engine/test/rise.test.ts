import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Rise, RISE, ROOMS, CATS, ladder, needSessions, normalize } from '../src/engine/rise.ts';
import type { RiseInput, Cat } from '../src/engine/rise.ts';
import { dateOfDay } from '../src/engine/calendar.ts';

const START = RISE.startDate;

/** Día de jugador perfecto: gimnasio 75 min de lunes a viernes, lectura, un ambiente, comida al 100 %, agua; libro y arreglo el día 25. */
function perfect(i: number, e: Rise, opts: { train?: boolean } = {}): RiseInput {
  const dd = i % 7, date = dateOfDay(START, i), train = opts.train !== false;
  const x: RiseInput = { read: true, water: true, gameH: 1, alloc: autoAlloc(e) };
  if (dd < 5) { x.foodPct = 1; x.rooms = [ROOMS[dd]]; if (train) { x.gymMin = 75; if (dd === 2) x.prog = ['ex' + (Math.floor(i / 7) % 12)]; } }
  if (date.endsWith('-25')) { x.books = [{ t: 'Libro' }]; x.repairs = [{ t: 'Arreglo' }]; }
  return x;
}
/** Asigna los puntos de la mascota a la estadística efectiva más baja (como en la simulación). */
function autoAlloc(e: Rise): Cat[] {
  const out: Cat[] = []; let pend = e.petPending();
  const a: Record<Cat, number> = { ...e.state.petAlloc };
  while (pend-- > 0) {
    const c = CATS.filter(k => a[k] < 20).sort((x, y) => (e.statLevel(x) + a[x]) - (e.statLevel(y) + a[y]))[0];
    if (!c) break; a[c]++; out.push(c);
  }
  return out;
}
function run(days: number, f: (i: number, e: Rise) => RiseInput) {
  const e = new Rise(); const log = [];
  for (let i = 0; i < days; i++) log.push(e.processDay(f(i, e)));
  return { e, log };
}

test('costos: nivel 1 = 1.000 XP, nivel 20 = unos 6.100 XP, y el XP nunca baja', () => {
  const e = new Rise();
  assert.equal(Math.round(e.statCost(0)), 1000);
  assert.ok(Math.abs(e.statCost(19) - 1000 * 1.1 ** 19) < 1e-6);
  const { log } = run(120, (i, r) => perfect(i, r));
  let prev = 0;
  for (const d of log) { assert.ok(d.floor >= prev); prev = d.floor; }
});

test('multiplicadores de la mascota: no se suman y tienen tope x6', () => {
  assert.equal(ladder(1, 0), 1); assert.equal(ladder(1, 4), 1.5); assert.equal(ladder(2, 0), 2); assert.equal(ladder(4, 3), 2.5);
  assert.equal(ladder(5, 0), 3); assert.equal(ladder(9, 0), 3.5); assert.equal(ladder(99, 0), 6);
  assert.equal(needSessions(1), 5); assert.equal(needSessions(3), 4); assert.equal(needSessions(5), 3);
});

test('jugando perfecto: piso 100 hacia el 20-dic-2027, parejo entre las cinco estadísticas', () => {
  const { e, log } = run(7 * 120, (i, r) => perfect(i, r));
  const at = (g: number) => dateOfDay(START, e.state.clearedDay[g]);
  assert.ok(e.state.cleared.includes(100), 'no llegó al piso 100');
  const d100 = at(100);
  assert.ok(d100 >= '2027-12-10' && d100 <= '2028-01-05', 'piso 100 el ' + d100);
  assert.equal(log.find(d => d.date === '2027-12-31')!.floor, 100);
  assert.ok(e.petLevel() === 100, 'mascota nivel ' + e.petLevel());
  assert.ok(at(10) >= '2026-11-20' && at(10) <= '2026-12-02', 'puerta 10: ' + at(10));
  assert.ok(at(50) >= '2027-02-20' && at(50) <= '2027-03-10', 'puerta 50: ' + at(50));
  for (const c of CATS) assert.equal(e.statLevel(c), 20);
});

test('semana típica perfecta: ~1.000 XP por estadística', () => {
  const { e } = run(7 * 8, (i, r) => perfect(i, r));
  for (const c of CATS) { const perWeek = e.state.xp[c] / 8; assert.ok(perWeek > 850 && perWeek < 1250, c + ': ' + perWeek); }
});

test('racha: semana 1 exige 5 sesiones, luego 4 y desde el mes 2 solo 3', () => {
  const gymDays = (n: number) => (i: number): RiseInput => ((i % 7) < n ? { gymMin: 60 } : {});
  let r = run(7, (i) => gymDays(4)(i)); assert.equal(r.e.state.k, 1, '4 sesiones en la semana 1 no arranca la racha');
  r = run(7, (i) => gymDays(5)(i)); assert.equal(r.e.state.k, 2);
  // semana 1 con 5, semanas 2-4 con 4 → k llega a 5; luego 3 alcanza
  r = run(7 * 4, (i) => gymDays(i < 7 ? 5 : 4)(i)); assert.equal(r.e.state.k, 5);
  r = run(7 * 5, (i) => gymDays(i < 7 ? 5 : i < 28 ? 4 : 3)(i)); assert.equal(r.e.state.k, 6);
  r = run(7 * 5, (i) => gymDays(i < 7 ? 5 : i < 28 ? 4 : 2)(i)); assert.equal(r.e.state.k, 1, 'con 2 sesiones se corta');
  // el XP ya ganado no baja al cortarse
  const before = run(7 * 5, (i) => gymDays(i < 7 ? 5 : i < 28 ? 4 : 3)(i)).e.state.petXp;
  const after = run(7 * 6, (i) => gymDays(i < 7 ? 5 : i < 28 ? 4 : i < 35 ? 3 : 0)(i)).e.state.petXp;
  assert.ok(after >= before);
});

test('boxeo y gimnasio cuentan igual; solo pagan 5 sesiones por semana; menos de 40 minutos no es sesión', () => {
  const r = run(7, (i) => ({ gymMin: i < 6 ? 60 : 30 }));
  assert.equal(r.e.state.wk.sess, 6);                           // 6 visitas de 60 min cuentan como sesión; el domingo de 30 min no
  const r2 = run(6, (i) => ({ gymMin: 60 }));
  const pet = r2.log.flatMap(d => d.events).filter(x => x.cat === 'pet' && x.label === 'Sesión');
  assert.equal(pet.length, 5);
  const r3 = run(1, () => ({ gymMin: 30 }));
  assert.equal(r3.log[0].events.filter(x => x.cat === 'pet').length, 0);
  assert.ok(r3.log[0].events.some(x => x.cat === 'F'));        // igual paga minutos de Fuerza
});

test('comida: fin de semana libre, agua todos los días', () => {
  const r = run(7, (i) => ({ foodPct: 1, water: true }));
  const food = r.log.flatMap(d => d.events).filter(x => x.label === 'Comida');
  assert.equal(food.length, 5);
  assert.equal(r.log.flatMap(d => d.events).filter(x => x.label === 'Agua').length, 7);
  assert.equal(Math.round(r.e.state.xp.V), 5 * 105 + 7 * 15 + 250);
  const bad = run(7, (i) => ({ foodPct: 0.7 }));
  assert.equal(bad.log.flatMap(d => d.events).filter(x => x.kind === 'W' && x.cat === 'V').length, 0);
});

test('orden: 1ª limpieza 100, extras 40, semana con 5 de 6 ambientes', () => {
  const r = run(7, (i) => (i < 5 ? { rooms: i === 0 ? ['cocina', 'bano'] : [ROOMS[i + 1]] } : {}));
  const O = r.log.flatMap(d => d.events).filter(x => x.cat === 'O');
  assert.equal(O.filter(x => x.label === 'Limpieza').length, 5);
  assert.equal(O.filter(x => x.label === 'Ambiente extra').length, 1);
  assert.ok(O.some(x => x.label === 'Semana de orden'));       // 6 distintos ≥ 5
  const r2 = run(7, (i) => (i < 5 ? { rooms: ['cocina'] } : {}));
  assert.ok(!r2.log.flatMap(d => d.events).some(x => x.label === 'Semana de orden'));
});

test('libros y arreglos: el primero del mes vale el doble', () => {
  const r = run(10, (i) => (i === 1 ? { books: [{ t: 'A' }, { t: 'B' }], repairs: [{ t: 'x' }, { t: 'y' }] } : {}));
  const ev = r.log[1].events;
  assert.deepEqual(ev.filter(x => x.cat === 'I').map(x => x.amount), [2500, 1250]);
  assert.deepEqual(ev.filter(x => x.label.startsWith('Arreglo')).map(x => x.amount), [1100, 550]);
});

test('Disciplina: pasarse del tope esa semana no paga, y el mes se pierde', () => {
  const ok = run(28, (i) => (i % 7 === 0 ? { gameH: 10 } : {}));
  assert.ok(ok.log.flatMap(d => d.events).filter(x => x.cat === 'D' && x.kind === 'W').length >= 3);
  const bad = run(30, (i) => (i === 3 ? { gameH: 16 } : {}));
  assert.ok(!bad.log.flatMap(d => d.events).some(x => x.cat === 'D' && x.kind === 'M'), 'no debería cobrar el mes');
});

test('puertas: con nivel suficiente pero una estadística floja, el piso se queda en la puerta y el XP sigue sumando', () => {
  const e = new Rise();
  e.state.xp = { F: 1e6, I: 1e6, V: 1e6, D: 1e6, O: 0 };                // nivel 80, Orden en 0
  const d = e.processDay({});
  assert.equal(d.level, 80); assert.equal(d.blocked, 10); assert.equal(d.floor, 10);
  e.processDay({ read: true }); assert.ok(e.state.xp.I > 1e6);
  e.state.xp.O = 1e6; const d2 = e.processDay({});
  assert.equal(d2.level, 100); assert.equal(d2.blocked, 70); assert.equal(d2.floor, 70);   // todo en 20, pero la puerta 70 pide 24: faltan puntos de la mascota
  e.state.petXp = 1e9; e.processDay({ alloc: ['F', 'F', 'F', 'F', 'I', 'I', 'I', 'I', 'V', 'V', 'V', 'V', 'D', 'D', 'D', 'D', 'O', 'O', 'O', 'O'] });
  const d3 = e.processDay({}); assert.equal(d3.blocked, 80); assert.equal(d3.floor, 80);                // con 24 en cada una pasa la 70, pero la 80 pide 27
});

test('mascota: el punto se asigna a elección, máximo 20 por estadística y sin pasar de los puntos ganados', () => {
  const e = new Rise();
  e.state.petXp = 1e9; assert.equal(e.petLevel(), 100); assert.equal(e.petPending(), 100);
  e.processDay({ alloc: ['O', 'O', 'O'] }); assert.equal(e.state.petAlloc.O, 3); assert.equal(e.petPending(), 97);
  e.processDay({ alloc: Array(30).fill('O') }); assert.equal(e.state.petAlloc.O, 20);
  const e2 = new Rise(); e2.processDay({ alloc: ['F'] }); assert.equal(e2.state.petAlloc.F, 0);     // sin nivel no hay punto
});

test('datos de versiones anteriores se convierten', () => {
  assert.equal(normalize({ gym: true }).gymMin, 60);
  assert.equal(normalize({ food: true }).foodPct, 1);
  assert.equal(normalize({ meals: true }).foodPct, 0.5);
  assert.equal(normalize({ gym: true, gymMin: 83 }).gymMin, 83);
});

test('progreso: carga/descarga alternan 3+1 y el ciclo paga con 4 ejercicios distintos', () => {
  const e = new Rise();
  assert.deepEqual([0, 1, 2, 3, 4].map(w => e.weekType(w * 7)), ['carga', 'carga', 'carga', 'descarga', 'carga']);
  const r = run(28, (i) => (i % 7 === 2 ? { prog: ['ex' + (i / 7 | 0)] } : {}));
  assert.ok(r.log.flatMap(d => d.events).some(x => x.label === 'Ciclo completo'));
  const r2 = run(28, (i) => (i % 7 === 2 ? { prog: ['ex1'] } : {}));
  assert.ok(!r2.log.flatMap(d => d.events).some(x => x.label === 'Ciclo completo'));
});
