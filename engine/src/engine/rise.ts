/**
 * Rise — motor v2 (especificación v2.0). Estadísticas por XP, nivel = suma, puertas cada 10 pisos con mínimo
 * en cada estadística (héroe + mascota), mascota que sube por constancia y progreso en el gimnasio.
 * Nada baja nunca. Es determinista: se rehace desde el día 0 con las entradas diarias guardadas.
 */
import { dateOfDay } from './calendar.ts';

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
  waterMl?: number;                // agua tomada (la meta son 2.500 ml)
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
  statA: number; statR: number; statMax: number;
  sessionMin: number;              // minutos para que una visita cuente como sesión
  fuerzaPerMin: number; fuerzaCapMin: number; fuerzaWeekMin: number; fuerzaMonthMin: number; fuerzaW: number; fuerzaM: number;
  readXp: number; bookFirst: number; bookNext: number;
  foodDay: number; waterXp: number; foodThr: number; vitW: number; vitM: number;
  cleanFirst: number; cleanExtra: number; cleanDaysMax: number; cleanRoomsWeek: number; ordenW: number; repairFirst: number; repairNext: number;
  gameCapH: number; discW: number; discM: number;
  petA: number; petR: number; petMax: number; petStatMax: number;
  sessXp: number; sessMax: number; progXp: number; progWeekBonus: number; cycleBonus: number; cycleNeed: number; cycleWeeks: number;
  gates: Record<number, number>;
}

export const RISE: RiseConfig = {
  startDate: '2026-11-02',
  statA: 1000, statR: 1.10, statMax: 20,
  sessionMin: 40,
  fuerzaPerMin: 1.6, fuerzaCapMin: 120, fuerzaWeekMin: 360, fuerzaMonthMin: 1440, fuerzaW: 250, fuerzaM: 650,
  readXp: 60, bookFirst: 2500, bookNext: 1250,
  foodDay: 105, waterXp: 15, foodThr: 0.8, vitW: 250, vitM: 650,
  cleanFirst: 100, cleanExtra: 40, cleanDaysMax: 5, cleanRoomsWeek: 5, ordenW: 250, repairFirst: 1100, repairNext: 550,
  gameCapH: 15, discW: 750, discM: 1100,
  petA: 369.1, petR: 1.03, petMax: 100, petStatMax: 20,
  sessXp: 100, sessMax: 5, progXp: 150, progWeekBonus: 300, cycleBonus: 1000, cycleNeed: 4, cycleWeeks: 4,
  gates: { 10: 3, 20: 6, 30: 9, 40: 13, 50: 16, 60: 20, 70: 24, 80: 27, 90: 32, 100: 40 },
};

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
  floor: number;
  blocked: number | null;
  cleared: number[];
  clearedDay: Record<number, number>;
  wk: { sess: number; min: number; cleanDays: number; rooms: string[]; food: number[]; gameH: number; prog: number };
  mo: { ym: string; min: number; food: number[]; books: number; repairs: number; discOk: boolean };
  cyc: string[];                   // ejercicios distintos con progreso en el ciclo de 4 semanas
  totals: { gym: number; books: number; repairs: number };
}

export type EvKind = 'D' | 'W' | 'M';
export interface RiseEvent { day: number; cat: Cat | 'pet'; kind: EvKind; label: string; amount: number }
export interface RiseDay { day: number; date: string; events: RiseEvent[]; floor: number; level: number; blocked: number | null; unlocked: number[] }

export function initialRise(cfg: RiseConfig = RISE): RiseState {
  return {
    day: 0, xp: zero(), petXp: 0, petAlloc: zero(), k: 1, floor: 0, blocked: null, cleared: [], clearedDay: {},
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
    this.cumStat = [0]; for (let n = 0; n < c.statMax; n++) this.cumStat.push(this.cumStat[n] + c.statA * Math.pow(c.statR, n));
    this.cumPet = [0]; for (let n = 0; n < c.petMax; n++) this.cumPet.push(this.cumPet[n] + c.petA * Math.pow(c.petR, n));
  }

  // ---------- consultas ----------
  statCost(n: number): number { return this.cfg.statA * Math.pow(this.cfg.statR, n); }       // costo del nivel n → n+1
  statLevel(c: Cat): number { let n = 0; while (n < this.cfg.statMax && this.state.xp[c] >= this.cumStat[n + 1] - 1e-9) n++; return n; }
  statProgress(c: Cat) {
    const n = this.statLevel(c), max = n >= this.cfg.statMax, into = this.state.xp[c] - this.cumStat[n];
    return { level: n, max, into, cost: max ? 0 : this.statCost(n), pct: max ? 1 : into / this.statCost(n) };
  }
  floor(): number { return Math.max(1, this.state.floor); }
  level(): number { return CATS.reduce((a, c) => a + this.statLevel(c), 0); }
  petLevel(): number { let n = 0; while (n < this.cfg.petMax && this.state.petXp >= this.cumPet[n + 1] - 1e-9) n++; return n; }
  petProgress() {
    const n = this.petLevel(), max = n >= this.cfg.petMax, into = this.state.petXp - this.cumPet[n];
    const cost = this.cfg.petA * Math.pow(this.cfg.petR, n);
    return { level: n, max, into, cost: max ? 0 : cost, pct: max ? 1 : into / cost };
  }
  petPending(): number { return this.petLevel() - CATS.reduce((a, c) => a + this.state.petAlloc[c], 0); }
  /** Estadística efectiva para las puertas: héroe + puntos de mascota (máx. 40 en total, 20 + 20). */
  eff(c: Cat): number { return this.statLevel(c) + this.state.petAlloc[c]; }
  gateReq(g: number): number | undefined { return this.cfg.gates[g]; }
  gateOk(g: number): boolean { const r = this.cfg.gates[g]; return r === undefined || CATS.every(c => this.eff(c) >= r); }
  nextGate(): number | null { for (const g of Object.keys(this.cfg.gates).map(Number).sort((a, b) => a - b)) if (!this.state.cleared.includes(g)) return g; return null; }
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
    // Vitalidad: comida de lunes a viernes, agua todos los días
    if (dd < 5) {
      const pct = Math.max(0, Math.min(1, inp.foodPct ?? 0));
      add('V', 'D', 'Comida', c.foodDay * pct);
      S.wk.food.push(pct); S.mo.food.push(pct);
    }
    if (inp.water) add('V', 'D', 'Agua', c.waterXp);
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
      if (this.petPending() > 0 && S.petAlloc[cat] < c.petStatMax && this.statLevel(cat) + S.petAlloc[cat] < 2 * c.statMax) S.petAlloc[cat]++;
    }
    // piso y puertas: el piso es el nivel hasta la primera puerta sin cumplir
    const unlocked: number[] = [];
    const level = this.level();
    let floor = level, blocked: number | null = null;
    for (const g of Object.keys(c.gates).map(Number).sort((a, b) => a - b)) {
      if (level < g) break;
      if (this.gateOk(g)) { if (!S.cleared.includes(g)) { S.cleared.push(g); S.clearedDay[g] = i; unlocked.push(g); } }
      else { blocked = g; floor = g === 100 ? 99 : g; break; }
    }
    S.floor = Math.max(S.floor, floor); S.blocked = blocked;
    S.day = i + 1;
    return { day: i, date, events: ev, floor: S.floor, level, blocked, unlocked };
  }
}

/** Convierte las entradas guardadas por versiones anteriores al formato v2. */
export function normalize(r: RiseInput, c: RiseConfig = RISE): RiseInput {
  const o: RiseInput = { ...r };
  if (o.gymMin === undefined && r.gym) o.gymMin = 60;
  if (o.foodPct === undefined) { if (r.food) o.foodPct = 1; else if (r.meals) o.foodPct = 0.5; }
  if (o.water === undefined && (r.waterMl ?? 0) >= 2500) o.water = true;
  void c; return o;
}

/** Rehace todo el historial desde el día 0. */
export function replayRise(inputs: RiseInput[], cfg: Partial<RiseConfig> = {}): { engine: Rise; days: RiseDay[] } {
  const engine = new Rise(cfg); const days: RiseDay[] = [];
  for (const x of inputs) days.push(engine.processDay(x));
  return { engine, days };
}
