import { test } from 'node:test';
import assert from 'node:assert/strict';
import { puntajeDia, semanas, meses, destacados, sugerencias, addD, ajustePeso } from '../src/engine/resumen.ts';
import { gastoDia } from '../src/engine/gasto.ts';

const START = '2026-11-09';
const dia = (o: any = {}) => ({ gymMin: 60, read: true, rooms: ['cocina'], waterMl: 1000, weightKg: 87, foodPct: 1, ...o });

test('puntaje del día: 6 misiones entre semana, 5 el fin de semana', () => {
  assert.equal(puntajeDia(dia(), '2026-11-09'), 1);
  assert.equal(puntajeDia({}, '2026-11-09'), 0);
  assert.equal(puntajeDia({ read: true, waterMl: 1200, gymMin: 45 }, '2026-11-09'), 0.5);
  assert.equal(puntajeDia({ read: true, weightKg: 80, gymMin: 60, waterMl: 1000, rooms: ['bano'] }, '2026-11-08'), 1, 'domingo antes del corte: 5 de 5');
  // desde el modo corte el gasto del día es una misión más (7 entre semana, 6 el fin de semana)
  assert.equal(puntajeDia(dia(), '2026-11-13'), 6 / 7, 'viernes con 60 min de pesas: 365 kcal, no llega a 900');
  assert.equal(puntajeDia(dia({ aeroKcal: 600 }), '2026-11-13', 87), 1);
  assert.equal(puntajeDia({ read: true, weightKg: 80, gymMin: 60, waterMl: 1000, rooms: ['bano'], aeroKcal: 600, foodPct: 0.9 }, '2026-11-14', 87), 1, 'sábado del modo 25/12: 7 de 7 (la comida también cuenta)');
  assert.equal(puntajeDia({ read: true, weightKg: 80, gymMin: 60, waterMl: 1000, rooms: ['bano'], aeroKcal: 600 }, '2027-01-09', 87), 1, 'sábado fuera del modo: 6 de 6');
});

test('gasto del día: gimnasio por tiempo y peso, boxeo con más MET, aeróbico a mano', () => {
  const g = gastoDia({ gymMin: 72, aeroKcal: 200 }, 4, 87);       // viernes, pesas
  assert.equal(g.kpm, 6.1); assert.equal(g.gym, 439); assert.equal(g.total, 639); assert.equal(g.meta, 900);
  const b = gastoDia({ gymMin: 90 }, 0, 87);                        // lunes, boxeo
  assert.equal(b.box, true); assert.equal(b.gym, 936); assert.equal(gastoDia({ gymMin: 90, rut: 4 }, 0, 87).box, false, 'si el lunes elegiste piernas, son pesas');
  assert.equal(gastoDia({}, 6, 87).meta, 500, 'domingo: descanso activo');
});

test('semanas y destacados: la mejor semana, el peor mes y la racha de días', () => {
  const inp: any = {};
  for (let q = 0; q < 7; q++) inp[addD(START, q)] = dia({ gymMin: q < 3 ? 120 : 0 });           // semana 1 muy buena
  for (let q = 7; q < 14; q++) inp[addD(START, q)] = q % 2 ? {} : dia({ read: false });         // semana 2 floja
  const hoy = addD(START, 14);
  const S = semanas(inp, START, hoy);
  assert.equal(S.length, 3); assert.equal(S[0].completa, true); assert.equal(S[2].completa, false);
  assert.equal(S[0].gymMin, 360);
  const d = destacados(inp, START, hoy);
  assert.equal(d.mejorSemana!.lunes, START); assert.equal(d.peorSemana!.lunes, addD(START, 7));
  assert.ok(d.rachaDias >= 1);
  assert.equal(meses(inp, START, hoy)[0].ym, '2026-11');
});

test('sugerencias: peso, estancamiento en el gimnasio y hábitos flojos', () => {
  const hoy = addD(START, 28);                                  // empezó la semana 5; la 4 (descarga) terminó
  assert.deepEqual(sugerencias({}, START, START), [], 'sin semana completa no hay nada');
  const inp: any = {};
  // semanas 1-3 (índices 0-2): peso baja más de 1 kg por semana y el press no sube de la progresiva a la máxima
  for (let w = 0; w < 4; w++) for (let q = 0; q < 7; q++) inp[addD(START, w * 7 + q)] = { weightKg: 90 - w * 1.6, ...(q === 1 ? { lifts: { 'Press de pecho': [{ w: 60, r: 12, ok: true }] }, feel: { 'Press de pecho': 'd' }, gymMin: 400 } : {}) };
  const r = sugerencias(inp, START, addD(START, 21));            // semana de referencia = índice 2 (máxima)
  const temas = r.map(x => x.tema);
  assert.ok(temas.includes('Peso')); assert.match(r.find(x => x.tema === 'Peso')!.texto, /sumá 150 kcal/);
  assert.match(r.find(x => x.texto.includes('Press de pecho'))!.texto, /Bajá un 5-10%/, 'duro: baja la carga');
  assert.ok(temas.includes('Lectura') && temas.includes('Agua') && temas.includes('Orden'));
  void hoy;
});

test('ajuste de peso del corte: 0,8 a 1,3 kg por semana', () => {
  assert.match(ajustePeso([-0.5, -0.3]), /recortá 150 kcal/);
  assert.match(ajustePeso([-1, -1]), /no toques nada/);
  assert.match(ajustePeso([-1.2, -1.8]), /sumá 150 kcal/);
  assert.equal(ajustePeso([-2]), '', 'la primera semana baja agua: no se corrige');
});

test('controles del 25/12: cada viernes no alcanzado (o sin pesaje) suma 150 kcal a la meta de gasto', async () => {
  const { extraGasto, controles } = await import('../src/engine/gasto.ts');
  assert.equal(extraGasto({ '2026-11-20': 85.4 }, '2026-11-21'), 0, 'llegó');
  assert.equal(extraGasto({ '2026-11-19': 85.4 }, '2026-11-21'), 0, 'se pesó el jueves: vale');
  assert.equal(extraGasto({ '2026-11-20': 86 }, '2026-11-20'), 0, 'el mismo día del control todavía no suma');
  assert.equal(extraGasto({ '2026-11-20': 86 }, '2026-11-21'), 150);
  assert.equal(extraGasto({ '2026-11-20': 85 }, '2026-11-28'), 150, 'el 27 no se pesó: cuenta como no alcanzado');
  assert.equal(controles({}, '2026-11-14').filter(c => c.pasado).length, 0);
});
