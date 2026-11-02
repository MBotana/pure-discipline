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
  food?: boolean;       // misión diaria de alimentación cumplida (modo v1.1: 4 días en la semana alimentan a la mascota)
  // --- v1.4: registro de comidas del día (se puede tildar más de una) ---
  meat?: boolean;       // comió carne
  veg?: boolean;        // comió verduras
  junk?: boolean;       // comió comida basura
  meals?: boolean;      // el registro de comidas del día fue confirmado
  book?: boolean;       // libro terminado (misión mensual de Inteligencia, una sola unidad)
  repair?: boolean;     // arreglo en la casa (misión mensual de Orden, una sola unidad)
  room?: string;        // ambiente limpiado ese día (cada uno cuenta una vez por semana)
  // --- v1.5 ---
  rooms?: string[];     // varios ambientes limpiados el mismo día (cada uno cuenta una vez por semana)
  gameH?: number;       // horas de videojuegos de ese día (el tope semanal es gameCapH)
  books?: { t: string; a?: string }[]; // libros terminados ese día (el primero del mes cumple la misión mensual de Inteligencia)
  equip?: Cat;          // cambiar mascota equipada equipada (se aplica al inicio del día)
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
  gymM: number; aeroM: number; bookTramos: number; impUnits: number; dchk: number; namb: number; foodDays: number; dripDays: number;
  statPw: number; statPen: number; statScale: number; reqScale: number; freezeDays: number;
  hingeEvery: number;
  combos: [Cat, Cat][];
  streakGates: Record<number, number>;
  statReq?: Record<number, number>;   // requisito explícito por visagra (si falta, se usa reqScale·statScale·piso)
  multStep?: number;                  // multiplicador por mes de racha: 1 + multStep·s (por defecto 1)
  multMax?: number;                   // tope del multiplicador (por defecto sin tope)
  dayFloorCap?: number;               // máximo de pisos por día: el XP se suma igual, el piso alcanza al XP en los días siguientes (0 o ausente = sin límite)
  dailyMult?: boolean;                // las diarias también se multiplican por la racha (por defecto no)
  foodRule?: { meat: number; veg: number; junkMax: number }; // semanal de alimentación por tipo de comida (si falta: foodDays días aprobados)
  weekendComp?: boolean;              // sábado y domingo pagan la diaria solo si faltó un día de lunes a viernes (máximo 5 diarias pagadas por semana y categoría)
  gameCapH?: number;                  // tope semanal de horas de videojuegos; si falta, rige el modo de sesiones (anti)
  gameGraceWeeks?: number;            // semanas iniciales en que las horas se miden pero no se premian ni castigan
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
  fl?: number;                   // piso alcanzado (solo con dayFloorCap: sube como máximo dayFloorCap por día)
  meatWk?: number; vegWk?: number; junkWk?: number; // días de la semana con carne, verduras y basura
  gameHWk?: number;              // horas de videojuegos de la semana
  dpaid?: Record<Cat, number>;   // diarias pagadas en la semana, por categoría (tope 5 con compensación de fin de semana)
}
