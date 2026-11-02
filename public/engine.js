// engine/src/engine/calendar.ts
function addDays(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n));
}
function isMonday(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 1;
}
function buildCalendar(startDate, weeks = 520) {
  if (!isMonday(startDate))
    throw new Error("startDate debe ser lunes");
  const monthOfWeek = [];
  const months = [];
  for (let k = 0;k < weeks; k++) {
    const thu = addDays(startDate, 7 * k + 3);
    const ym = `${thu.getUTCFullYear()}-${String(thu.getUTCMonth() + 1).padStart(2, "0")}`;
    if (!months.length || months[months.length - 1].ym !== ym)
      months.push({ ym, weeks: [] });
    months[months.length - 1].weeks.push(k);
    monthOfWeek.push(months.length - 1);
  }
  return { months, monthOfWeek };
}

// engine/src/engine/config.ts
var COMBOS = [["F", "I"], ["I", "O"], ["O", "D"], ["D", "V"], ["V", "F"], ["F", "O"], ["I", "D"], ["O", "V"], ["D", "F"], ["F", "I"]];
var DEFAULT_CONFIG = {
  startDate: "2026-11-02",
  d: 50,
  W: 300,
  Mp: 1500,
  r: 1.039,
  A: 605,
  weeklyBonus: [0, 0.2, 0.3, 0.4, 0.5],
  gymM: 16,
  aeroM: 12,
  bookTramos: 10,
  impUnits: 6,
  dchk: 2,
  namb: 5,
  foodDays: 5,
  dripDays: 6,
  statPw: 1,
  statPen: 1,
  statScale: 0.5,
  reqScale: 0.9,
  freezeDays: 14,
  hingeEvery: 10,
  combos: COMBOS,
  statReq: { 10: 1, 20: 2, 30: 4, 40: 7, 50: 12, 60: 15, 70: 20, 80: 29, 90: 40, 100: 45 },
  streakGates: { 25: 1, 50: 2, 75: 3, 100: 4 },
  multStep: 0.5,
  multMax: 3,
  dayFloorCap: 1,
  dailyMult: true,
  weekendComp: true,
  gameCapH: 15,
  gameGraceWeeks: 2,
  discPen: true,
  petRatio: 0.1,
  petCosts: [10, 13, 17, 20, 30],
  petWeek: 10,
  petsMustBeEquipped: true
};
var LEGACY_CONFIG = {
  ...DEFAULT_CONFIG,
  r: 1.015,
  A: 5000,
  statReq: undefined,
  streakGates: { 25: 2, 50: 4, 75: 6, 100: 8 },
  multStep: 1,
  multMax: Infinity,
  namb: 6,
  gymM: 18,
  foodDays: 4,
  dayFloorCap: 0,
  dailyMult: false,
  foodRule: undefined,
  weekendComp: false,
  gameCapH: undefined,
  gameGraceWeeks: undefined
};

// engine/src/engine/types.ts
var CATS = ["F", "I", "V", "D", "O"];

// engine/src/engine/engine.ts
function cumXp(n, A, r) {
  return A * (Math.pow(r, n - 1) - 1) / (r - 1);
}
function levelOf(xp, A, r) {
  return 1 + Math.trunc(Math.log(1 + xp * (r - 1) / A + 0.000000000001) / Math.log(r));
}
function buildGates(cfg) {
  const G = {};
  if (cfg.hingeEvery) {
    let k = 0;
    for (let g = cfg.hingeEvery;g <= 100; g += cfg.hingeEvery, k++) {
      const req = cfg.statReq?.[g] ?? Math.floor(cfg.reqScale * cfg.statScale * g + 0.000000001);
      G[g] = { stats: cfg.combos[k % cfg.combos.length], req };
    }
  }
  for (const [g, need] of Object.entries(cfg.streakGates)) {
    const key = Number(g);
    G[key] = { ...G[key] ?? {}, streak: need };
  }
  return G;
}
var zero = () => ({ F: 0, I: 0, V: 0, D: 0, O: 0 });
function initialState() {
  return {
    day: 0,
    xp: 0,
    cleared: [],
    blocked: null,
    stat: zero(),
    s: 0,
    px: zero(),
    equipped: "F",
    feedStreak: 0,
    gameWk: 0,
    foodWk: 0,
    roomsWk: [],
    drips: [],
    wstreak: 0,
    multM: 1,
    mu: zero(),
    mdone: [],
    bd: 0,
    bonusW: 1,
    wu: zero(),
    wdone: [],
    arrive: {},
    clearedDay: {},
    blocks: [],
    tower: null,
    lostBlock: 0,
    lostClamp: 0,
    statWasted: 0,
    discPenN: 0,
    fl: 1,
    meatWk: 0,
    vegWk: 0,
    junkWk: 0,
    gameHWk: 0,
    dpaid: zero()
  };
}

class Engine {
  cfg;
  state;
  gates;
  hinge;
  cum;
  cal;
  constructor(cfg = {}, state) {
    this.cfg = { ...DEFAULT_CONFIG, ...cfg };
    this.state = state ? structuredClone(state) : initialState();
    this.gates = buildGates(this.cfg);
    this.hinge = Object.keys(this.gates).map(Number).filter((g) => this.gates[g].stats).sort((a, b) => a - b);
    this.cum = [0];
    for (const x of this.cfg.petCosts)
      this.cum.push(this.cum[this.cum.length - 1] + x);
    this.cal = buildCalendar(this.cfg.startDate);
  }
  floor() {
    return this.cfg.dayFloorCap ? this.state.fl ?? 1 : levelOf(this.state.xp, this.cfg.A, this.cfg.r);
  }
  xpFloor() {
    return levelOf(this.state.xp, this.cfg.A, this.cfg.r);
  }
  petLevel(c) {
    let n = 0;
    for (const t of this.cum.slice(1))
      if (this.state.px[c] >= t)
        n++;
    return n;
  }
  petBonus(c) {
    if (this.cfg.petsMustBeEquipped && this.state.equipped !== c)
      return 0;
    return this.petLevel(c);
  }
  statCap() {
    for (const g of this.hinge)
      if (!this.state.cleared.includes(g))
        return Math.trunc(g * this.cfg.statScale);
    return Infinity;
  }
  statOk(G) {
    const g = this.gates[G];
    if (!g.stats)
      return true;
    const [a, b] = g.stats;
    const req = g.req;
    const st = this.state.stat;
    const da = Math.max(0, req - st[a]), db = Math.max(0, req - st[b]);
    const capb = Math.trunc(this.cfg.petRatio * G * this.cfg.statScale + 0.000000001);
    if (da === 0 && db === 0)
      return true;
    return db === 0 && da <= Math.min(this.petBonus(a), capb) || da === 0 && db <= Math.min(this.petBonus(b), capb);
  }
  gateOk(G) {
    const g = this.gates[G];
    return (g.streak === undefined || this.state.s >= g.streak) && this.statOk(G);
  }
  requirements(G) {
    return this.gates[G];
  }
  processDay(input = {}) {
    const S = this.state, cfg = this.cfg, i = S.day;
    const w = Math.floor(i / 7), dd = i % 7;
    const month = this.cal.months[this.cal.monthOfWeek[w]];
    const unlocked = [];
    const out = [];
    const completed = { weekly: [], monthly: [], pet: false };
    if (dd === 0) {
      if (w === month.weeks[0]) {
        S.multM = S.s >= 1 ? Math.min(cfg.multMax ?? Infinity, 1 + (cfg.multStep ?? 1) * S.s) : 1;
        S.mu = zero();
        S.mdone = [];
        S.bd = 0;
        S.wstreak = 0;
      }
      S.bonusW = S.s >= 1 ? S.multM : 1 + cfg.weeklyBonus[Math.min(S.wstreak, 4)];
      S.wu = zero();
      S.wdone = [];
      S.gameWk = 0;
      S.foodWk = 0;
      S.roomsWk = [];
      S.meatWk = 0;
      S.vegWk = 0;
      S.junkWk = 0;
      S.gameHWk = 0;
      S.dpaid = zero();
    }
    if (input.equip)
      S.equipped = input.equip;
    const ev = [];
    const wkday = dd < 5;
    const addDone = (arr, c) => {
      if (!arr.includes(c))
        arr.push(c);
    };
    const weekly = (cat, units) => {
      if (S.wu[cat] < units) {
        S.wu[cat]++;
        if (S.wu[cat] === units) {
          addDone(S.wdone, cat);
          completed.weekly.push(cat);
          ev.push([cat, "S", 0]);
        }
        ev.push([cat, "W", cfg.W / units]);
      }
    };
    const monthly = (cat, limit, base) => {
      if (S.mu[cat] < limit) {
        S.mu[cat]++;
        ev.push([cat, "M", base]);
        if (S.mu[cat] === limit) {
          addDone(S.mdone, cat);
          completed.monthly.push(cat);
        }
      }
    };
    const dp = S.dpaid ?? (S.dpaid = zero());
    const dailyPay = (cat) => {
      if (wkday || cfg.weekendComp && dp[cat] < 5) {
        dp[cat]++;
        ev.push([cat, "D", cfg.d]);
      }
    };
    if (input.gym) {
      dailyPay("F");
      weekly("F", 3);
      monthly("F", cfg.gymM, cfg.Mp / cfg.gymM);
    }
    if (input.read) {
      dailyPay("I");
      weekly("I", 3);
    }
    if (input.bookTramo)
      monthly("I", cfg.bookTramos, cfg.Mp / cfg.bookTramos);
    if (input.aero) {
      dailyPay("V");
      weekly("V", 3);
      monthly("V", cfg.aeroM, cfg.Mp / cfg.aeroM);
    }
    const rooms = input.rooms?.length ? input.rooms : input.room ? [input.room] : [];
    if (input.clean || rooms.length) {
      dailyPay("O");
      if (!rooms.length)
        weekly("O", cfg.namb);
      for (const rm of rooms)
        if (!S.roomsWk.includes(rm)) {
          S.roomsWk.push(rm);
          weekly("O", cfg.namb);
        }
    }
    const mark = (cat) => {
      if (S.mu[cat] >= 1)
        return;
      S.mu[cat]++;
      addDone(S.mdone, cat);
      completed.monthly.push(cat);
      S.drips.push({ cat, base: cfg.Mp / cfg.dripDays, mult: S.s === 0 ? 1 : S.multM, left: cfg.dripDays });
    };
    if (input.book || input.books?.length)
      mark("I");
    if (input.repair)
      mark("O");
    for (const d of S.drips) {
      ev.push([d.cat, "M", d.base, d.mult]);
      d.left--;
    }
    S.drips = S.drips.filter((d) => d.left > 0);
    const hoursMode = cfg.gameCapH !== undefined;
    if (input.gameH)
      S.gameHWk = (S.gameHWk ?? 0) + input.gameH;
    const grace = hoursMode && w < (cfg.gameGraceWeeks ?? 0);
    const gameRatio = hoursMode ? (S.gameHWk ?? 0) / cfg.gameCapH : 0;
    const gameOk = hoursMode && dd === 6 && (grace || gameRatio <= 1 + 0.000000001);
    const dweek = hoursMode ? gameOk : !!input.dweek;
    if (input.dwork && S.wu.D < 3) {
      S.wu.D++;
      ev.push(["D", "W", cfg.W / 3]);
    }
    if (dweek)
      while (S.wu.D < 3) {
        S.wu.D++;
        ev.push(["D", "W", cfg.W / 3]);
      }
    if (input.gaming)
      S.gameWk += input.gaming;
    const fr = cfg.foodRule;
    const fedOk = () => fr ? (S.meatWk ?? 0) >= fr.meat && (S.vegWk ?? 0) >= fr.veg && (S.junkWk ?? 0) <= fr.junkMax : S.foodWk >= cfg.foodDays;
    {
      const before = fedOk();
      if (input.food || input.meat || input.veg)
        S.foodWk++;
      if (input.meat)
        S.meatWk = (S.meatWk ?? 0) + 1;
      if (input.veg)
        S.vegWk = (S.vegWk ?? 0) + 1;
      if (input.junk)
        S.junkWk = (S.junkWk ?? 0) + 1;
      if (!before && fedOk())
        completed.pet = true;
    }
    if (input.improve)
      monthly("O", cfg.impUnits, cfg.Mp / cfg.impUnits);
    if (dd === 6 && dweek) {
      S.mu.D++;
      ev.push(["D", "M", cfg.Mp / month.weeks.length]);
    }
    if ((dd === 2 || dd === 6) && input.dcheck)
      ev.push(["D", "M", cfg.Mp / (cfg.dchk * month.weeks.length)]);
    const lastWeekOfMonth = w === month.weeks[month.weeks.length - 1];
    if (dd === 6) {
      if (input.dcheck && lastWeekOfMonth) {
        addDone(S.mdone, "D");
        completed.monthly.push("D");
      }
      if (lastWeekOfMonth && S.mu.D >= month.weeks.length) {
        addDone(S.mdone, "D");
        completed.monthly.push("D");
      }
      const anti = hoursMode ? gameOk : (input.anti ?? true) && S.gameWk <= 3 && !input.phone;
      if (S.wu.D >= 3 && anti) {
        addDone(S.wdone, "D");
        completed.weekly.push("D");
        ev.unshift(["D", "S", 0]);
      } else {
        S.wdone = S.wdone.filter((c) => c !== "D");
        const pen = hoursMode ? !grace && gameRatio > 1.2 + 0.000000001 : S.wu.D < 3 && !anti;
        if (pen && cfg.discPen) {
          S.discPenN++;
          S.stat.D = Math.max(0, S.stat.D - 1);
        }
      }
      const eq = S.equipped, maxXp = this.cum[this.cum.length - 1];
      if (input.feed || fedOk()) {
        S.px[eq] = Math.min(maxXp, S.px[eq] + cfg.petWeek);
        S.feedStreak = 0;
      } else {
        S.feedStreak++;
        if (S.feedStreak >= 2 && this.petLevel(eq) > 0)
          S.px[eq] = this.cum[this.petLevel(eq) - 1];
      }
    }
    const tryUnblock = () => {
      if (S.blocked !== null && this.gateOk(S.blocked)) {
        S.cleared.push(S.blocked);
        S.clearedDay[S.blocked] = i;
        S.blocks[S.blocks.length - 1].end = i;
        unlocked.push(S.blocked);
        S.blocked = null;
      }
    };
    tryUnblock();
    for (const [cat, kind, base, mo] of ev) {
      if (kind === "S") {
        const cs = this.statCap();
        const nw = Math.min(S.stat[cat] + cfg.statPw, cs);
        S.statWasted += S.stat[cat] + cfg.statPw - nw;
        S.stat[cat] = nw;
        tryUnblock();
        continue;
      }
      tryUnblock();
      let mult = kind === "D" || kind === "W" ? S.bonusW : S.multM;
      if (kind === "D" && !cfg.dailyMult)
        mult = 1;
      if (kind === "M" && S.s === 0)
        mult = 1;
      if (mo !== undefined)
        mult = mo;
      const amt = base * mult;
      const rec = { day: i, cat, kind, base, mult, amount: amt, outcome: "paid", paid: 0 };
      out.push(rec);
      if (S.blocked !== null) {
        S.lostBlock += amt;
        rec.outcome = "lost_block";
        rec.gate = S.blocked;
        continue;
      }
      let rem = amt;
      while (rem > 0) {
        const pend = Object.keys(this.gates).map(Number).sort((a, b) => a - b).filter((g) => !S.cleared.includes(g));
        if (!pend.length) {
          S.xp += rem;
          rec.paid += rem;
          rem = 0;
          break;
        }
        const G = pend[0], cap = cumXp(G, cfg.A, cfg.r);
        if (S.xp + rem < cap - 0.000000001) {
          S.xp += rem;
          rec.paid += rem;
          rem = 0;
        } else {
          const used = Math.max(cap - S.xp, 0);
          S.xp = cap;
          rem -= used;
          rec.paid += used;
          if (!(G in S.arrive))
            S.arrive[G] = i;
          if (this.gateOk(G)) {
            S.cleared.push(G);
            S.clearedDay[G] = i;
            unlocked.push(G);
          } else {
            S.blocked = G;
            S.lostClamp += rem;
            rec.outcome = "lost_clamp";
            rec.gate = G;
            const g = this.gates[G];
            S.blocks.push({ gate: G, start: i, end: null, streak: g.streak !== undefined && S.s < g.streak, stats: !this.statOk(G) });
            rem = 0;
          }
        }
      }
    }
    if (cfg.dayFloorCap)
      S.fl = Math.min(levelOf(S.xp, cfg.A, cfg.r), (S.fl ?? 1) + cfg.dayFloorCap);
    if (S.blocked !== null && !this.statOk(S.blocked))
      S.bd++;
    if (S.tower === null && S.cleared.includes(100))
      S.tower = i;
    if (dd === 6) {
      const fails = CATS.filter((c) => !S.wdone.includes(c));
      S.wstreak = fails.length >= 2 ? 0 : S.wstreak + 1;
      if (lastWeekOfMonth)
        this.closeMonth();
    }
    S.day = i + 1;
    return { day: i, floor: this.floor(), xp: S.xp, events: out, blocked: S.blocked, unlocked, completed };
  }
  closeMonth() {
    const S = this.state, cfg = this.cfg;
    const failm = CATS.filter((c) => !S.mdone.includes(c));
    for (const c of failm)
      S.stat[c] = Math.max(0, S.stat[c] - cfg.statPen);
    const frozen = S.blocked !== null && !this.statOk(S.blocked) || S.bd > cfg.freezeDays;
    if (!frozen)
      S.s = failm.length >= 2 ? 0 : S.s + 1;
  }
  weekInfo(day) {
    const w = Math.floor(day / 7), m = this.cal.months[this.cal.monthOfWeek[w]];
    return { n: m.weeks.indexOf(w) + 1, of: m.weeks.length };
  }
  petLevels() {
    return { F: this.petLevel("F"), I: this.petLevel("I"), V: this.petLevel("V"), D: this.petLevel("D"), O: this.petLevel("O") };
  }
}
function replay(inputs, cfg = {}) {
  const engine = new Engine(cfg);
  const results = [];
  for (const inp of inputs)
    results.push(engine.processDay(inp));
  return { engine, results };
}
export {
  Engine,
  buildGates,
  cumXp,
  initialState,
  levelOf,
  replay
};
