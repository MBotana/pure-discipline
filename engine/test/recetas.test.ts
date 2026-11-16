import test from 'node:test';
import assert from 'node:assert/strict';
import { RECETAS, recomendar } from '../src/engine/recetas.ts';

test('plan base: 4 recetas que suman ~1.500 kcal, ≥185 g de proteína y <50 g de carbohidratos', () => {
  const b = RECETAS.filter(r => r.base);
  assert.equal(b.length, 4);
  const t = b.reduce((z, r) => ({ k: z.k + r.k, p: z.p + r.p, c: z.c + r.c }), { k: 0, p: 0, c: 0 });
  assert.ok(t.k <= 1500 && t.p >= 185 && t.c < 50, JSON.stringify(t));
});
test('recomendar: arranque, falta de proteína, exceso de kcal, sin carbohidratos', () => {
  assert.equal(recomendar({ k: 0, p: 0, c: 0 }).r?.id, 'omelette');
  const falta = recomendar({ k: 400, p: 30, c: 12 });
  assert.ok(falta.r && falta.r.p >= 55, 'con mucho margen y poca proteína: una receta de carne');
  assert.equal(recomendar({ k: 1700, p: 120, c: 30 }).r?.id, 'whey-agua', 'pasado de kcal pero corto de proteína: lo más liviano');
  assert.equal(recomendar({ k: 1000, p: 120, c: 50 }).r?.id, 'whey-agua', 'sin margen de carbohidratos');
  assert.equal(recomendar({ k: 1400, p: 190, c: 40 }).r, null, 'ya llegó a la proteína');
  const justo = recomendar({ k: 1300, p: 150, c: 35 });
  assert.ok(justo.r && justo.r.k <= 250 && justo.r.c <= 16, JSON.stringify(justo.r));
});
