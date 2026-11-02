import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Engine } from '../src/engine/engine.ts';
import { LEGACY_CONFIG } from '../src/engine/config.ts';
import type { DayInput } from '../src/engine/types.ts';

const G = JSON.parse(readFileSync(new URL('./golden.json', import.meta.url), 'utf8'));

function run(sc: any) {
  const e = new Engine({ ...LEGACY_CONFIG, ...G.config });
  const floors: number[] = [], xps: number[] = []; let multi = 0, prev = 1;
  for (const inp of sc.inputs as DayInput[]) {
    const r = e.processDay(inp); floors.push(r.floor); xps.push(r.xp);
    if (r.floor - prev > 1) multi++; prev = r.floor;
  }
  return { e, floors, xps, multi };
}

for (const sc of G.scenarios) {
  test(`paridad con el simulador: ${sc.name}`, () => {
    const { e, floors, xps, multi } = run(sc);
    assert.deepEqual(floors, sc.floors, 'línea de tiempo de pisos');
    let maxd = 0; for (let i = 0; i < xps.length; i++) maxd = Math.max(maxd, Math.abs(xps[i] - sc.xp[i]));
    assert.ok(maxd < 1e-4, `XP diverge hasta ${maxd}`);
    assert.deepEqual(e.state.stat, sc.final.stat, 'estadísticas');
    assert.deepEqual(e.petLevels(), sc.final.pet, 'mascotas');
    assert.equal(e.state.tower, sc.final.tower, 'día de apertura del piso 100');
    assert.equal(e.state.discPenN, sc.final.discPenN, 'penalidades de Disciplina');
    assert.equal(multi, sc.final.multi);
    for (const [g, d] of Object.entries(sc.final.arrive)) assert.equal(e.state.arrive[Number(g)], d, `llegada piso ${g}`);
    for (const [g, d] of Object.entries(sc.final.cleared)) assert.equal(e.state.clearedDay[Number(g)], d, `apertura piso ${g}`);
  });
}

test('nunca más de un piso por día y el perfecto abre el día 364', () => {
  for (const sc of G.scenarios) {
    const { multi } = run(sc);
    assert.equal(multi, 0, sc.name);
  }
  const p = G.scenarios.find((s: any) => s.name === 'perfecto');
  assert.equal(run(p).e.state.tower, 364);
});

test('estado serializable: guardar/restaurar a mitad de camino da el mismo resultado', () => {
  const sc = G.scenarios[0]; const a = new Engine({ ...LEGACY_CONFIG, ...G.config }); const half = 200;
  for (let i = 0; i < half; i++) a.processDay(sc.inputs[i]);
  const b = new Engine({ ...LEGACY_CONFIG, ...G.config }, JSON.parse(JSON.stringify(a.state)));
  for (let i = half; i < sc.inputs.length; i++) { a.processDay(sc.inputs[i]); b.processDay(sc.inputs[i]); }
  assert.deepEqual(a.state, b.state);
});
