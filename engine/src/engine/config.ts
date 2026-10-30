import type { Cat, Config } from './types.ts';

export const DEFAULT_CONFIG: Config = {
  startDate: '2026-11-02',
  d: 50, W: 300, Mp: 1500,
  r: 1.015, A: 5150,
  weeklyBonus: [0, 0.2, 0.3, 0.4, 0.5],
  gymM: 18, aeroM: 12, bookTramos: 10, impUnits: 6, dchk: 2, namb: 6, foodDays: 4,
  statPw: 1, statPen: 1, statScale: 0.5, reqScale: 0.9, freezeDays: 14,
  hingeEvery: 10,
  combos: [['F', 'I'], ['I', 'O'], ['O', 'D'], ['D', 'V'], ['V', 'F'], ['F', 'O'], ['I', 'D'], ['O', 'V'], ['D', 'F'], ['F', 'I']] as [Cat, Cat][],
  streakGates: { 25: 2, 50: 4, 75: 6, 100: 8 },
  discPen: true,
  petRatio: 0.1, petCosts: [10, 13, 17, 20, 30], petWeek: 10,
  petsMustBeEquipped: true,
};
