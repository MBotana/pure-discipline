// engine/src/engine/gasto.ts
var GASTO = {
  desde: "2026-11-13",
  meta: 900,
  metaDom: 500,
  kgDef: 87,
  metPesas: 5,
  metBoxeo: 7.8,
  boxeo: [0, 2]
};
var kpm = (met, kg) => Math.round((met - 1) * 3.5 * kg / 200 * 10) / 10;
var esBoxeo = (inp, dowL) => GASTO.boxeo.includes(inp?.rut ?? dowL);
var gastoCuenta = (fecha) => fecha >= GASTO.desde;
var metaGasto = (dowL) => dowL === 6 ? GASTO.metaDom : GASTO.meta;
var CONTROLES = [["2026-11-20", 85.5], ["2026-11-27", 84.3], ["2026-12-04", 83], ["2026-12-11", 81.8], ["2026-12-18", 80.6], ["2026-12-25", 79.9]];
var EXTRA_KCAL = 150;
function pesoControl(pesos, fecha) {
  for (let q = 0;q < 3; q++) {
    const d = new Date(Date.parse(fecha) - q * 86400000).toISOString().slice(0, 10);
    if (pesos[d] > 0)
      return pesos[d];
  }
  return null;
}
function controles(pesos, fecha) {
  return CONTROLES.map(([d, max]) => {
    const kg = d < fecha ? pesoControl(pesos, d) : null;
    return { d, max, kg, pasado: d < fecha, ok: kg !== null && kg <= max };
  });
}
var extraGasto = (pesos, fecha) => controles(pesos, fecha).filter((c) => c.pasado && !c.ok).length * EXTRA_KCAL;
function gastoDia(inp, dowL, kg, extra = 0) {
  const min = inp?.gymMin ?? (inp?.gym ? 60 : 0), box = esBoxeo(inp, dowL), k = kpm(box ? GASTO.metBoxeo : GASTO.metPesas, kg || GASTO.kgDef);
  const gym = Math.round(min * k), aero = Math.round(Number(inp?.aeroKcal) || 0);
  return { min, box, kpm: k, gym, aero, total: gym + aero, meta: metaGasto(dowL) + extra, extra };
}

// engine/src/engine/resumen.ts
var DIA = 86400000;
var addD = (iso, n) => new Date(Date.parse(iso) + n * DIA).toISOString().slice(0, 10);
var dowL = (iso) => (new Date(iso + "T00:00:00Z").getUTCDay() + 6) % 7;
var lunesDe = (iso) => addD(iso, -dowL(iso));
var idxDe = (iso, start) => Math.round((Date.parse(iso) - Date.parse(start)) / DIA);
var META = { gymSemMin: 360, ambientes: 5, comida: 0.8, aguaDias: 5, lecturaDias: 4, juegosH: 15 };
var MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
var nombreMes = (ym) => MESES[+ym.slice(5, 7) - 1] + " " + ym.slice(0, 4);
var gymMin = (i) => i?.gymMin ?? (i?.gym ? 60 : 0);
var agua = (i) => (i?.waterMl ?? 0) >= 1000 || !!i?.water;
function pesoHasta(inp, fecha) {
  let best = "", kg = GASTO.kgDef;
  for (const [d, i] of Object.entries(inp))
    if (d <= fecha && d > best && i?.weightKg > 0) {
      best = d;
      kg = +i.weightKg;
    }
  return kg;
}
var pesosDe = (inp) => Object.fromEntries(Object.entries(inp).filter(([, i]) => i?.weightKg > 0).map(([d, i]) => [d, +i.weightKg]));
function puntajeDia(i, fecha, kg = GASTO.kgDef, extra = 0) {
  const wd = dowL(fecha) < 5, g = gastoCuenta(fecha);
  const lista = [gymMin(i) >= 40, !!i?.read, (i?.rooms ?? (i?.room ? [i.room] : [])).length > 0, agua(i), (i?.weightKg ?? 0) > 0, ...wd ? [i?.foodPct !== undefined] : []];
  if (g) {
    const x = gastoDia(i, dowL(fecha), kg, extra);
    lista.push(x.total >= x.meta);
  }
  return Math.min(1, lista.filter(Boolean).length / lista.length);
}
function semanas(inp, start, hoy) {
  const out = [], P = pesosDe(inp);
  for (let lun = start;lun <= hoy; lun = addD(lun, 7)) {
    const s = { lunes: lun, completa: addD(lun, 6) < hoy, dias: 0, gastoDias: 0, gastoN: 0, score: null, gymMin: 0, sess: 0, comida: null, aguaDias: 0, lecturaDias: 0, ambientes: 0, prog: 0, juegosH: 0, peso: null, pesoN: 0 };
    let sc = 0, n = 0;
    const comida = [], pesos = [], amb = new Set;
    for (let q = 0;q < 7; q++) {
      const d = addD(lun, q);
      if (d > hoy)
        break;
      const i = inp[d] ?? {}, kg = pesoHasta(inp, d), ex = extraGasto(P, d);
      s.dias++;
      if (d < hoy) {
        sc += puntajeDia(i, d, kg, ex);
        n++;
      }
      if (gastoCuenta(d)) {
        const g = gastoDia(i, q, kg, ex);
        s.gastoN++;
        if (g.total >= g.meta)
          s.gastoDias++;
      }
      const m = gymMin(i);
      s.gymMin += m;
      if (m >= 40)
        s.sess++;
      if (i.foodPct !== undefined)
        comida.push(Number(i.foodPct));
      if (agua(i))
        s.aguaDias++;
      if (i.read)
        s.lecturaDias++;
      for (const r of i.rooms ?? [])
        amb.add(r);
      s.prog += (i.prog ?? []).length;
      s.juegosH += Number(i.gameH) || 0;
      if (i.weightKg > 0)
        pesos.push(+i.weightKg);
    }
    s.score = n ? sc / n : null;
    s.ambientes = amb.size;
    s.comida = comida.length ? comida.reduce((a, b) => a + b, 0) / comida.length : null;
    s.pesoN = pesos.length;
    s.peso = pesos.length ? pesos.reduce((a, b) => a + b, 0) / pesos.length : null;
    out.push(s);
  }
  return out;
}
function meses(inp, start, hoy) {
  const m = {}, P = pesosDe(inp);
  for (let d = start;d < hoy; d = addD(d, 1)) {
    const k = d.slice(0, 7), x = m[k] ??= { sc: 0, n: 0, g: 0 };
    x.sc += puntajeDia(inp[d] ?? {}, d, pesoHasta(inp, d), extraGasto(P, d));
    x.n++;
    x.g += gymMin(inp[d]);
  }
  return Object.entries(m).map(([ym, x]) => ({ ym, dias: x.n, score: x.sc / x.n, gymMin: x.g }));
}
function destacados(inp, start, hoy) {
  const S = semanas(inp, start, hoy), comp = S.filter((s) => s.completa && s.score !== null), M = meses(inp, start, hoy).filter((m) => m.dias >= 7), P = pesosDe(inp);
  const by = (a, f, mx) => a.length ? a.reduce((p, c) => (mx ? f(c) > f(p) : f(c) < f(p)) ? c : p) : null;
  let racha = 0, cur = 0;
  for (let d = start;d < hoy; d = addD(d, 1)) {
    cur = puntajeDia(inp[d] ?? {}, d, pesoHasta(inp, d), extraGasto(P, d)) >= 0.8 ? cur + 1 : 0;
    racha = Math.max(racha, cur);
  }
  const conPeso = S.filter((s) => s.peso !== null);
  return {
    mejorSemana: by(comp, (s) => s.score, true),
    peorSemana: comp.length > 1 ? by(comp, (s) => s.score, false) : null,
    mejorMes: by(M, (m) => m.score, true),
    peorMes: M.length > 1 ? by(M, (m) => m.score, false) : null,
    rachaDias: racha,
    gymRecord: by(S.filter((s) => s.gymMin > 0), (s) => s.gymMin, true),
    pesoInicio: conPeso.length ? conPeso[0].peso : null,
    pesoActual: conPeso.length ? conPeso[conPeso.length - 1].peso : null
  };
}
function ajustePeso(dl) {
  if (!dl.length)
    return "";
  const b = dl[dl.length - 1], a = dl.length > 1 ? dl[dl.length - 2] : null;
  if (a !== null && a > -0.7 && b > -0.7)
    return "Dos semanas bajando menos de 0,7 kg: recortá 150 kcal por día o subí 150 kcal la meta de gasto";
  if (dl.length >= 2 && b < -1.5)
    return "Bajaste más de 1,5 kg en la semana: sumá 150 kcal por día";
  if (b <= -0.8 && b >= -1.3)
    return "Vas en el ritmo (0,8 a 1,3 kg por semana): no toques nada";
  return "";
}
var fh = (m) => `${Math.floor(m / 60)} h ${Math.round(m % 60)} min`;
var fm = (x) => String(+x.toFixed(1)).replace(".", ",");
function sugerencias(inp, start, hoy) {
  const S = semanas(inp, start, hoy), ref = S.filter((s) => s.completa).pop();
  if (!ref)
    return [];
  const out = [];
  const P = S.filter((s) => s.completa && s.pesoN >= 3), dl = P.slice(1).map((s, i) => s.peso - P[i].peso);
  if (ref.pesoN < 3)
    out.push({ tema: "Peso", texto: `Pesaste tu peso ${ref.pesoN} día${ref.pesoN === 1 ? "" : "s"} la semana pasada. Hacelo todos los días en ayunas para ver la tendencia real.` });
  else if (dl.length >= 2 && P[P.length - 1] === ref) {
    const t = ajustePeso(dl);
    if (t)
      out.push({ tema: "Peso", texto: t + ` (promedio ${fm(ref.peso)} kg)` });
  }
  const idxRef = idxDe(ref.lunes, start) / 7, fase = idxRef % 4;
  if (fase === 1 || fase === 2) {
    const mejor = (lun) => {
      const m = {}, sensacion = {};
      for (let q = 0;q < 7; q++) {
        const i = inp[addD(lun, q)] ?? {};
        for (const [n, arr] of Object.entries(i.lifts ?? {}))
          for (const s of arr ?? [])
            if (s?.ok && s.w > 0)
              m[n] = Math.max(m[n] ?? 0, +s.w);
        for (const [n, f] of Object.entries(i.feel ?? {}))
          (sensacion[n] ??= []).push(f);
      }
      return { m, sensacion };
    };
    const a = mejor(addD(ref.lunes, -7)), b = mejor(ref.lunes), est = [];
    for (const n of Object.keys(b.m))
      if (a.m[n] !== undefined && b.m[n] <= a.m[n])
        est.push(n);
    for (const n of est.slice(0, 2)) {
      const duro = (b.sensacion[n] ?? []).includes("d");
      out.push({ tema: "Gimnasio", texto: duro ? `Estancado en ${n} y se sintió duro. Bajá un 5-10% el peso unas semanas y volvé a subir; revisá sueño y comida.` : `No subiste el peso en ${n}. Sumá 1-2 repeticiones o una serie antes de subir la carga, y cuidá la técnica.` });
    }
  }
  if (ref.gastoN >= 5 && ref.gastoDias < ref.gastoN - 1)
    out.push({ tema: "Gasto", texto: `Llegaste al gasto del día ${ref.gastoDias} de ${ref.gastoN} días. Después del gimnasio sumá bici hasta cerrar las ${GASTO.meta} kcal.` });
  if (ref.gymMin < META.gymSemMin)
    out.push({ tema: "Gimnasio", texto: `Hiciste ${fh(ref.gymMin)} de ${fh(META.gymSemMin)}. Reservá desde el lunes los días y horarios fijos de la semana.` });
  if (ref.comida !== null && ref.comida < META.comida)
    out.push({ tema: "Comida", texto: `La alimentación promedió ${Math.round(ref.comida * 100)}% (la meta es 80%). Cargá las tres comidas y cuidá la proteína.` });
  if (ref.aguaDias < META.aguaDias)
    out.push({ tema: "Agua", texto: `Llegaste al litro de agua ${ref.aguaDias} de 7 días. Una botella a la mañana y otra a la tarde.` });
  if (ref.lecturaDias < META.lecturaDias)
    out.push({ tema: "Lectura", texto: `Leíste ${ref.lecturaDias} de 7 días. Diez páginas antes de dormir alcanzan.` });
  if (ref.ambientes < META.ambientes)
    out.push({ tema: "Orden", texto: `Ordenaste ${ref.ambientes} de ${META.ambientes} ambientes. Elegí hoy el primero de la semana.` });
  if (ref.juegosH > META.juegosH)
    out.push({ tema: "Juegos", texto: `Jugaste ${fm(ref.juegosH)} h (tope ${META.juegosH} h). Poné un horario límite.` });
  return out;
}
export {
  META,
  addD,
  ajustePeso,
  destacados,
  dowL,
  lunesDe,
  meses,
  nombreMes,
  pesoHasta,
  pesosDe,
  puntajeDia,
  semanas,
  sugerencias
};
