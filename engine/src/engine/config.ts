import type { Cat, Config } from './types.ts';

const COMBOS = [['F', 'I'], ['I', 'O'], ['O', 'D'], ['D', 'V'], ['V', 'F'], ['F', 'O'], ['I', 'D'], ['O', 'V'], ['D', 'F'], ['F', 'I']] as [Cat, Cat][];

/**
 * Balance v1.3 (curva rápida al principio y lenta al final).
 * Año perfecto desde el lunes 2-nov-2026: piso 100 abierto alrededor del 31-dic-2027, 0 XP perdido,
 * nunca más de un piso por día. Ver Life_Reset_66_especificacion_v1.1_cambios.md (v1.3).
 */
export const DEFAULT_CONFIG: Config = {
  startDate: '2026-11-02',
  d: 50, W: 300, Mp: 1500,
  r: 1.03, A: 436,                  // costo del piso n → n+1 = 436 · 1,03^(n−1): 436 XP el primero, ~7.900 el último (v1.6, ver especificación)
  weeklyBonus: [0, 0.2, 0.3, 0.4, 0.5],
  gymM: 16, aeroM: 12, bookTramos: 10, impUnits: 6, dchk: 2, namb: 5, foodDays: 4, dripDays: 6,   // gimnasio: 16 sesiones al mes (4 por semana); comida: 4 de los 5 días de lunes a viernes (el fin de semana es libre)
  statPw: 1, statPen: 1, statScale: 0.5, reqScale: 0.9, freezeDays: 14,
  hingeEvery: 10,
  combos: COMBOS,
  // Requisitos: lo que un jugador perfecto ya tiene dos semanas antes de llegar (máximo 90 % del tope).
  statReq: { 10: 1, 20: 2, 30: 4, 40: 7, 50: 12, 60: 15, 70: 20, 80: 29, 90: 40, 100: 45 },
  streakGates: { 25: 1, 50: 2, 75: 3, 100: 4 },
  multStep: 0.5, multMax: 3,        // racha 1 mes ×1,5 · 2 ×2 · 3 ×2,5 · 4 o más ×3
  dayFloorCap: 1,                   // nunca más de un piso por día: el XP se suma igual y el piso lo alcanza en los días siguientes
  dailyMult: true,                  // las diarias también se multiplican por la racha
  payOnComplete: true,              // v1.6: misiones todo o nada, cobradas al cierre: la semana el domingo, el mes el lunes siguiente
  monthPayNextDay: true,
  lumpPct: { W: 0.08, M: 0.06 },    // cada semanal cumplida = 8 % del costo del piso actual; cada mensual = 6 % (sin multiplicador: la racha multiplica las diarias)
  weekendComp: true,                // v1.5: el fin de semana solo compensa días perdidos de lunes a viernes
  gameCapH: 15, gameGraceWeeks: 0,  // v1.5: Disciplina por horas de videojuegos (≤100 % cumple · 100–120 % no suma · >120 % resta 1); sin semanas de prueba
  discPen: true,
  petRatio: 0.1, petCosts: [10, 13, 17, 20, 30], petWeek: 10,
  petsMustBeEquipped: true,
};

/** Balance v1.2 (curva lineal en el tiempo, multiplicador sin tope). Lo usan las pruebas de paridad con el simulador v7. */
export const LEGACY_CONFIG: Config = {
  ...DEFAULT_CONFIG,
  r: 1.015, A: 5000,
  statReq: undefined,
  streakGates: { 25: 2, 50: 4, 75: 6, 100: 8 },
  multStep: 1, multMax: Infinity,
  namb: 6, gymM: 18, foodDays: 4,
  dayFloorCap: 0, dailyMult: false, foodRule: undefined, payOnComplete: false, monthPayNextDay: false, lumpPct: undefined,
  weekendComp: false, gameCapH: undefined, gameGraceWeeks: undefined,
};
