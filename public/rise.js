// engine/src/engine/calendar.ts
function addDays(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n));
}
function dateOfDay(startDate, day) {
  return addDays(startDate, day).toISOString().slice(0, 10);
}

// engine/src/engine/rise.ts
var CATS = ["F", "I", "V", "D", "O"];
var ROOMS = ["cocina", "bano", "habitacion", "living", "oficina", "patio"];
var RISE = {
  startDate: "2026-11-09",
  xpA: 300,
  xpB: 15,
  xpScale: 0.8,
  statMax: 99,
  balanceGap: 15,
  sessionMin: 40,
  fuerzaPerMin: 1.6,
  fuerzaCapMin: 1440,
  fuerzaWeekMin: 360,
  fuerzaMonthMin: 1440,
  fuerzaW: 250,
  fuerzaM: 650,
  readXp: 60,
  bookFirst: 2500,
  bookNext: 1250,
  foodDay: 105,
  waterXp: 15,
  weighXp: 15,
  foodThr: 0.8,
  vitW: 250,
  vitM: 650,
  cleanFirst: 100,
  cleanExtra: 40,
  cleanDaysMax: 5,
  cleanRoomsWeek: 5,
  ordenW: 250,
  repairFirst: 1100,
  repairNext: 550,
  gameCapH: 15,
  discW: 750,
  discM: 1100,
  petA: 369.1,
  petR: 1.03,
  petMax: 100,
  petStatMax: 0,
  sessXp: 100,
  sessMax: 5,
  progXp: 150,
  progWeekBonus: 300,
  cycleBonus: 1000,
  cycleNeed: 4,
  cycleWeeks: 4
};
var HERO_TITLES = [
  { avg: 1, name: "Recién despertado" },
  { avg: 10, name: "Aprendiz" },
  { avg: 20, name: "Constante" },
  { avg: 30, name: "Templado" },
  { avg: 40, name: "Curtido" },
  { avg: 50, name: "Veterano" },
  { avg: 60, name: "Forjado" },
  { avg: 70, name: "Imparable" },
  { avg: 80, name: "Maestro" },
  { avg: 90, name: "Leyenda" },
  { avg: 99, name: "Inmortal" }
];
var PET_TITLES = [
  { lvl: 1, name: "Cría de sombra" },
  { lvl: 10, name: "Sombra joven" },
  { lvl: 20, name: "Cazador" },
  { lvl: 35, name: "Bestia curtida" },
  { lvl: 50, name: "Devorador" },
  { lvl: 65, name: "Terror nocturno" },
  { lvl: 80, name: "Señor del abismo" },
  { lvl: 100, name: "Bestia suprema" }
];
var zero = () => ({ F: 0, I: 0, V: 0, D: 0, O: 0 });
function ladder(k, idx) {
  if (k <= 1)
    return 1 + 0.125 * Math.min(idx, 4);
  if (k <= 4)
    return [0, 0, 2, 2.25, 2.5][k];
  return Math.min(6, 3 + 0.5 * Math.floor((k - 5) / 4));
}
var needSessions = (k) => k <= 1 ? 5 : k <= 4 ? 4 : 3;
function initialRise(cfg = RISE) {
  return {
    day: 0,
    xp: zero(),
    petXp: 0,
    petAlloc: zero(),
    k: 1,
    titles: {},
    petTitles: {},
    wk: { sess: 0, min: 0, cleanDays: 0, rooms: [], food: [], gameH: 0, prog: 0 },
    mo: { ym: dateOfDay(cfg.startDate, 0).slice(0, 7), min: 0, food: [], books: 0, repairs: 0, discOk: true },
    cyc: [],
    totals: { gym: 0, books: 0, repairs: 0 }
  };
}
var mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;

class Rise {
  cfg;
  state;
  cumStat;
  cumPet;
  constructor(cfg = {}, state) {
    this.cfg = { ...RISE, ...cfg };
    this.state = state ? structuredClone(state) : initialRise(this.cfg);
    const c = this.cfg;
    this.cumStat = [0, 0];
    let pts = 0;
    for (let L = 1;L < c.statMax; L++) {
      pts += Math.floor(L + c.xpA * Math.pow(2, L / c.xpB));
      this.cumStat.push(Math.floor(pts / 4) * c.xpScale);
    }
    this.cumPet = [0];
    for (let n = 0;n < c.petMax; n++)
      this.cumPet.push(this.cumPet[n] + c.petA * Math.pow(c.petR, n));
  }
  xpForLevel(L) {
    return this.cumStat[Math.max(1, Math.min(L, this.cfg.statMax))];
  }
  statCost(L) {
    return this.cumStat[L + 1] - this.cumStat[L];
  }
  statLevel(c) {
    let L = 1;
    while (L < this.cfg.statMax && this.state.xp[c] >= this.cumStat[L + 1] - 0.000000001)
      L++;
    return L;
  }
  statProgress(c) {
    const L = this.statLevel(c), max = L >= this.cfg.statMax, into = this.state.xp[c] - this.cumStat[L];
    return { level: L, max, into, cost: max ? 0 : this.statCost(L), pct: max ? 1 : into / this.statCost(L) };
  }
  level() {
    return Math.min(this.cfg.statMax, Math.floor(CATS.reduce((a, c) => a + Math.min(this.cfg.statMax, this.eff(c)), 0) / CATS.length));
  }
  totalLevel() {
    return CATS.reduce((a, c) => a + this.statLevel(c), 0);
  }
  titleIndex() {
    const ks = Object.keys(this.state.titles).map(Number);
    return ks.length ? Math.max(...ks) : 0;
  }
  titleName() {
    return HERO_TITLES[this.titleIndex()].name;
  }
  nextTitle() {
    const i = this.titleIndex() + 1;
    if (i >= HERO_TITLES.length)
      return null;
    const t = HERO_TITLES[i], min = Math.max(1, t.avg - this.cfg.balanceGap);
    return { index: i, name: t.name, avg: t.avg, min, low: CATS.filter((c) => this.eff(c) < min), missingAvg: Math.max(0, t.avg - this.level()) };
  }
  petTitleIndex() {
    const ks = Object.keys(this.state.petTitles).map(Number);
    return ks.length ? Math.max(...ks) : -1;
  }
  petTitleName() {
    const i = this.petTitleIndex();
    return i < 0 ? "Huevo" : PET_TITLES[i].name;
  }
  petLevel() {
    let n = 0;
    while (n < this.cfg.petMax && this.state.petXp >= this.cumPet[n + 1] - 0.000000001)
      n++;
    return n;
  }
  petProgress() {
    const n = this.petLevel(), max = n >= this.cfg.petMax, into = this.state.petXp - this.cumPet[n];
    const cost = this.cfg.petA * Math.pow(this.cfg.petR, n);
    return { level: n, max, into, cost: max ? 0 : cost, pct: max ? 1 : into / cost };
  }
  petPending() {
    return this.petLevel() - CATS.reduce((a, c) => a + this.state.petAlloc[c], 0);
  }
  eff(c) {
    return this.statLevel(c) + this.state.petAlloc[c];
  }
  weekType(day) {
    return Math.floor(day / 7) % this.cfg.cycleWeeks === this.cfg.cycleWeeks - 1 ? "descarga" : "carga";
  }
  streakMult() {
    return ladder(this.state.k, Math.min(this.state.wk.sess, this.cfg.sessMax - 1));
  }
  processDay(raw = {}) {
    const S = this.state, c = this.cfg, i = S.day;
    const date = dateOfDay(c.startDate, i), dd = i % 7, ym = date.slice(0, 7), w = Math.floor(i / 7);
    const ev = [];
    const add = (cat, kind, label, amount) => {
      if (amount <= 0)
        return;
      ev.push({ day: i, cat, kind, label, amount });
      if (cat === "pet")
        S.petXp += amount;
      else
        S.xp[cat] += amount;
    };
    const inp = normalize(raw, c);
    if (dd === 0)
      S.wk = { sess: 0, min: 0, cleanDays: 0, rooms: [], food: [], gameH: 0, prog: 0 };
    if (ym !== S.mo.ym)
      S.mo = { ym, min: 0, food: [], books: 0, repairs: 0, discOk: true };
    const minutes = inp.gymMin ?? 0;
    if (minutes > 0) {
      add("F", "D", "Gimnasio", Math.min(minutes, c.fuerzaCapMin) * c.fuerzaPerMin);
      S.wk.min += minutes;
      S.mo.min += minutes;
      S.totals.gym += minutes;
    }
    if (minutes >= c.sessionMin) {
      if (S.wk.sess < c.sessMax)
        add("pet", "D", "Sesión", c.sessXp * ladder(S.k, S.wk.sess));
      S.wk.sess++;
    }
    for (const ex of inp.prog ?? []) {
      add("pet", "D", "Progreso: " + ex, c.progXp * ladder(S.k, 4));
      S.wk.prog++;
      if (!S.cyc.includes(ex))
        S.cyc.push(ex);
    }
    if (inp.read)
      add("I", "D", "Lectura", c.readXp);
    for (const b of inp.books ?? []) {
      add("I", "D", "Libro: " + b.t, S.mo.books === 0 ? c.bookFirst : c.bookNext);
      S.mo.books++;
      S.totals.books++;
    }
    const rooms = [...new Set(inp.rooms ?? [])];
    if (rooms.length) {
      if (S.wk.cleanDays < c.cleanDaysMax)
        add("O", "D", "Limpieza", c.cleanFirst);
      S.wk.cleanDays++;
      for (const r of rooms.slice(1))
        if (!S.wk.rooms.includes(r))
          add("O", "D", "Ambiente extra", c.cleanExtra);
      for (const r of rooms)
        if (!S.wk.rooms.includes(r))
          S.wk.rooms.push(r);
    }
    for (const r of inp.repairs ?? []) {
      add("O", "D", "Arreglo: " + r.t, S.mo.repairs === 0 ? c.repairFirst : c.repairNext);
      S.mo.repairs++;
      S.totals.repairs++;
    }
    if (dd < 5) {
      const pct = Math.max(0, Math.min(1, inp.foodPct ?? 0));
      add("V", "D", "Comida", c.foodDay * pct);
      S.wk.food.push(pct);
      S.mo.food.push(pct);
    }
    if (inp.water)
      add("V", "D", "Agua", c.waterXp);
    if ((inp.weightKg ?? 0) > 0)
      add("V", "D", "Peso", c.weighXp);
    if (inp.gameH)
      S.wk.gameH += inp.gameH;
    const nextYm = dateOfDay(c.startDate, i + 1).slice(0, 7);
    if (dd === 6) {
      if (S.wk.min >= c.fuerzaWeekMin)
        add("F", "W", "Semana en el gimnasio", c.fuerzaW);
      if (mean(S.wk.food) >= c.foodThr - 0.000000001 && S.wk.food.length)
        add("V", "W", "Semana de comida", c.vitW);
      if (S.wk.rooms.length >= c.cleanRoomsWeek)
        add("O", "W", "Semana de orden", c.ordenW);
      if (S.wk.gameH <= c.gameCapH + 0.000000001)
        add("D", "W", "Horas de juego en el tope", c.discW);
      else
        S.mo.discOk = false;
      if (S.wk.prog > 0)
        add("pet", "W", "Progreso semanal", c.progWeekBonus);
      if (this.weekType(i) === "descarga") {
        if (S.cyc.length >= c.cycleNeed)
          add("pet", "W", "Ciclo completo", c.cycleBonus);
        S.cyc = [];
      }
      S.k = S.wk.sess >= needSessions(S.k) ? S.k + 1 : 1;
    }
    if (nextYm !== ym) {
      if (S.mo.min >= c.fuerzaMonthMin)
        add("F", "M", "Mes en el gimnasio", c.fuerzaM);
      if (S.mo.food.length && mean(S.mo.food) >= c.foodThr - 0.000000001)
        add("V", "M", "Mes de comida", c.vitM);
      if (S.mo.discOk)
        add("D", "M", "Mes sin pasarse de horas", c.discM);
    }
    for (const cat of inp.alloc ?? []) {
      if (this.petPending() > 0 && S.petAlloc[cat] < c.petStatMax)
        S.petAlloc[cat]++;
    }
    const unlocked = [], petUnlocked = [];
    const level = this.level();
    HERO_TITLES.forEach((t, k) => {
      if (S.titles[k] !== undefined)
        return;
      if (level >= t.avg && CATS.every((cat) => this.eff(cat) >= Math.max(1, t.avg - c.balanceGap))) {
        S.titles[k] = i;
        unlocked.push(k);
      }
    });
    const pl = this.petLevel();
    PET_TITLES.forEach((t, k) => {
      if (S.petTitles[k] === undefined && pl >= t.lvl) {
        S.petTitles[k] = i;
        petUnlocked.push(k);
      }
    });
    S.day = i + 1;
    return { day: i, date, events: ev, level, unlocked, petUnlocked };
  }
}
function normalize(r, c = RISE) {
  const o = { ...r };
  if (o.gymMin === undefined && r.gym)
    o.gymMin = 60;
  if (o.foodPct === undefined) {
    if (r.food)
      o.foodPct = 1;
    else if (r.meals)
      o.foodPct = 0.5;
  }
  if (o.water === undefined && (r.waterMl ?? 0) >= 1000)
    o.water = true;
  return o;
}
function replayRise(inputs, cfg = {}) {
  const engine = new Rise(cfg);
  const days = [];
  for (const x of inputs)
    days.push(engine.processDay(x));
  return { engine, days };
}
export {
  CATS,
  HERO_TITLES,
  PET_TITLES,
  RISE,
  ROOMS,
  Rise,
  initialRise,
  ladder,
  needSessions,
  normalize,
  replayRise
};
