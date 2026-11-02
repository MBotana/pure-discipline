import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../src/engine/engine.ts';
import type { DayInput } from '../src/engine/types.ts';

/** Procesa una semana (lunes a domingo) con las entradas dadas; los días que faltan quedan vacíos. */
function week(days: DayInput[], cfg = {}, e = new Engine(cfg)) {
  const out = []; for (let d = 0; d < 7; d++) out.push(e.processDay(days[d] ?? {}));
  return { e, out };
}
const daily = (r: ReturnType<typeof week>, cat: string) => r.out.flatMap(x => x.events).filter(x => x.cat === cat && x.kind === 'D').length;

test('v1.5: el fin de semana compensa días perdidos pero no suma XP extra', () => {
  const G = { gym: true };
  assert.equal(daily(week([G, G, G, G, G, G, G]), 'F'), 5, 'cinco días hechos: el fin de semana no paga');
  assert.equal(daily(week([G, G, {}, G, G, G, {}]), 'F'), 5, 'falta el miércoles: el sábado lo compensa');
  assert.equal(daily(week([G, {}, {}, G, G, G, G]), 'F'), 5, 'faltan dos: sábado y domingo compensan');
  assert.equal(daily(week([G, {}, {}, {}, G, G, G]), 'F'), 4, 'tres perdidos: el fin de semana compensa solo dos (2 + 2)');
});

test('v1.5: la compensación vale para Fuerza, Inteligencia, Vitalidad y Orden', () => {
  const full: DayInput = { gym: true, read: true, aero: true, clean: true, room: 'cocina' };
  const r = week([{}, full, full, full, full, full, full]);
  for (const c of ['F', 'I', 'V', 'O']) assert.equal(daily(r, c), 5, c);
});

test('v1.5: LEGACY no paga el fin de semana', () => {
  const e = new Engine({ weekendComp: false });
  const r = week([{ gym: true }, {}, {}, {}, {}, { gym: true }, { gym: true }], {}, e);
  assert.equal(daily(r, 'F'), 1);
});

test('v1.5: Orden con varios ambientes el mismo día', () => {
  const r = week([{ rooms: ['cocina', 'bano', 'living'], clean: true }]);
  assert.equal(r.e.state.wu.O, 3);
  assert.deepEqual(r.e.state.roomsWk, ['cocina', 'bano', 'living']);
  assert.equal(daily(r, 'O'), 1, 'la diaria se paga una sola vez por día');
  const r2 = week([{ rooms: ['cocina', 'bano', 'living', 'oficina', 'patio', 'habitacion'] }]);
  assert.equal(r2.e.state.wu.O, 5, 'la semanal se cumple con 5 de 6');
  assert.ok(r2.e.state.wdone.includes('O'));
});

test('v1.5: gimnasio mensual de 16 sesiones', () => {
  const e = new Engine({ gameGraceWeeks: 0 }); let done = -1;
  for (let d = 0; d < 28; d++) { const r = e.processDay({ gym: d % 7 < 4 }); if (r.completed.monthly.includes('F')) { done = d; break; } }
  assert.equal(done, 3 * 7 + 3, 'a 4 por semana se cumple al cuarto día de la cuarta semana');
  const e3 = new Engine({ gameGraceWeeks: 0 });
  for (let d = 0; d < 28; d++) e3.processDay({ gym: d % 7 < 3 });
  assert.ok(!e3.state.mdone.includes('F'), '3 por semana no alcanza para el mes');
});

test('v1.5: Disciplina por horas de videojuegos (100 % cumple, 100–120 % no suma, más de 120 % resta 1)', () => {
  const cfg = { gameGraceWeeks: 0 };
  const hours = (h: number, start?: Engine) => { const e = start ?? new Engine(cfg); week([{ gameH: h }], cfg, e); return e; };
  let e = hours(15); assert.ok(e.state.wdone.includes('D'), 'justo el tope: cumple'); assert.equal(e.state.stat.D, 1);
  e = hours(12); assert.ok(e.state.wdone.includes('D'));
  e = hours(16); assert.ok(!e.state.wdone.includes('D'), 'pasarse un poco: no suma'); assert.equal(e.state.stat.D, 0); assert.equal(e.state.discPenN, 0);
  e = hours(18); assert.ok(!e.state.wdone.includes('D'), 'exactamente 120 %: todavía no resta'); assert.equal(e.state.discPenN, 0);
  e = hours(15); assert.equal(e.state.stat.D, 1);
  e = hours(19, e); assert.equal(e.state.discPenN, 1, 'más de 120 %: resta'); assert.equal(e.state.stat.D, 0);
  // varias sesiones en la semana se suman
  const e2 = new Engine(cfg); week([{ gameH: 5 }, { gameH: 5 }, { gameH: 5.5 }], cfg, e2); assert.ok(!e2.state.wdone.includes('D'));
  assert.equal(e2.state.gameHWk, 15.5);
});

test('v1.5: las dos primeras semanas se miden pero no se castigan', () => {
  const e = new Engine();
  week([{ gameH: 40 }], {}, e); assert.ok(e.state.wdone.includes('D'), 'semana 1 de prueba: cuenta como cumplida');
  assert.equal(e.state.discPenN, 0);
  week([{ gameH: 40 }], {}, e); week([{ gameH: 40 }], {}, e);
  assert.ok(!e.state.wdone.includes('D'), 'desde la semana 3 rige el tope'); assert.equal(e.state.discPenN, 1);
});

test('v1.5: la semana de alimentación se cumple con 5 días aprobados de 7', () => {
  const A: DayInput = { food: true, meals: true };
  assert.equal(week([A, A, A, A, A]).e.state.px.F, 10, '5 aprobados: alimenta');
  assert.equal(week([A, A, A, A, {}, {}, {}]).e.state.px.F, 0, '4 no alcanzan');
  assert.equal(week([A, A, A, A, A, A, A], { gameCapH: undefined }).e.state.xp, 0, 'sin XP de torre (la comida nunca paga XP)');
});

test('v1.5: cargar el libro marca la misión mensual de Inteligencia ese mismo día', () => {
  const e = new Engine(); let r = e.processDay({});
  r = e.processDay({ book: true, books: [{ t: 'Dune', a: 'Frank Herbert' }] });
  assert.ok(r.completed.monthly.includes('I'));
  assert.ok(e.state.mdone.includes('I'));
  const again = e.processDay({ books: [{ t: 'Otro libro' }] });
  assert.ok(!again.completed.monthly.includes('I'), 'un segundo libro del mes no repite la misión');
});
