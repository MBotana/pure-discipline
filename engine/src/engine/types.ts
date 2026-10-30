export type Cat = 'F' | 'I' | 'V' | 'D' | 'O'; // Fuerza, Inteligencia, Vitalidad, Disciplina, Orden
export const CATS: readonly Cat[] = ['F', 'I', 'V', 'D', 'O'];

/** Lo que el usuario registró en un día. Todo opcional; ausente = no hecho. */
export interface DayInput {
  gym?: boolean;        // sesión de Fuerza
  read?: boolean;       // sesión de Inteligencia
  aero?: boolean;       // sesión de Vitalidad
  clean?: boolean;      // ambiente ordenado (Orden)
  dwork?: boolean;      // día de trabajo del objetivo de Disciplina
  improve?: boolean;    // día de trabajo de la mejora mensual (Orden)
  bookTramo?: boolean;  // tramo del libro completado (Inteligencia mensual)
  dcheck?: boolean;     // chequeo "al día" de Disciplina (solo miércoles y domingo)
  anti?: boolean;       // domingo: true = NO violó ningún antiobjetivo
  feed?: boolean;       // domingo: semana de alimentación perfecta
  equip?: Cat;          // cambiar mascota equipada (se aplica al inicio del día)
}

export type EventKind = 'D' | 'W' | 'M'; // diaria, semanal, mensual
export type Outcome = 'paid' | 'lost_block' | 'lost_clamp';

export interface AuditEvent {
  day: number; cat: Cat; kind: EventKind;
  base: number; mult: number; amount: number;
  outcome: Outcome; paid: number; gate?: number;
}

export interface BlockLog { gate: number; start: number; end: number | null; streak: boolean; stats: boolean }

export interface Config {
  startDate: string;            // lunes ISO (YYYY-MM-DD)
  d: number; W: number; Mp: number;
  r: number; A: number;
  weeklyBonus: number[];
  gymM: number; aeroM: number; bookTramos: number; impUnits: number; dchk: number; namb: number;
  statPw: number; statPen: number; statScale: number; reqScale: number; freezeDays: number;
  hingeEvery: number;
  combos: [Cat, Cat][];
  streakGates: Record<number, number>;
  discPen: boolean;
  petRatio: number; petCosts: number[]; petWeek: number;
  /** true = solo la mascota equipada aporta a la puerta (regla del diseño). false = paridad con el simulador. */
  petsMustBeEquipped: boolean;
}

export interface GateDef { stats?: [Cat, Cat]; req?: number; streak?: number }

export interface State {
  day: number;                   // próximo día a procesar (0 = primer lunes)
  xp: number;
  cleared: number[];
  blocked: number | null;
  stat: Record<Cat, number>;
  s: number;                     // racha mensual
  px: Record<Cat, number>;       // XP de mascota
  equipped: Cat;
  feedStreak: number;
  wstreak: number;
  // acumuladores del mes
  multM: number; mu: Record<Cat, number>; mdone: Cat[]; bd: number;
  // acumuladores de la semana
  bonusW: number; wu: Record<Cat, number>; wdone: Cat[];
  // registros
  arrive: Record<number, number>; clearedDay: Record<number, number>;
  blocks: BlockLog[];
  tower: number | null;
  lostBlock: number; lostClamp: number; statWasted: number; discPenN: number;
}
