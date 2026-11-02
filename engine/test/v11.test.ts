import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Engine, cumXp } from '../src/engine/engine.ts';
import { LEGACY_CONFIG } from '../src/engine/config.ts';
import type { DayInput } from '../src/engine/types.ts';
const G = JSON.parse(readFileSync(new URL('./golden.json', import.meta.url), 'utf8'));

/** Convierte las entradas de la v1.0 al modo v1.1 (Disciplina por formulario del domingo, comida diaria). */
function toV11(inputs: DayInput[]): DayInput[] {
  const out = inputs.map(i => { const { dwork, dcheck, feed, ...rest } = i as any; return rest as DayInput; });
  for (let w = 0; w * 7 + 6 < inputs.length; w++) {
    const days = inputs.slice(w * 7, w * 7 + 7);
    if (days.filter(d => d.dwork).length >= 3) out[w * 7 + 6].dweek = true;
    if (days[6].feed) for (let k = 0; k < 4; k++) out[w * 7 + k].food = true;
  }
  return out;
}
function peak(inputs: DayInput[]) {
  const e = new Engine({ ...LEGACY_CONFIG, ...G.config }); let worst = 0, multi = 0, prev = 1;
  for (const inp of inputs) {
    const before = e.state.xp, L = e.floor(), r = e.processDay(inp);
    const cost = e.cfg.A * Math.pow(e.cfg.r, L - 1);
    worst = Math.max(worst, (r.xp - before) / cost);
    if (r.floor - prev > 1) multi++; prev = r.floor;
  }
  return { e, worst, multi };
}

test('v1.1: año perfecto con formulario del domingo y comida diaria da el mismo resultado final', () => {
  const sc = G.scenarios.find((s: any) => s.name === 'perfecto');
  const old = peak(sc.inputs), nu = peak(toV11(sc.inputs));
  for (const c of ['F', 'I', 'V', 'D', 'O'] as const) assert.ok(Math.abs(nu.e.state.stat[c] - old.e.state.stat[c]) <= 1, `estadística ${c}`);
  assert.deepEqual(nu.e.petLevels(), old.e.petLevels());
  assert.equal(nu.multi, 0, 'ningún día sube más de un piso');
  console.log('tower', old.e.state.tower, nu.e.state.tower, 'pico', old.worst.toFixed(3), nu.worst.toFixed(3));
  assert.ok(nu.worst < 1, 'el pico diario no supera el costo del piso siguiente');
  assert.ok(Math.abs((nu.e.state.tower ?? 999) - (old.e.state.tower ?? 0)) <= 3);
});

test('v1.1: más de 3 sesiones de videojuegos o celular > 5 h violan el antiobjetivo', () => {
  const mk = (extra: DayInput) => { const e = new Engine({ ...LEGACY_CONFIG, ...G.config });
    for (let i = 0; i < 7; i++) e.processDay({ ...(i === 0 ? { gaming: 4 } : {}), ...(i === 6 ? { dweek: true, ...extra } : {}) });
    return e.state.stat.D; };
  assert.equal(mk({}), 0, 'más de 3 sesiones: sin punto');
  const ok = new Engine({ ...LEGACY_CONFIG, ...G.config }); for (let i = 0; i < 7; i++) ok.processDay({ ...(i === 0 ? { gaming: 3 } : {}), ...(i === 6 ? { dweek: true } : {}) });
  assert.equal(ok.state.stat.D, 1);
  const ph = new Engine({ ...LEGACY_CONFIG, ...G.config }); for (let i = 0; i < 7; i++) ph.processDay(i === 6 ? { dweek: true, phone: true } : {});
  assert.equal(ph.state.stat.D, 0);
});

test('v1.1: 4 días de comida alimentan a la mascota equipada', () => {
  const e = new Engine({ ...LEGACY_CONFIG, ...G.config });
  for (let i = 0; i < 7; i++) e.processDay(i < 4 ? { food: true } : {});
  assert.equal(e.state.px.F, e.cfg.petWeek);
  const f = new Engine({ ...LEGACY_CONFIG, ...G.config }); for (let i = 0; i < 7; i++) f.processDay(i < 3 ? { food: true } : {});
  assert.equal(f.state.px.F, 0);
});

test('v1.2: libro terminado y arreglo en la casa (un solo pago mensual) + ambientes distintos: año perfecto', () => {
  const sc = G.scenarios.find((s: any) => s.name === 'perfecto');
  const probe = new Engine({ ...LEGACY_CONFIG, ...G.config });
  const base = toV11(sc.inputs).map((i: any, d: number) => {
    const { bookTramo, improve, ...rest } = i as any; const o: any = rest;
    const wi = probe.weekInfo(d);
    if (d % 7 === 6 && wi.n === wi.of) { o.book = true; o.repair = true; }
    return o as DayInput;
  });
  const ROOMS = ['cocina', 'bano', 'habitacion', 'living', 'oficina', 'patio'];
  for (let w = 0; w * 7 < base.length; w++) { let k = 0; for (let d = 0; d < 7; d++) { const x: any = base[w * 7 + d]; if (x && x.clean && k < 6) x.room = ROOMS[k++]; } }
  const r = peak(base);
  console.log('v1.2 torre', r.e.state.tower, 'pico', r.worst.toFixed(3), 'multi', r.multi);
  assert.equal(r.multi, 0);
  assert.ok(r.worst < 1);
});
