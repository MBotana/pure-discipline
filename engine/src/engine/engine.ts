import { buildCalendar } from './calendar.ts';
import { DEFAULT_CONFIG } from './config.ts';
import { CATS } from './types.ts';
import type { AuditEvent, Cat, Config, DayInput, EventKind, GateDef, State } from './types.ts';

export function cumXp(n: number, A: number, r: number): number { return A * (Math.pow(r, n - 1) - 1) / (r - 1); }
export function levelOf(xp: number, A: number, r: number): number {
  return 1 + Math.trunc(Math.log(1 + xp * (r - 1) / A + 1e-12) / Math.log(r));
}

export function buildGates(cfg: Config): Record<number, GateDef> {
  const G: Record<number, GateDef> = {};
  if (cfg.hingeEvery) {
    let k = 0;
    for (let g = cfg.hingeEvery; g <= 100; g += cfg.hingeEvery, k++) {
      G[g] = { stats: cfg.combos[k % cfg.combos.length], req: Math.floor(cfg.reqScale * cfg.statScale * g + 1e-9) };
    }
  }
  for (const [g, need] of Object.entries(cfg.streakGates)) {
    const key = Number(g); G[key] = { ...(G[key] ?? {}), streak: need };
  }
  return G;
}

const zero = (): Record<Cat, number> => ({ F: 0, I: 0, V: 0, D: 0, O: 0 });

export function initialState(): State {
  return {
    day: 0, xp: 0, cleared: [], blocked: null, stat: zero(), s: 0, px: zero(), equipped: 'F',
    feedStreak: 0, gameWk: 0, foodWk: 0, roomsWk: [], drips: [], wstreak: 0,
    multM: 1, mu: zero(), mdone: [], bd: 0,
    bonusW: 1, wu: zero(), wdone: [],
    arrive: {}, clearedDay: {}, blocks: [], tower: null,
    lostBlock: 0, lostClamp: 0, statWasted: 0, discPenN: 0,
  };
}

export interface DayResult {
  day: number; floor: number; xp: number; events: AuditEvent[]; blocked: number | null; unlocked: number[];
  completed: { weekly: Cat[]; monthly: Cat[]; pet: boolean };
}

export class Engine {
  readonly cfg: Config;
  state: State;
  private gates: Record<number, GateDef>;
  private hinge: number[];
  private cum: number[];
  private cal: ReturnType<typeof buildCalendar>;

  constructor(cfg: Partial<Config> = {}, state?: State) {
    this.cfg = { ...DEFAULT_CONFIG, ...cfg };
    this.state = state ? structuredClone(state) : initialState();
    this.gates = buildGates(this.cfg);
    this.hinge = Object.keys(this.gates).map(Number).filter(g => this.gates[g].stats).sort((a, b) => a - b);
    this.cum = [0];
    for (const x of this.cfg.petCosts) this.cum.push(this.cum[this.cum.length - 1] + x);
    this.cal = buildCalendar(this.cfg.startDate);
  }

  // ---------- consultas ----------
  floor(): number { return levelOf(this.state.xp, this.cfg.A, this.cfg.r); }
  petLevel(c: Cat): number { let n = 0; for (const t of this.cum.slice(1)) if (this.state.px[c] >= t) n++; return n; }
  /** Aporte efectivo de la mascota de la estadística c (solo si está equipada, salvo modo paridad). */
  private petBonus(c: Cat): number {
    if (this.cfg.petsMustBeEquipped && this.state.equipped !== c) return 0;
    return this.petLevel(c);
  }
  statCap(): number {
    for (const g of this.hinge) if (!this.state.cleared.includes(g)) return Math.trunc(g * this.cfg.statScale);
    return Infinity;
  }
  statOk(G: number): boolean {
    const g = this.gates[G]; if (!g.stats) return true;
    const [a, b] = g.stats; const req = g.req!; const st = this.state.stat;
    const da = Math.max(0, req - st[a]), db = Math.max(0, req - st[b]);
    const capb = Math.trunc(this.cfg.petRatio * G * this.cfg.statScale + 1e-9);
    if (da === 0 && db === 0) return true;
    return (db === 0 && da <= Math.min(this.petBonus(a), capb)) || (da === 0 && db <= Math.min(this.petBonus(b), capb));
  }
  gateOk(G: number): boolean {
    const g = this.gates[G];
    return (g.streak === undefined || this.state.s >= g.streak) && this.statOk(G);
  }
  requirements(G: number) { return this.gates[G]; }

  // ---------- procesamiento ----------
  processDay(input: DayInput = {}): DayResult {
    const S = this.state, cfg = this.cfg, i = S.day;
    const w = Math.floor(i / 7), dd = i % 7;
    const month = this.cal.months[this.cal.monthOfWeek[w]];
    const unlocked: number[] = [];
    const out: AuditEvent[] = [];
    const completed: { weekly: Cat[]; monthly: Cat[]; pet: boolean } = { weekly: [], monthly: [], pet: false };

    if (dd === 0) {
      if (w === month.weeks[0]) { // inicio de mes
        S.multM = S.s >= 1 ? 1 + S.s : 1;
        S.mu = zero(); S.mdone = []; S.bd = 0; S.wstreak = 0;
      }
      S.bonusW = S.s >= 1 ? S.multM : 1 + cfg.weeklyBonus[Math.min(S.wstreak, 4)];
      S.wu = zero(); S.wdone = []; S.gameWk = 0; S.foodWk = 0; S.roomsWk = [];
    }
    if (input.equip) S.equipped = input.equip;

    const ev: [Cat, 'D' | 'W' | 'M' | 'S', number, number?][] = [];
    const wkday = dd < 5;
    const addDone = (arr: Cat[], c: Cat) => { if (!arr.includes(c)) arr.push(c); };
    const weekly = (cat: Cat, units: number) => {
      if (S.wu[cat] < units) {
        S.wu[cat]++;
        if (S.wu[cat] === units) { addDone(S.wdone, cat); completed.weekly.push(cat); ev.push([cat, 'S', 0]); }
        ev.push([cat, 'W', cfg.W / units]);
      }
    };
    const monthly = (cat: Cat, limit: number, base: number) => {
      if (S.mu[cat] < limit) {
        S.mu[cat]++; ev.push([cat, 'M', base]);
        if (S.mu[cat] === limit) { addDone(S.mdone, cat); completed.monthly.push(cat); }
      }
    };

    if (input.gym) { if (wkday) ev.push(['F', 'D', cfg.d]); weekly('F', 3); monthly('F', cfg.gymM, cfg.Mp / cfg.gymM); }
    if (input.read) { if (wkday) ev.push(['I', 'D', cfg.d]); weekly('I', 3); }
    if (input.bookTramo) monthly('I', cfg.bookTramos, cfg.Mp / cfg.bookTramos);
    if (input.aero) { if (wkday) ev.push(['V', 'D', cfg.d]); weekly('V', 3); monthly('V', cfg.aeroM, cfg.Mp / cfg.aeroM); }
    if (input.clean) {
      if (wkday) ev.push(['O', 'D', cfg.d]);
      const rm = input.room;
      if (!rm || !S.roomsWk.includes(rm)) { if (rm) S.roomsWk.push(rm); weekly('O', cfg.namb); }
    }
    // Misiones mensuales de una sola unidad: la misión se cumple el día en que se marca; el XP se paga en dripDays cuotas diarias
    // (así ningún día concentra el pozo entero y se mantiene el límite de un piso por día).
    const mark = (cat: Cat) => {
      if (S.mu[cat] >= 1) return;
      S.mu[cat]++; addDone(S.mdone, cat); completed.monthly.push(cat);
      S.drips.push({ cat, base: cfg.Mp / cfg.dripDays, mult: S.s === 0 ? 1 : S.multM, left: cfg.dripDays });
    };
    if (input.book) mark('I');
    if (input.repair) mark('O');
    for (const d of S.drips) { ev.push([d.cat, 'M', d.base, d.mult]); d.left--; }
    S.drips = S.drips.filter(d => d.left > 0);
    if (input.dwork && S.wu.D < 3) { S.wu.D++; ev.push(['D', 'W', cfg.W / 3]); }
    if (input.dweek) while (S.wu.D < 3) { S.wu.D++; ev.push(['D', 'W', cfg.W / 3]); }
    if (input.gaming) S.gameWk += input.gaming;
    if (input.food) { S.foodWk++; if (S.foodWk === cfg.foodDays) completed.pet = true; }
    if (input.improve) monthly('O', cfg.impUnits, cfg.Mp / cfg.impUnits);
    if (dd === 6 && input.dweek) { S.mu.D++; ev.push(['D', 'M', cfg.Mp / month.weeks.length]); }
    if ((dd === 2 || dd === 6) && input.dcheck) ev.push(['D', 'M', cfg.Mp / (cfg.dchk * month.weeks.length)]);

    const lastWeekOfMonth = w === month.weeks[month.weeks.length - 1];
    if (dd === 6) {
      if (input.dcheck && lastWeekOfMonth) { addDone(S.mdone, 'D'); completed.monthly.push('D'); }
      if (lastWeekOfMonth && S.mu.D >= month.weeks.length) { addDone(S.mdone, 'D'); completed.monthly.push('D'); }
      const anti = (input.anti ?? true) && S.gameWk <= 3 && !input.phone;
      if (S.wu.D >= 3 && anti) { addDone(S.wdone, 'D'); completed.weekly.push('D'); ev.unshift(['D', 'S', 0]); }
      else {
        S.wdone = S.wdone.filter(c => c !== 'D');
        if (S.wu.D < 3 && !anti && cfg.discPen) { S.discPenN++; S.stat.D = Math.max(0, S.stat.D - 1); }
      }
      // mascota equipada
      const eq = S.equipped, maxXp = this.cum[this.cum.length - 1];
      if (input.feed || S.foodWk >= cfg.foodDays) { S.px[eq] = Math.min(maxXp, S.px[eq] + cfg.petWeek); S.feedStreak = 0; }
      else {
        S.feedStreak++;
        if (S.feedStreak >= 2 && this.petLevel(eq) > 0) S.px[eq] = this.cum[this.petLevel(eq) - 1];
      }
    }

    const tryUnblock = () => {
      if (S.blocked !== null && this.gateOk(S.blocked)) {
        S.cleared.push(S.blocked); S.clearedDay[S.blocked] = i;
        S.blocks[S.blocks.length - 1].end = i; unlocked.push(S.blocked); S.blocked = null;
      }
    };
    tryUnblock();

    for (const [cat, kind, base, mo] of ev) {
      if (kind === 'S') {
        const cs = this.statCap();
        const nw = Math.min(S.stat[cat] + cfg.statPw, cs);
        S.statWasted += S.stat[cat] + cfg.statPw - nw; S.stat[cat] = nw;
        tryUnblock(); continue;
      }
      tryUnblock();
      let mult = (kind === 'D' || kind === 'W') ? S.bonusW : S.multM;
      if (kind === 'D') mult = 1;
      if (kind === 'M' && S.s === 0) mult = 1;
      if (mo !== undefined) mult = mo;
      const amt = base * mult;
      const rec: AuditEvent = { day: i, cat, kind: kind as EventKind, base, mult, amount: amt, outcome: 'paid', paid: 0 };
      out.push(rec);
      if (S.blocked !== null) { S.lostBlock += amt; rec.outcome = 'lost_block'; rec.gate = S.blocked; continue; }
      let rem = amt;
      while (rem > 0) {
        const pend = Object.keys(this.gates).map(Number).sort((a, b) => a - b).filter(g => !S.cleared.includes(g));
        if (!pend.length) { S.xp += rem; rec.paid += rem; rem = 0; break; }
        const G = pend[0], cap = cumXp(G, cfg.A, cfg.r);
        if (S.xp + rem < cap - 1e-9) { S.xp += rem; rec.paid += rem; rem = 0; }
        else {
          const used = Math.max(cap - S.xp, 0); S.xp = cap; rem -= used; rec.paid += used;
          if (!(G in S.arrive)) S.arrive[G] = i;
          if (this.gateOk(G)) { S.cleared.push(G); S.clearedDay[G] = i; unlocked.push(G); }
          else {
            S.blocked = G; S.lostClamp += rem; rec.outcome = 'lost_clamp'; rec.gate = G;
            const g = this.gates[G];
            S.blocks.push({ gate: G, start: i, end: null, streak: g.streak !== undefined && S.s < g.streak, stats: !this.statOk(G) });
            rem = 0;
          }
        }
      }
    }
    if (S.blocked !== null && !this.statOk(S.blocked)) S.bd++;
    if (S.tower === null && S.cleared.includes(100)) S.tower = i;

    // cierres
    if (dd === 6) {
      const fails = CATS.filter(c => !S.wdone.includes(c));
      S.wstreak = fails.length >= 2 ? 0 : S.wstreak + 1;
      if (lastWeekOfMonth) this.closeMonth();
    }
    S.day = i + 1;
    return { day: i, floor: this.floor(), xp: S.xp, events: out, blocked: S.blocked, unlocked, completed };
  }

  private closeMonth() {
    const S = this.state, cfg = this.cfg;
    const failm = CATS.filter(c => !S.mdone.includes(c));
    for (const c of failm) S.stat[c] = Math.max(0, S.stat[c] - cfg.statPen);
    const frozen = (S.blocked !== null && !this.statOk(S.blocked)) || S.bd > cfg.freezeDays;
    if (!frozen) S.s = failm.length >= 2 ? 0 : S.s + 1;
  }

  /** Posición de la semana de un día dentro de su mes: { n: 1..k, of: k }. */
  weekInfo(day: number): { n: number; of: number } {
    const w = Math.floor(day / 7), m = this.cal.months[this.cal.monthOfWeek[w]];
    return { n: m.weeks.indexOf(w) + 1, of: m.weeks.length };
  }
  petLevels(): Record<Cat, number> {
    return { F: this.petLevel('F'), I: this.petLevel('I'), V: this.petLevel('V'), D: this.petLevel('D'), O: this.petLevel('O') };
  }
}

/** Reproduce un historial completo de entradas diarias desde cero. */
export function replay(inputs: DayInput[], cfg: Partial<Config> = {}): { engine: Engine; results: DayResult[] } {
  const engine = new Engine(cfg); const results: DayResult[] = [];
  for (const inp of inputs) results.push(engine.processDay(inp));
  return { engine, results };
}
