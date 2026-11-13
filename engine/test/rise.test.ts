import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Rise, RISE, ROOMS, CATS, HERO_TITLES, PET_TITLES, ladder, needSessions, normalize } from '../src/engine/rise.ts';
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

test('curva de niveles: nivel 1 con 0 XP, 99 como tope, cada nivel cuesta más que el anterior, y el XP nunca baja', () => {
  const e = new Rise();
  assert.equal(e.xpForLevel(1), 0); assert.equal(e.statLevel('F'), 1);
  for (let L = 1; L < 98; L++) assert.ok(e.statCost(L + 1) > e.statCost(L), 'nivel ' + L);
  assert.ok(e.xpForLevel(99) > 80_000 && e.xpForLevel(99) < 200_000, 'XP del nivel 99: ' + e.xpForLevel(99));
  assert.ok(e.xpForLevel(92) < e.xpForLevel(99) * 0.8);
  e.state.xp.F = 1e12; assert.equal(e.statLevel('F'), 99); assert.ok(e.statProgress('F').max);
  const { log } = run(120, (i, r) => perfect(i, r));
  let prev = 0;
  for (const d of log) { assert.ok(d.level >= prev); prev = d.level; }
});

test('multiplicadores de la mascota: no se suman y tienen tope x6', () => {
  assert.equal(ladder(1, 0), 1); assert.equal(ladder(1, 4), 1.5); assert.equal(ladder(2, 0), 2); assert.equal(ladder(4, 3), 2.5);
  assert.equal(ladder(5, 0), 3); assert.equal(ladder(9, 0), 3.5); assert.equal(ladder(99, 0), 6);
  assert.equal(needSessions(1), 5); assert.equal(needSessions(3), 4); assert.equal(needSessions(5), 3);
});

test('jugando perfecto: Maestro al año, Inmortal a los 2-3 años, y las cinco estadísticas parejas', () => {
  const { e, log } = run(7 * 180, (i, r) => perfect(i, r));
  const at = (k: number) => dateOfDay(START, e.state.titles[k]);
  const idx = (name: string) => HERO_TITLES.findIndex(t => t.name === name);
  assert.ok(at(idx('Aprendiz')) <= '2026-12-01', 'Aprendiz: ' + at(idx('Aprendiz')));
  assert.ok(at(idx('Maestro')) >= '2027-09-01' && at(idx('Maestro')) <= '2027-12-31', 'Maestro: ' + at(idx('Maestro')));
  assert.ok(at(idx('Inmortal')) >= '2028-12-01' && at(idx('Inmortal')) <= '2029-07-01', 'Inmortal: ' + at(idx('Inmortal')));
  assert.equal(e.titleName(), 'Inmortal'); assert.equal(e.level(), 99);
  assert.ok(e.petLevel() === 100, 'mascota nivel ' + e.petLevel());
  const lv = CATS.map(c => e.statLevel(c)); assert.ok(Math.max(...lv) - Math.min(...lv) <= 3, lv.join(','));
  assert.equal(log.length, 7 * 180);
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

test('títulos: piden promedio y un mínimo en cada estadística; una estadística olvidada frena el título pero no el XP', () => {
  const e = new Rise();
  e.state.xp = { F: 1e6, I: 1e6, V: 1e6, D: 1e6, O: 0 };                  // cuatro en 99 y Orden en 1
  const d = e.processDay({});
  assert.equal(d.level, 79);                                                // (4×99 + 1) / 5
  assert.equal(e.titleName(), 'Aprendiz');                                  // el mínimo de Constante (5) no se cumple con Orden en 1
  const nt = e.nextTitle()!; assert.equal(nt.name, 'Constante'); assert.deepEqual(nt.low, ['O']);
  e.processDay({ read: true }); assert.ok(e.state.xp.I > 1e6);
  e.state.xp.O = 1e6; const d2 = e.processDay({});
  assert.equal(d2.level, 99); assert.equal(e.titleName(), 'Inmortal');
  assert.ok(d2.unlocked.length >= 8, 'se desbloquean todos los títulos intermedios juntos');
  assert.equal(e.nextTitle(), null);
  const again = e.processDay({}); assert.equal(again.unlocked.length, 0);   // nunca se pierden ni se repiten
});

test('títulos de la mascota: por nivel', () => {
  const e = new Rise();
  assert.equal(e.petTitleName(), 'Huevo');
  e.state.petXp = 400; const d = e.processDay({});
  assert.deepEqual(d.petUnlocked, [0]); assert.equal(e.petTitleName(), PET_TITLES[0].name);
  e.state.petXp = 1e9; const d2 = e.processDay({});
  assert.equal(e.petTitleName(), 'Bestia suprema'); assert.equal(d2.petUnlocked.length, PET_TITLES.length - 1);
});

test('mascota: el punto se asigna a elección, máximo 20 por estadística y sin pasar de los puntos ganados', () => {
  const e = new Rise();
  e.state.petXp = 1e9; assert.equal(e.petLevel(), 100); assert.equal(e.petPending(), 100);
  e.processDay({ alloc: ['O', 'O', 'O'] }); assert.equal(e.state.petAlloc.O, 0);   // la bestia no reparte puntos
  e.processDay({ alloc: Array(30).fill('O') }); assert.equal(e.state.petAlloc.O, 0);
  const e2 = new Rise(); e2.processDay({ alloc: ['F'] }); assert.equal(e2.state.petAlloc.F, 0);     // sin nivel no hay punto
});

test('datos de versiones anteriores se convierten', () => {
  assert.equal(normalize({ gym: true }).gymMin, 60);
  assert.equal(normalize({ food: true }).foodPct, 1);
  assert.equal(normalize({ meals: true }).foodPct, 0.5);
  assert.equal(normalize({ gym: true, gymMin: 83 }).gymMin, 83);
  assert.equal(normalize({ waterMl: 1000 }).water, true); assert.equal(normalize({ waterMl: 750 }).water, undefined);
});

test('progreso: carga/descarga alternan 3+1 y el ciclo paga con 4 ejercicios distintos', () => {
  const e = new Rise();
  assert.deepEqual([0, 1, 2, 3, 4].map(w => e.weekType(w * 7)), ['carga', 'carga', 'carga', 'descarga', 'carga']);
  const r = run(28, (i) => (i % 7 === 2 ? { prog: ['ex' + (i / 7 | 0)] } : {}));
  assert.ok(r.log.flatMap(d => d.events).some(x => x.label === 'Ciclo completo'));
  const r2 = run(28, (i) => (i % 7 === 2 ? { prog: ['ex1'] } : {}));
  assert.ok(!r2.log.flatMap(d => d.events).some(x => x.label === 'Ciclo completo'));
});

test('gasto del día: desde el modo corte suma Vitalidad si llega a la meta (con el último peso anotado)', () => {
  const e = new Rise();
  for (let i = 0; i < 4; i++) e.processDay(i === 0 ? { weightKg: 87 } : {});          // 9 al 12/11: antes del corte
  const d = e.processDay({ gymMin: 72, aeroKcal: 300 });                             // viernes 13/11: 439 + 300 kcal
  assert.ok(d.events.some(x => x.label === 'Gasto del día' && x.cat === 'V'));
  const sat = e.processDay({ aeroKcal: 600 });                                       // sábado: le falta
  assert.ok(!sat.events.some(x => x.label === 'Gasto del día'));
});
