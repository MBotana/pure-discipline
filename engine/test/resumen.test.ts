import { test } from 'node:test';
import assert from 'node:assert/strict';
import { puntajeDia, semanas, meses, destacados, sugerencias, addD } from '../src/engine/resumen.ts';

const START = '2026-11-09';
const dia = (o: any = {}) => ({ gymMin: 60, read: true, rooms: ['cocina'], waterMl: 1000, weightKg: 87, foodPct: 1, ...o });

test('puntaje del día: 6 misiones entre semana, 5 el fin de semana', () => {
  assert.equal(puntajeDia(dia(), '2026-11-09'), 1);
  assert.equal(puntajeDia({}, '2026-11-09'), 0);
  assert.equal(puntajeDia({ read: true, waterMl: 1200, gymMin: 45 }, '2026-11-09'), 0.5);
  assert.equal(puntajeDia({ read: true, weightKg: 80, gymMin: 60, waterMl: 1000, rooms: ['bano'] }, '2026-11-14'), 1, 'sábado: 5 de 5');
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
  for (let w = 0; w < 4; w++) for (let q = 0; q < 7; q++) inp[addD(START, w * 7 + q)] = { weightKg: 90 - w * 1.5, ...(q === 1 ? { lifts: { 'Press de pecho': [{ w: 60, r: 12, ok: true }] }, feel: { 'Press de pecho': 'd' }, gymMin: 400 } : {}) };
  const r = sugerencias(inp, START, addD(START, 21));            // semana de referencia = índice 2 (máxima)
  const temas = r.map(x => x.tema);
  assert.ok(temas.includes('Peso')); assert.match(r.find(x => x.tema === 'Peso')!.texto, /200 kcal/);
  assert.match(r.find(x => x.texto.includes('Press de pecho'))!.texto, /Bajá un 5-10%/, 'duro: baja la carga');
  assert.ok(temas.includes('Lectura') && temas.includes('Agua') && temas.includes('Orden'));
  void hoy;
});
