/** Gasto del día (modo corte): kcal del gimnasio calculadas por tiempo y peso + aeróbico cargado a mano. Puro, sin dependencias. */
export const GASTO = {
  desde: '2026-11-13',        // a partir de este día el gasto es una misión diaria
  meta: 700, metaDom: 350,    // kcal activas por día (domingo: descanso activo)
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
/** dowL: 0 = lunes. kg: último peso conocido hasta ese día. */
export function gastoDia(inp: any, dowL: number, kg: number) {
  const min = inp?.gymMin ?? (inp?.gym ? 60 : 0), box = esBoxeo(inp, dowL), k = kpm(box ? GASTO.metBoxeo : GASTO.metPesas, kg || GASTO.kgDef);
  const gym = Math.round(min * k), aero = Math.round(Number(inp?.aeroKcal) || 0);
  return { min, box, kpm: k, gym, aero, total: gym + aero, meta: metaGasto(dowL) };
}
export const gastoOk = (inp: any, dowL: number, kg: number) => { const g = gastoDia(inp, dowL, kg); return g.total >= g.meta; };
