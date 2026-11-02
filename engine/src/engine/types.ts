export type Cat = 'F' | 'I' | 'V' | 'D' | 'O'; // Fuerza, Inteligencia, Vitalidad, Disciplina, Orden
export const ROOMS = ['cocina', 'bano', 'habitacion', 'living', 'oficina', 'patio'] as const;
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
  // --- modo v1.1 (aditivo): formulario del domingo, videojuegos y comida diarios ---
  dweek?: boolean;      // domingo: misión semanal de Disciplina cumplida (pago de las 3 unidades de una vez)
  dform?: boolean;      // domingo: el formulario de cierre fue respondido
  phone?: boolean;      // domingo: el promedio semanal de celular superó las 5 h (antiobjetivo violado)
  gaming?: number;      // sesiones de videojuegos de ese día (la semana permite hasta 3)
  food?: boolean;       // misión diaria de alimentación cumplida (4 días en la semana alimentan a la mascota)
  book?: boolean;       // libro terminado (misión mensual de Inteligencia, una sola unidad)
  repair?: boolean;     // arreglo en la casa (misión mensual de Orden, una sola unidad)
  room?: string;        // ambiente limpiado ese día (cada uno cuenta una vez por semana)
  equip?: Cat;          // cambiar mascota equipada equipada (se aplica al inicio del día)
}

export type EventKind = 'D' | 'W' | 'M' | 'C'; // diaria, semanal, mensual, diferido (sobrante de un día que ya subió un piso)
export type Outcome = 'paid' | 'lost_block' | 'lost_clamp';

export interface AuditEvent {
  day: number; cat: Cat; kind: EventKind;
  base: number; mult: number; amount: number;
  outcome: Outcome; paid: number; gate?: number;
  deferred?: number;   // XP que no entró hoy por el límite de pisos por día; se cobra al día siguiente
}

export interface BlockLog { gate: number; start: number; end: number | null; streak: boolean; stats: boolean }

export interface Config {
  startDate: string;            // lunes ISO (YYYY-MM-DD)
  d: number; W: number; Mp: number;
  r: number; A: number;
  weeklyBonus: number[];
  gymM: number; aeroM: number; bookTramos: number; impUnits: number; dchk: number; namb: number; foodDays: number; dripDays: number;
  statPw: number; statPen: number; statScale: number; reqScale: number; freezeDays: number;
  hingeEvery: number;
  combos: [Cat, Cat][];
  streakGates: Record<number, number>;
  statReq?: Record<number, number>;   // requisito explícito por visagra (si falta, se usa reqScale·statScale·piso)
  multStep?: number;                  // multiplicador por mes de racha: 1 + multStep·s (por defecto 1)
  multMax?: number;                   // tope del multiplicador (por defecto sin tope)
  dayFloorCap?: number;               // máximo de pisos por día; el sobrante pasa al día siguiente (0 o ausente = sin límite)
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
  gameWk: number; foodWk: number; roomsWk: string[];
  drips: { cat: Cat; base: number; mult: number; left: number }[]; // pagos fraccionados de misiones mensuales de una sola unidad
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
  carry?: Record<Cat, number>;   // XP diferido al día siguiente por el límite de pisos por día
}
