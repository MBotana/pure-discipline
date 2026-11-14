/** Gasto del día (modo corte): kcal del gimnasio calculadas por tiempo y peso + aeróbico cargado a mano. Puro, sin dependencias. */
export const GASTO = {
  desde: '2026-11-14',        // a partir del sábado 14/11 el gasto es una misión diaria (hasta el 25/12); sin rampa
  meta: 900, metaDom: 500,    // modo 25/12: kcal activas por día (domingo: un poco menos)
  kcalMeta: 1500,             // meta de comida: lo que pase de acá se suma a la meta de gasto del día (1 kcal por kcal)
  kcalIgn: 50,                // se ignora un pasaje de hasta 50 kcal (el error de la estimación)
  compMax: 400,               // tope de la compensación diaria: más que eso no se paga corriendo, lo absorbe el control semanal de peso
  kgDef: 87,                  // peso si todavía no hay ningún pesaje
  metPesas: 5, metBoxeo: 7.8, // MET de una sesión de pesas (con descansos) y de una clase de boxeo
  boxeo: [0, 2],              // días de la rutina que son boxeo (0 = lunes)
};
/** Actividades aeróbicas para cargar por minutos: [clave, texto, MET]. */
export const AERO: readonly [string, string, number][] = [['bici', 'de bici', 7.5], ['trote', 'de trote', 9.8], ['soga', 'de soga', 11], ['caminata', 'de caminata rápida', 4.3]];
/** kcal ACTIVAS por minuto (sin contar lo que el cuerpo gasta igual en reposo): (MET − 1) × 3,5 × kg / 200. Así es comparable con lo que mide un reloj. */
export const kpm = (met: number, kg: number) => Math.round((met - 1) * 3.5 * kg / 200 * 10) / 10;
export const esBoxeo = (inp: any, dowL: number) => GASTO.boxeo.includes(inp?.rut ?? dowL);
/** La comida puntúa de lunes a viernes; durante el modo 25/12 (desde el sábado 14/11), también el fin de semana: no hay permitidos. */
export const CORTE = { desde: '2026-11-14', hasta: '2026-12-25' };
export const gastoCuenta = (fecha: string) => fecha >= GASTO.desde && fecha <= CORTE.hasta;
export const comidaPuntua = (fecha: string) => { const d = (new Date(fecha + 'T00:00:00Z').getUTCDay() + 6) % 7; return d < 5 || (fecha >= CORTE.desde && fecha <= CORTE.hasta); };
export const metaGasto = (dowL: number) => (dowL === 6 ? GASTO.metaDom : GASTO.meta);
/** Calorías comidas por encima de la meta de 1.500 (según lo que registró la IA ese día). */
export const exceso = (inp: any) => Math.max(0, Math.round(Number(inp?.kcalDia) || 0) - GASTO.kcalMeta);
/** kcal extra que hay que quemar por pasarse de la meta: 1 a 1 (de a 10), con tope diario. */
export const compensa = (inp: any) => { const e = exceso(inp); return e <= GASTO.kcalIgn ? 0 : Math.min(GASTO.compMax, Math.round(e / 10) * 10); };
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
/** dowL: 0 = lunes. kg: último peso conocido hasta ese día. extra: kcal sumadas por controles fallados.
 *  Meta del día = base (900, domingo 500) + extra de controles + compensación por pasarse de 1.500 kcal. Pausa por salud (inp.modo): sin meta. */
export function gastoDia(inp: any, dowL: number, kg: number, extra = 0) {
  const min = inp?.gymMin ?? (inp?.gym ? 60 : 0), box = esBoxeo(inp, dowL), k = kpm(box ? GASTO.metBoxeo : GASTO.metPesas, kg || GASTO.kgDef);
  const pausa = inp?.modo === 'pausa', gym = Math.round(min * k), aero = Math.round(Number(inp?.aeroKcal) || 0);
  const exc = pausa ? 0 : exceso(inp), comp = pausa ? 0 : compensa(inp), base = metaGasto(dowL);
  return { min, box, kpm: k, gym, aero, total: gym + aero, base, exc, comp, extra: pausa ? 0 : extra, meta: pausa ? 0 : base + extra + comp, pausa };
}
export const gastoOk = (inp: any, dowL: number, kg: number, extra = 0) => { const g = gastoDia(inp, dowL, kg, extra); return g.total >= g.meta; };
/** Castigo: pasarse de 1.500 kcal anula la misión de Comida del día hasta que se cierre la meta de gasto (que ya incluye la compensación). */
export const castigada = (inp: any, dowL: number, kg: number, extra = 0) => { const g = gastoDia(inp, dowL, kg, extra); return g.comp > 0 && g.total < g.meta; };
