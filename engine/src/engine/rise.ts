/**
 * Rise — motor v3 (especificación v3.0). Estadísticas de 1 a 99 con curva tipo RuneScape, nivel del héroe = promedio
 * de las estadísticas efectivas (héroe + puntos de la mascota), títulos que piden un mínimo en las cinco estadísticas,
 * mascota que sube por constancia y progreso en el gimnasio y tiene sus propios títulos.
 * Nada baja nunca. Es determinista: se rehace desde el día 0 con las entradas diarias guardadas.
 */
import { dateOfDay } from './calendar.ts';
import { gastoDia, gastoCuenta, GASTO, extraGasto, comidaPuntua, castigada } from './gasto.ts';
export { GASTO, AERO, kpm, gastoDia, gastoOk, gastoCuenta, metaGasto, CONTROLES, controles, extraGasto, EXTRA_KCAL, comidaPuntua, castigada, exceso, compensa } from './gasto.ts';

export type Cat = 'F' | 'I' | 'V' | 'D' | 'O';
export const CATS: readonly Cat[] = ['F', 'I', 'V', 'D', 'O'];
export const ROOMS = ['cocina', 'bano', 'habitacion', 'living', 'oficina', 'patio'] as const;

/** Lo registrado en un día. Todo opcional; ausente = no hecho. Compatible con los datos guardados hasta v1.6. */
export interface RiseInput {
  gymMin?: number;                 // minutos de gimnasio o boxeo (presencia por ubicación)
  gym?: boolean;                   // v1.x: sesión sin minutos conocidos (se asumen 60)
  read?: boolean;                  // «Leí hoy»
  rooms?: string[];                // ambientes limpiados ese día
  foodPct?: number;                // 0..1, lo que Gemini puntúa del día (L–V)
  food?: boolean;                  // v1.x: aprobado = 100 %, cerrado sin aprobar = 50 %
  water?: boolean;                 // meta de agua cumplida
  waterMl?: number;                // agua tomada (la meta es 1 litro)
  weightKg?: number;               // peso en ayunas (misión diaria de Vitalidad)
  aeroKcal?: number;               // kcal de aeróbico cargadas a mano (se suman al gimnasio para el gasto del día)
  rut?: number;                    // rutina elegida para el día (0 = lunes)
  closed?: boolean;                // el día fue confirmado a mano (solo la app lo usa)
  meals?: boolean;                 // el análisis de comida del día quedó cerrado
  gameH?: number;                  // horas de videojuegos
  books?: { t: string; a?: string }[];
  repairs?: { t: string }[];
  prog?: string[];                 // ejercicios con progreso válido ese día (carga: más peso; descarga: más repeticiones)
  alloc?: Cat[];                   // puntos de la mascota que elegiste asignar ese día
}

export interface RiseConfig {
  startDate: string;               // lunes ISO
  xpA: number; xpB: number; xpScale: number; statMax: number; balanceGap: number;
  sessionMin: number;              // minutos para que una visita cuente como sesión
  fuerzaPerMin: number; fuerzaCapMin: number; fuerzaWeekMin: number; fuerzaMonthMin: number; fuerzaW: number; fuerzaM: number;
  readXp: number; bookFirst: number; bookNext: number;
  foodDay: number; waterXp: number; weighXp: number; gastoXp: number; foodThr: number; vitW: number; vitM: number;
  cleanFirst: number; cleanExtra: number; cleanDaysMax: number; cleanRoomsWeek: number; ordenW: number; repairFirst: number; repairNext: number;
  gameCapH: number; discW: number; discM: number;
  petA: number; petR: number; petMax: number; petStatMax: number;
  sessXp: number; sessMax: number; progXp: number; progWeekBonus: number; cycleBonus: number; cycleNeed: number; cycleWeeks: number;
}

export const RISE: RiseConfig = {
  startDate: '2026-11-09',
  xpA: 300, xpB: 15, xpScale: 0.8, statMax: 99, balanceGap: 15,
  sessionMin: 40,
  fuerzaPerMin: 1.6, fuerzaCapMin: 1440, fuerzaWeekMin: 360, fuerzaMonthMin: 1440, fuerzaW: 250, fuerzaM: 650,
  readXp: 60, bookFirst: 2500, bookNext: 1250,
  foodDay: 105, waterXp: 15, weighXp: 15, gastoXp: 60, foodThr: 0.8, vitW: 250, vitM: 650,
  cleanFirst: 100, cleanExtra: 40, cleanDaysMax: 5, cleanRoomsWeek: 5, ordenW: 250, repairFirst: 1100, repairNext: 550,
  gameCapH: 15, discW: 750, discM: 1100,
  petA: 369.1, petR: 1.03, petMax: 100, petStatMax: 0,   // la bestia ya no reparte puntos: solo nivel y títulos
  sessXp: 100, sessMax: 5, progXp: 150, progWeekBonus: 300, cycleBonus: 1000, cycleNeed: 4, cycleWeeks: 4,
};

/** Títulos del héroe: piden promedio de estadísticas efectivas ≥ avg y ninguna más de balanceGap niveles por debajo. */
export const HERO_TITLES: readonly { avg: number; name: string }[] = [
  { avg: 1, name: 'Recién despertado' }, { avg: 10, name: 'Aprendiz' }, { avg: 20, name: 'Constante' },
  { avg: 30, name: 'Templado' }, { avg: 40, name: 'Curtido' }, { avg: 50, name: 'Veterano' },
  { avg: 60, name: 'Forjado' }, { avg: 70, name: 'Imparable' }, { avg: 80, name: 'Maestro' },
  { avg: 90, name: 'Leyenda' }, { avg: 99, name: 'Inmortal' },
];
/** Títulos de la mascota: por nivel. */
export const PET_TITLES: readonly { lvl: number; name: string }[] = [
  { lvl: 1, name: 'Cría de sombra' }, { lvl: 10, name: 'Sombra joven' }, { lvl: 20, name: 'Cazador' },
  { lvl: 35, name: 'Bestia curtida' }, { lvl: 50, name: 'Devorador' }, { lvl: 65, name: 'Terror nocturno' },
  { lvl: 80, name: 'Señor del abismo' }, { lvl: 100, name: 'Bestia suprema' },
];

const zero = (): Record<Cat, number> => ({ F: 0, I: 0, V: 0, D: 0, O: 0 });

/** Multiplicador de la mascota: k = semana de racha (1 = primera), idx = sesión de la semana (0..4). No se suman: se reemplazan. */
export function ladder(k: number, idx: number): number {
  if (k <= 1) return 1 + 0.125 * Math.min(idx, 4);
  if (k <= 4) return [0, 0, 2, 2.25, 2.5][k];
  return Math.min(6, 3 + 0.5 * Math.floor((k - 5) / 4));
}
/** Sesiones mínimas de la semana para no cortar la racha. */
export const needSessions = (k: number): number => (k <= 1 ? 5 : k <= 4 ? 4 : 3);

export interface RiseState {
  day: number;
  xp: Record<Cat, number>;
  petXp: number;
  petAlloc: Record<Cat, number>;
  k: number;                       // semana de racha
  titles: Record<number, number>;  // índice de título del héroe → día en que se obtuvo
  petTitles: Record<number, number>;
  wk: { sess: number; min: number; cleanDays: number; rooms: string[]; food: number[]; gameH: number; prog: number };
  mo: { ym: string; min: number; food: number[]; books: number; repairs: number; discOk: boolean };
  cyc: string[];                   // ejercicios distintos con progreso en el ciclo de 4 semanas
  totals: { gym: number; books: number; repairs: number };
  kg?: number;                     // último peso registrado (para calcular el gasto del gimnasio)
  pesos?: Record<string, number>;  // pesajes por fecha (controles del modo 25/12)
}

export type EvKind = 'D' | 'W' | 'M';
export interface RiseEvent { day: number; cat: Cat | 'pet'; kind: EvKind; label: string; amount: number }
export interface RiseDay { day: number; date: string; events: RiseEvent[]; level: number; unlocked: number[]; petUnlocked: number[] }

export function initialRise(cfg: RiseConfig = RISE): RiseState {
  return {
    day: 0, xp: zero(), petXp: 0, petAlloc: zero(), k: 1, titles: {}, petTitles: {},
    wk: { sess: 0, min: 0, cleanDays: 0, rooms: [], food: [], gameH: 0, prog: 0 },
    mo: { ym: dateOfDay(cfg.startDate, 0).slice(0, 7), min: 0, food: [], books: 0, repairs: 0, discOk: true },
    cyc: [], totals: { gym: 0, books: 0, repairs: 0 },
  };
}

const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

export class Rise {
  readonly cfg: RiseConfig;
  state: RiseState;
  private cumStat: number[];
  private cumPet: number[];

  constructor(cfg: Partial<RiseConfig> = {}, state?: RiseState) {
    this.cfg = { ...RISE, ...cfg };
    this.state = state ? structuredClone(state) : initialRise(this.cfg);
    const c = this.cfg;
    // cumStat[L] = XP necesaria para ser nivel L (nivel 1 = 0 XP). Fórmula clásica de RuneScape con duplicación cada xpB niveles.
    this.cumStat = [0, 0]; let pts = 0;
    for (let L = 1; L < c.statMax; L++) { pts += Math.floor(L + c.xpA * Math.pow(2, L / c.xpB)); this.cumStat.push(Math.floor(pts / 4) * c.xpScale); }
    this.cumPet = [0]; for (let n = 0; n < c.petMax; n++) this.cumPet.push(this.cumPet[n] + c.petA * Math.pow(c.petR, n));
  }

  // ---------- consultas ----------
  /** XP total necesaria para llegar al nivel L (1..statMax). */
  xpForLevel(L: number): number { return this.cumStat[Math.max(1, Math.min(L, this.cfg.statMax))]; }
  statCost(L: number): number { return this.cumStat[L + 1] - this.cumStat[L]; }               // costo del nivel L → L+1
  statLevel(c: Cat): number { let L = 1; while (L < this.cfg.statMax && this.state.xp[c] >= this.cumStat[L + 1] - 1e-9) L++; return L; }
  statProgress(c: Cat) {
    const L = this.statLevel(c), max = L >= this.cfg.statMax, into = this.state.xp[c] - this.cumStat[L];
    return { level: L, max, into, cost: max ? 0 : this.statCost(L), pct: max ? 1 : into / this.statCost(L) };
  }
  /** Nivel del héroe: promedio de las estadísticas efectivas (héroe + mascota), de 1 a 99. */
  level(): number { return Math.min(this.cfg.statMax, Math.floor(CATS.reduce((a, c) => a + Math.min(this.cfg.statMax, this.eff(c)), 0) / CATS.length)); }
  /** Suma de los niveles de las cinco estadísticas (nivel total). */
  totalLevel(): number { return CATS.reduce((a, c) => a + this.statLevel(c), 0); }
  /** Título del héroe más alto obtenido (índice en HERO_TITLES). */
  titleIndex(): number { const ks = Object.keys(this.state.titles).map(Number); return ks.length ? Math.max(...ks) : 0; }
  titleName(): string { return HERO_TITLES[this.titleIndex()].name; }
  /** Qué falta para el próximo título: promedio requerido, mínimo por estadística y cuáles están por debajo. */
  nextTitle(): { index: number; name: string; avg: number; min: number; low: Cat[]; missingAvg: number } | null {
    const i = this.titleIndex() + 1; if (i >= HERO_TITLES.length) return null;
    const t = HERO_TITLES[i], min = Math.max(1, t.avg - this.cfg.balanceGap);
    return { index: i, name: t.name, avg: t.avg, min, low: CATS.filter(c => this.eff(c) < min), missingAvg: Math.max(0, t.avg - this.level()) };
  }
  petTitleIndex(): number { const ks = Object.keys(this.state.petTitles).map(Number); return ks.length ? Math.max(...ks) : -1; }
  petTitleName(): string { const i = this.petTitleIndex(); return i < 0 ? 'Huevo' : PET_TITLES[i].name; }
  petLevel(): number { let n = 0; while (n < this.cfg.petMax && this.state.petXp >= this.cumPet[n + 1] - 1e-9) n++; return n; }
  petProgress() {
    const n = this.petLevel(), max = n >= this.cfg.petMax, into = this.state.petXp - this.cumPet[n];
    const cost = this.cfg.petA * Math.pow(this.cfg.petR, n);
    return { level: n, max, into, cost: max ? 0 : cost, pct: max ? 1 : into / cost };
  }
  petPending(): number { return this.petLevel() - CATS.reduce((a, c) => a + this.state.petAlloc[c], 0); }
  /** Estadística efectiva: nivel del héroe + puntos que la mascota te dio en ella (hasta 20 por estadística). */
  eff(c: Cat): number { return this.statLevel(c) + this.state.petAlloc[c]; }
  /** Semana de ciclo: 3 de carga y 1 de descarga. */
  weekType(day: number): 'carga' | 'descarga' { return Math.floor(day / 7) % this.cfg.cycleWeeks === this.cfg.cycleWeeks - 1 ? 'descarga' : 'carga'; }
  streakMult(): number { return ladder(this.state.k, Math.min(this.state.wk.sess, this.cfg.sessMax - 1)); }

  // ---------- procesamiento de un día ----------
  processDay(raw: RiseInput = {}): RiseDay {
    const S = this.state, c = this.cfg, i = S.day;
    const date = dateOfDay(c.startDate, i), dd = i % 7, ym = date.slice(0, 7), w = Math.floor(i / 7);
    const ev: RiseEvent[] = [];
    const add = (cat: Cat | 'pet', kind: EvKind, label: string, amount: number) => {
      if (amount <= 0) return;
      ev.push({ day: i, cat, kind, label, amount });
      if (cat === 'pet') S.petXp += amount; else S.xp[cat] += amount;
    };
    const inp = normalize(raw, c);
    if (dd === 0) S.wk = { sess: 0, min: 0, cleanDays: 0, rooms: [], food: [], gameH: 0, prog: 0 };
    if (ym !== S.mo.ym) S.mo = { ym, min: 0, food: [], books: 0, repairs: 0, discOk: true };

    // Fuerza (gimnasio y boxeo) + constancia de la mascota
    const minutes = inp.gymMin ?? 0;
    if (minutes > 0) {
      add('F', 'D', 'Gimnasio', Math.min(minutes, c.fuerzaCapMin) * c.fuerzaPerMin);
      S.wk.min += minutes; S.mo.min += minutes; S.totals.gym += minutes;
    }
    if (minutes >= c.sessionMin) {
      if (S.wk.sess < c.sessMax) add('pet', 'D', 'Sesión', c.sessXp * ladder(S.k, S.wk.sess));
      S.wk.sess++;
    }
    for (const ex of inp.prog ?? []) {
      add('pet', 'D', 'Progreso: ' + ex, c.progXp * ladder(S.k, 4));
      S.wk.prog++; if (!S.cyc.includes(ex)) S.cyc.push(ex);
    }
    // Inteligencia
    if (inp.read) add('I', 'D', 'Lectura', c.readXp);
    for (const b of inp.books ?? []) {
      add('I', 'D', 'Libro: ' + b.t, S.mo.books === 0 ? c.bookFirst : c.bookNext); S.mo.books++; S.totals.books++;
    }
    // Orden
    const rooms = [...new Set(inp.rooms ?? [])];
    if (rooms.length) {
      if (S.wk.cleanDays < c.cleanDaysMax) add('O', 'D', 'Limpieza', c.cleanFirst);
      S.wk.cleanDays++;
      for (const r of rooms.slice(1)) if (!S.wk.rooms.includes(r)) add('O', 'D', 'Ambiente extra', c.cleanExtra);
      for (const r of rooms) if (!S.wk.rooms.includes(r)) S.wk.rooms.push(r);
    }
    for (const r of inp.repairs ?? []) { add('O', 'D', 'Arreglo: ' + r.t, S.mo.repairs === 0 ? c.repairFirst : c.repairNext); S.mo.repairs++; S.totals.repairs++; }
    // Vitalidad: comida de lunes a viernes (en el modo 25/12, todos los días), agua todos los días
    if (comidaPuntua(date)) {
      // Castigo: pasarse de 1.500 kcal anula la Comida del día hasta cerrar la meta de gasto (con la compensación).
      const cast = gastoCuenta(date) && castigada(inp, dd, inp.weightKg ?? S.kg ?? GASTO.kgDef, extraGasto(S.pesos ?? {}, date));
      const pct = cast ? 0 : Math.max(0, Math.min(1, inp.foodPct ?? 0));
      add('V', 'D', 'Comida', c.foodDay * pct);
      S.wk.food.push(pct); S.mo.food.push(pct);
    }
    if (inp.water) add('V', 'D', 'Agua', c.waterXp);
    if ((inp.weightKg ?? 0) > 0) { add('V', 'D', 'Peso', c.weighXp); S.kg = inp.weightKg; (S.pesos ??= {})[date] = inp.weightKg!; }
    if (gastoCuenta(date)) { const g = gastoDia(inp, dd, S.kg ?? GASTO.kgDef, extraGasto(S.pesos ?? {}, date)); if (g.total >= g.meta) add('V', 'D', 'Gasto del día', c.gastoXp); }
    // Disciplina
    if (inp.gameH) S.wk.gameH += inp.gameH;

    // cierre de semana (domingo)
    const nextYm = dateOfDay(c.startDate, i + 1).slice(0, 7);
    if (dd === 6) {
      if (S.wk.min >= c.fuerzaWeekMin) add('F', 'W', 'Semana en el gimnasio', c.fuerzaW);
      if (mean(S.wk.food) >= c.foodThr - 1e-9 && S.wk.food.length) add('V', 'W', 'Semana de comida', c.vitW);
      if (S.wk.rooms.length >= c.cleanRoomsWeek) add('O', 'W', 'Semana de orden', c.ordenW);
      if (S.wk.gameH <= c.gameCapH + 1e-9) add('D', 'W', 'Horas de juego en el tope', c.discW); else S.mo.discOk = false;
      if (S.wk.prog > 0) add('pet', 'W', 'Progreso semanal', c.progWeekBonus);
      if (this.weekType(i) === 'descarga') {
        if (S.cyc.length >= c.cycleNeed) add('pet', 'W', 'Ciclo completo', c.cycleBonus);
        S.cyc = [];
      }
      S.k = S.wk.sess >= needSessions(S.k) ? S.k + 1 : 1;
    }
    // cierre de mes
    if (nextYm !== ym) {
      if (S.mo.min >= c.fuerzaMonthMin) add('F', 'M', 'Mes en el gimnasio', c.fuerzaM);
      if (S.mo.food.length && mean(S.mo.food) >= c.foodThr - 1e-9) add('V', 'M', 'Mes de comida', c.vitM);
      if (S.mo.discOk) add('D', 'M', 'Mes sin pasarse de horas', c.discM);
    }

    // puntos de la mascota que elegiste asignar
    for (const cat of inp.alloc ?? []) {
      if (this.petPending() > 0 && S.petAlloc[cat] < c.petStatMax) S.petAlloc[cat]++;
    }
    // títulos: el del héroe pide promedio y un mínimo en cada estadística; el de la mascota, nivel
    const unlocked: number[] = [], petUnlocked: number[] = [];
    const level = this.level();
    HERO_TITLES.forEach((t, k) => {
      if (S.titles[k] !== undefined) return;
      if (level >= t.avg && CATS.every(cat => this.eff(cat) >= Math.max(1, t.avg - c.balanceGap))) { S.titles[k] = i; unlocked.push(k); }
    });
    const pl = this.petLevel();
    PET_TITLES.forEach((t, k) => { if (S.petTitles[k] === undefined && pl >= t.lvl) { S.petTitles[k] = i; petUnlocked.push(k); } });
    S.day = i + 1;
    return { day: i, date, events: ev, level, unlocked, petUnlocked };
  }
}

/** Convierte las entradas guardadas por versiones anteriores al formato v2. */
export function normalize(r: RiseInput, c: RiseConfig = RISE): RiseInput {
  const o: RiseInput = { ...r };
  if (o.gymMin === undefined && r.gym) o.gymMin = 60;
  if (o.foodPct === undefined) { if (r.food) o.foodPct = 1; else if (r.meals) o.foodPct = 0.5; }
  if (o.water === undefined && (r.waterMl ?? 0) >= 1000) o.water = true;
  void c; return o;
}

/** Rehace todo el historial desde el día 0. */
export function replayRise(inputs: RiseInput[], cfg: Partial<RiseConfig> = {}): { engine: Rise; days: RiseDay[] } {
  const engine = new Rise(cfg); const days: RiseDay[] = [];
  for (const x of inputs) days.push(engine.processDay(x));
  return { engine, days };
}
