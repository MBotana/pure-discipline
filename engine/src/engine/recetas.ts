/** Recetas del modo corte (solo con los ingredientes del plan) y recomendador de la próxima comida. Puro, sin dependencias.
 *  Valores aproximados con ingredientes crudos pesados en crudo: k = kcal, p = proteína (g), c = carbohidratos (g). */
export interface Receta { id: string; n: string; d: string; k: number; p: number; c: number; base?: boolean }
export const RECETAS: readonly Receta[] = [
  { id: 'omelette', base: true, n: 'Omelette de 4 huevos con queso untable', d: '4 huevos, 30 g de queso untable light, 50 g de cebolla y 100 g de tomates cherry', k: 370, p: 30, c: 12 },
  { id: 'peceto-ensalada', base: true, n: 'Peceto a la plancha con ensalada', d: '330 g de peceto (crudo) a la plancha, 100 g de rúcula, 100 g de cherry, 30 g de zanahoria rallada, 10 g de queso de rallar, limón y sal', k: 570, p: 82, c: 11 },
  { id: 'yogur-rojos', base: true, n: 'Yogur griego con frutos rojos y almendras', d: '200 g de yogur griego natural, 40 g de frutos rojos y 15 g de almendras', k: 225, p: 24, c: 15 },
  { id: 'batido', base: true, n: 'Batido de whey con leche proteica', d: '1 scoop (30 g) de whey isolate en 250 ml de leche proteica', k: 245, p: 51, c: 11 },
  { id: 'peceto-rucula', n: 'Peceto con rúcula', d: '250 g de peceto (crudo) a la plancha, 100 g de rúcula, limón y sal', k: 380, p: 59, c: 4 },
  { id: 'peceto-xl', n: 'Peceto doble con rúcula', d: '400 g de peceto (crudo) a la plancha, 100 g de rúcula, limón y sal', k: 600, p: 93, c: 4 },
  { id: 'peceto-cherry', n: 'Peceto con cherry y cebolla asados', d: '300 g de peceto (crudo), 150 g de cherry y 50 g de cebolla, al horno o a la plancha', k: 475, p: 69, c: 10 },
  { id: 'ensalada-fria', n: 'Ensalada de peceto frío', d: '200 g de peceto (crudo) cocido y enfriado, 100 g de rúcula, 100 g de cherry y 10 g de queso de rallar', k: 370, p: 52, c: 8 },
  { id: 'tortilla', n: 'Tortilla de huevo y cebolla', d: '3 huevos, 50 g de cebolla y 10 g de queso de rallar', k: 275, p: 23, c: 6 },
  { id: 'omelette-liviano', n: 'Omelette liviano con rúcula', d: '3 huevos, 50 g de rúcula y 100 g de cherry', k: 245, p: 21, c: 7 },
  { id: 'yogur-whey', n: 'Yogur proteico', d: '200 g de yogur griego natural mezclado con 15 g de whey', k: 175, p: 33, c: 8 },
  { id: 'leche', n: 'Leche proteica', d: '250 ml de leche proteica sin azúcar', k: 130, p: 25, c: 10 },
  { id: 'whey-agua', n: 'Whey con agua', d: '1 scoop (30 g) de whey isolate en 300 ml de agua', k: 115, p: 26, c: 1 },
];
export const fmtReceta = (r: Receta) => `${r.n}: ${r.d} · ~${r.k} kcal · ${r.p} g de proteína · ${r.c} g de carbohidratos`;
export interface Tot { k: number; p: number; c: number }
/** Qué comer a continuación según lo ya comido hoy (metas: 1.500 kcal máx., 185 g de proteína, 50 g de carbohidratos máx.). */
export function recomendar(t: Tot, meta = { k: 1500, p: 185, c: 50 }): { r: Receta | null; why: string } {
  const K = meta.k - t.k, P = meta.p - t.p, C = meta.c - t.c;
  const porId = (id: string) => RECETAS.find(x => x.id === id)!;
  if (t.k <= 0 && t.p <= 0) return { r: porId('omelette'), why: 'Arranque del día: proteína completa y pocos carbohidratos.' };
  if (P <= 0) return { r: null, why: K < 0 ? `Ya llegaste a la proteína y te pasaste ${Math.round(-K)} kcal: no comas más, cerrá con agua o café.` : 'Ya llegaste a la proteína: no hace falta comer más.' };
  if (K <= 0 || C < 1) {
    return { r: porId('whey-agua'), why: K <= 0 ? `Te pasaste de las 1.500 kcal y te faltan ${Math.round(P)} g de proteína: lo más liviano que suma proteína.` : `Te quedaste sin carbohidratos y te faltan ${Math.round(P)} g de proteína: lo que suma proteína con casi 0 de carbohidratos.` };
  }
  const cand = RECETAS.filter(r => r.k <= K + GASTO_IGN && r.c <= C + 1);
  if (!cand.length) return { r: porId('whey-agua'), why: `Con ${Math.round(K)} kcal y ${Math.round(C)} g de carbohidratos de margen, es lo que mejor entra para sumar proteína.` };
  const score = (r: Receta) => Math.min(r.p, P) - 0.04 * r.k - 0.3 * Math.max(0, r.c - C * 0.6);
  const r = cand.reduce((a, b) => (score(b) > score(a) ? b : a));
  const rest = Math.round(P - Math.min(r.p, P));
  return { r, why: `Te faltan ${Math.round(P)} g de proteína y ${Math.round(K)} kcal de margen${rest > 0 ? `; con esto quedan ${rest} g por cubrir` : ': con esto cerrás la proteína'}.` };
}
const GASTO_IGN = 50;
