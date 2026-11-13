/** Gasto del día (modo corte): kcal del gimnasio calculadas por tiempo y peso + aeróbico cargado a mano. Puro, sin dependencias. */
export const GASTO = {
  desde: '2026-11-13',        // a partir de este día el gasto es una misión diaria
  meta: 900, metaDom: 500,    // modo 25/12: kcal activas por día (domingo: un poco menos)
  kgDef: 87,                  // peso si todavía no hay ningún pesaje
  metPesas: 5, metBoxeo: 7.8, // MET de una sesión de pesas (con descansos) y de una clase de boxeo
  boxeo: [0, 2],              // días de la rutina que son boxeo (0 = lunes)
};
/** Actividades aeróbicas para cargar por minutos: [clave, texto, MET]. */
export const AERO: readonly [string, string, number][] = [['bici', 'de bici', 7.5], ['trote', 'de trote', 9.8], ['soga', 'de soga', 11], ['caminata', 'de caminata rápida', 4.3]];
/** kcal ACTIVAS por minuto (sin contar lo que el cuerpo gasta igual en reposo): (MET − 1) × 3,5 × kg / 200. Así es comparable con lo que mide un reloj. */
export const kpm = (met: number, kg: number) => Math.round((met - 1) * 3.5 * kg / 200 * 10) / 10;
export const esBoxeo = (inp: any, dowL: number) => GASTO.boxeo.includes(inp?.rut ?? dowL);
export const gastoCuenta = (fecha: string) => fecha >= GASTO.desde;
export const metaGasto = (dowL: number) => (dowL === 6 ? GASTO.metaDom : GASTO.meta);
/** Controles del modo 25/12 (pesaje del viernes en ayunas): [fecha, peso máximo]. */
export const CONTROLES: readonly [string, number][] = [['2026-11-20', 85.5], ['2026-11-27', 84.3], ['2026-12-04', 83], ['2026-12-11', 81.8], ['2026-12-18', 80.6], ['2026-12-25', 79.9]];
export const EXTRA_KCAL = 150;
/** Peso de un control: el del día o, si ese día no te pesaste, el último de los 2 días anteriores. null = no te pesaste. */
export function pesoControl(pesos: Record<string, number>, fecha: string): number | null {
  for (let q = 0; q < 3; q++) { const d = new Date(Date.parse(fecha) - q * 864e5).toISOString().slice(0, 10); if (pesos[d] > 0) return pesos[d]; }
  return null;
}
/** Controles ya pasados (antes de "fecha") y si llegaste. Cada control fallado (o sin pesaje) suma EXTRA_KCAL a la meta de gasto desde el día siguiente. */
export function controles(pesos: Record<string, number>, fecha: string) {
  return CONTROLES.map(([d, max]) => { const kg = d < fecha ? pesoControl(pesos, d) : null; return { d, max, kg, pasado: d < fecha, ok: kg !== null && kg <= max }; });
}
export const extraGasto = (pesos: Record<string, number>, fecha: string) => controles(pesos, fecha).filter(c => c.pasado && !c.ok).length * EXTRA_KCAL;
/** dowL: 0 = lunes. kg: último peso conocido hasta ese día. extra: kcal sumadas por controles fallados. */
export function gastoDia(inp: any, dowL: number, kg: number, extra = 0) {
  const min = inp?.gymMin ?? (inp?.gym ? 60 : 0), box = esBoxeo(inp, dowL), k = kpm(box ? GASTO.metBoxeo : GASTO.metPesas, kg || GASTO.kgDef);
  const gym = Math.round(min * k), aero = Math.round(Number(inp?.aeroKcal) || 0);
  return { min, box, kpm: k, gym, aero, total: gym + aero, meta: metaGasto(dowL) + extra, extra };
}
export const gastoOk = (inp: any, dowL: number, kg: number, extra = 0) => { const g = gastoDia(inp, dowL, kg, extra); return g.total >= g.meta; };
