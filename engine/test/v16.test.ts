import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../src/engine/engine.ts';

const paid = (e: Engine, input: object, cat: string, kind: string) => e.processDay(input as any).events.filter(x => x.cat === cat && x.kind === kind).reduce((a, x) => a + x.amount, 0);

test('v1.6: la misión semanal paga todo (300) al completarla y nada si no se completa', () => {
  const e = new Engine();
  assert.equal(paid(e, { gym: true }, 'F', 'W'), 0, 'primera sesión: nada');
  assert.equal(paid(e, { gym: true }, 'F', 'W'), 0, 'segunda sesión: nada');
  assert.equal(paid(e, { gym: true }, 'F', 'W'), 300, 'tercera sesión: toda la semanal');
  assert.equal(paid(e, { gym: true }, 'F', 'W'), 0, 'una cuarta sesión no paga de nuevo');
  // semana incompleta: dos sesiones no suman nada
  const f2 = new Engine(); let w = 0; for (let d = 0; d < 7; d++) w += f2.processDay(d < 2 ? { gym: true } : {}).events.filter(x => x.cat === 'F' && x.kind === 'W').reduce((a, x) => a + x.amount, 0);
  assert.equal(w, 0, 'con 2 de 3 sesiones no se paga nada de la semanal');
});

test('v1.6: la misión mensual paga completa (1.500) al cumplir las 16 sesiones, en cuotas diarias; con 15 no paga nada', () => {
  const run = (sessions: number) => {
    const e = new Engine(); let m = 0, d = 0, done = 0;
    for (; d < 28; d++) { const act = d % 7 < 5 && done < sessions; if (act) done++; m += e.processDay(act ? { gym: true } : {}).events.filter(x => x.cat === 'F' && x.kind === 'M').reduce((a, x) => a + x.amount, 0); }
    for (let k = 0; k < 10; k++) m += e.processDay({}).events.filter(x => x.cat === 'F' && x.kind === 'M').reduce((a, x) => a + x.amount, 0);
    return m;
  };
  assert.equal(run(15), 0, '15 de 16: nada');
  assert.ok(Math.abs(run(16) - 1500) < 1e-6, '16 de 16: 1.500 (sin racha, ×1)');
});

test('v1.6: el año perfecto sigue abriendo el piso 100 el 28-dic-2027 (día 421)', () => {
  const R = ['cocina', 'bano', 'habitacion', 'living', 'oficina', 'patio']; const e = new Engine(); let k = 0;
  for (let d = 0; d < 900 && e.state.tower === null; d++) {
    const dd = d % 7, wi = e.weekInfo(d); if (dd === 0) k = 0; const a = dd < 5, m = wi.n === wi.of && dd === 6;
    e.processDay({ gym: a, read: a, aero: a, clean: a, room: a ? R[k++ % 6] : undefined, meat: true, veg: true, dweek: dd === 6, book: m, repair: m } as any);
  }
  assert.equal(e.state.tower, 421);
});
