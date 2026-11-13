/** Histórico y sugerencias (puro, sin dependencias): lo usan la app (Registro) y el servidor (aviso del lunes). */
import { gastoDia, gastoCuenta, GASTO, extraGasto, comidaPuntua } from './gasto.ts';
export type Inputs = Record<string, any>;
const DIA = 864e5;
export const addD = (iso: string, n: number) => new Date(Date.parse(iso) + n * DIA).toISOString().slice(0, 10);
export const dowL = (iso: string) => (new Date(iso + 'T00:00:00Z').getUTCDay() + 6) % 7;          // 0 = lunes
export const lunesDe = (iso: string) => addD(iso, -dowL(iso));
const idxDe = (iso: string, start: string) => Math.round((Date.parse(iso) - Date.parse(start)) / DIA);
export const META = { gymSemMin: 360, ambientes: 5, comida: 0.8, aguaDias: 5, lecturaDias: 4, juegosH: 15 };
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const nombreMes = (ym: string) => MESES[+ym.slice(5, 7) - 1] + ' ' + ym.slice(0, 4);

const gymMin = (i: any) => i?.gymMin ?? (i?.gym ? 60 : 0);
const agua = (i: any) => (i?.waterMl ?? 0) >= 1000 || !!i?.water;
/** Último peso registrado hasta esa fecha (para el gasto del gimnasio). */
export function pesoHasta(inp: Inputs, fecha: string): number {
  let best = '', kg = GASTO.kgDef;
  for (const [d, i] of Object.entries(inp)) if (d <= fecha && d > best && (i as any)?.weightKg > 0) { best = d; kg = +(i as any).weightKg; }
  return kg;
}
/** Pesajes por fecha. */
export const pesosDe = (inp: Inputs): Record<string, number> => Object.fromEntries(Object.entries(inp).filter(([, i]) => (i as any)?.weightKg > 0).map(([d, i]) => [d, +(i as any).weightKg]));
/** Cumplimiento del día de 0 a 1: misiones hechas sobre las que corresponden (6 de lunes a viernes, 5 el fin de semana; +1 con el gasto desde el modo corte). */
export function puntajeDia(i: any, fecha: string, kg: number = GASTO.kgDef, extra = 0): number {
  const wd = comidaPuntua(fecha), g = gastoCuenta(fecha);
  const lista = [gymMin(i) >= 40, !!i?.read, (i?.rooms ?? (i?.room ? [i.room] : [])).length > 0, agua(i), (i?.weightKg ?? 0) > 0, ...(wd ? [i?.foodPct !== undefined] : [])];
  if (g) { const x = gastoDia(i, dowL(fecha), kg, extra); lista.push(x.total >= x.meta); }
  return Math.min(1, lista.filter(Boolean).length / lista.length);
}

export interface Sem { lunes: string; completa: boolean; dias: number; gastoDias: number; gastoN: number; score: number | null; gymMin: number; sess: number; comida: number | null; aguaDias: number; lecturaDias: number; ambientes: number; prog: number; juegosH: number; peso: number | null; pesoN: number }
/** Resumen por semana (lunes a domingo) desde el inicio hasta hoy. El puntaje usa solo días ya terminados. */
export function semanas(inp: Inputs, start: string, hoy: string): Sem[] {
  const out: Sem[] = [], P = pesosDe(inp);
  for (let lun = start; lun <= hoy; lun = addD(lun, 7)) {
    const s: Sem = { lunes: lun, completa: addD(lun, 6) < hoy, dias: 0, gastoDias: 0, gastoN: 0, score: null, gymMin: 0, sess: 0, comida: null, aguaDias: 0, lecturaDias: 0, ambientes: 0, prog: 0, juegosH: 0, peso: null, pesoN: 0 };
    let sc = 0, n = 0; const comida: number[] = [], pesos: number[] = [], amb = new Set<string>();
    for (let q = 0; q < 7; q++) {
      const d = addD(lun, q); if (d > hoy) break;
      const i = inp[d] ?? {}, kg = pesoHasta(inp, d), ex = extraGasto(P, d); s.dias++;
      if (d < hoy) { sc += puntajeDia(i, d, kg, ex); n++; }
      if (gastoCuenta(d)) { const g = gastoDia(i, q, kg, ex); s.gastoN++; if (g.total >= g.meta) s.gastoDias++; }
      const m = gymMin(i); s.gymMin += m; if (m >= 40) s.sess++;
      if (i.foodPct !== undefined) comida.push(Number(i.foodPct));
      if (agua(i)) s.aguaDias++; if (i.read) s.lecturaDias++;
      for (const r of i.rooms ?? []) amb.add(r);
      s.prog += (i.prog ?? []).length; s.juegosH += Number(i.gameH) || 0;
      if (i.weightKg > 0) pesos.push(+i.weightKg);
    }
    s.score = n ? sc / n : null; s.ambientes = amb.size;
    s.comida = comida.length ? comida.reduce((a, b) => a + b, 0) / comida.length : null;
    s.pesoN = pesos.length; s.peso = pesos.length ? pesos.reduce((a, b) => a + b, 0) / pesos.length : null;
    out.push(s);
  }
  return out;
}

export interface Mes { ym: string; dias: number; score: number; gymMin: number }
export function meses(inp: Inputs, start: string, hoy: string): Mes[] {
  const m: Record<string, { sc: number; n: number; g: number }> = {}, P = pesosDe(inp);
  for (let d = start; d < hoy; d = addD(d, 1)) { const k = d.slice(0, 7), x = (m[k] ??= { sc: 0, n: 0, g: 0 }); x.sc += puntajeDia(inp[d] ?? {}, d, pesoHasta(inp, d), extraGasto(P, d)); x.n++; x.g += gymMin(inp[d]); }
  return Object.entries(m).map(([ym, x]) => ({ ym, dias: x.n, score: x.sc / x.n, gymMin: x.g }));
}

export interface Destacados {
  mejorSemana: Sem | null; peorSemana: Sem | null; mejorMes: Mes | null; peorMes: Mes | null;
  rachaDias: number; gymRecord: Sem | null; pesoInicio: number | null; pesoActual: number | null;
}
export function destacados(inp: Inputs, start: string, hoy: string): Destacados {
  const S = semanas(inp, start, hoy), comp = S.filter(s => s.completa && s.score !== null), M = meses(inp, start, hoy).filter(m => m.dias >= 7), P = pesosDe(inp);
  const by = <T>(a: T[], f: (x: T) => number, mx: boolean) => a.length ? a.reduce((p, c) => (mx ? f(c) > f(p) : f(c) < f(p)) ? c : p) : null;
  let racha = 0, cur = 0;
  for (let d = start; d < hoy; d = addD(d, 1)) { cur = puntajeDia(inp[d] ?? {}, d, pesoHasta(inp, d), extraGasto(P, d)) >= 0.8 ? cur + 1 : 0; racha = Math.max(racha, cur); }
  const conPeso = S.filter(s => s.peso !== null);
  return {
    mejorSemana: by(comp, s => s.score!, true), peorSemana: comp.length > 1 ? by(comp, s => s.score!, false) : null,
    mejorMes: by(M, m => m.score, true), peorMes: M.length > 1 ? by(M, m => m.score, false) : null,
    rachaDias: racha, gymRecord: by(S.filter(s => s.gymMin > 0), s => s.gymMin, true),
    pesoInicio: conPeso.length ? conPeso[0].peso : null, pesoActual: conPeso.length ? conPeso[conPeso.length - 1].peso : null,
  };
}

/** Modo corte: objetivo de 0,8 a 1,3 kg por semana (promedios semanales). dl = diferencias entre semanas completas, la última al final. */
export function ajustePeso(dl: number[]): string {
  if (!dl.length) return '';
  const b = dl[dl.length - 1], a = dl.length > 1 ? dl[dl.length - 2] : null;
  if (a !== null && a > -0.7 && b > -0.7) return 'Dos semanas bajando menos de 0,7 kg: recortá 150 kcal por día o subí 150 kcal la meta de gasto';
  if (dl.length >= 2 && b < -1.5) return 'Bajaste más de 1,5 kg en la semana: sumá 150 kcal por día';
  if (b <= -0.8 && b >= -1.3) return 'Vas en el ritmo (0,8 a 1,3 kg por semana): no toques nada';
  return '';
}
const fh = (m: number) => `${Math.floor(m / 60)} h ${Math.round(m % 60)} min`;
const fm = (x: number) => String(+x.toFixed(1)).replace('.', ',');
/** Sugerencias de la semana que terminó (la última completa). Vacío si todavía no terminó ninguna. */
export function sugerencias(inp: Inputs, start: string, hoy: string): { tema: string; texto: string }[] {
  const S = semanas(inp, start, hoy), ref = S.filter(s => s.completa).pop();
  if (!ref) return [];
  const out: { tema: string; texto: string }[] = [];
  // Peso: promedios semanales (con 3 o más pesajes)
  const P = S.filter(s => s.completa && s.pesoN >= 3), dl = P.slice(1).map((s, i) => s.peso! - P[i].peso!);
  if (ref.pesoN < 3) out.push({ tema: 'Peso', texto: `Pesaste tu peso ${ref.pesoN} día${ref.pesoN === 1 ? '' : 's'} la semana pasada. Hacelo todos los días en ayunas para ver la tendencia real.` });
  else if (dl.length >= 2 && P[P.length - 1] === ref) {
    const t = ajustePeso(dl); if (t) out.push({ tema: 'Peso', texto: t + ` (promedio ${fm(ref.peso!)} kg)` });
  }
  // Gimnasio: estancamiento por ejercicio dentro del ciclo (semana progresiva o máxima que no superó a la anterior)
  const idxRef = idxDe(ref.lunes, start) / 7, fase = idxRef % 4;
  if (fase === 1 || fase === 2) {
    const mejor = (lun: string) => { const m: Record<string, number> = {}, sensacion: Record<string, string[]> = {}; for (let q = 0; q < 7; q++) { const i = inp[addD(lun, q)] ?? {}; for (const [n, arr] of Object.entries<any>(i.lifts ?? {})) for (const s of arr ?? []) if (s?.ok && s.w > 0) m[n] = Math.max(m[n] ?? 0, +s.w); for (const [n, f] of Object.entries<any>(i.feel ?? {})) (sensacion[n] ??= []).push(f); } return { m, sensacion }; };
    const a = mejor(addD(ref.lunes, -7)), b = mejor(ref.lunes), est: string[] = [];
    for (const n of Object.keys(b.m)) if (a.m[n] !== undefined && b.m[n] <= a.m[n]) est.push(n);
    for (const n of est.slice(0, 2)) {
      const duro = (b.sensacion[n] ?? []).includes('d');
      out.push({ tema: 'Gimnasio', texto: duro ? `Estancado en ${n} y se sintió duro. Bajá un 5-10% el peso unas semanas y volvé a subir; revisá sueño y comida.` : `No subiste el peso en ${n}. Sumá 1-2 repeticiones o una serie antes de subir la carga, y cuidá la técnica.` });
    }
  }
  if (ref.gastoN >= 5 && ref.gastoDias < ref.gastoN - 1) out.push({ tema: 'Gasto', texto: `Llegaste al gasto del día ${ref.gastoDias} de ${ref.gastoN} días. Después del gimnasio sumá bici hasta cerrar las ${GASTO.meta} kcal.` });
  if (ref.gymMin < META.gymSemMin) out.push({ tema: 'Gimnasio', texto: `Hiciste ${fh(ref.gymMin)} de ${fh(META.gymSemMin)}. Reservá desde el lunes los días y horarios fijos de la semana.` });
  if (ref.comida !== null && ref.comida < META.comida) out.push({ tema: 'Comida', texto: `La alimentación promedió ${Math.round(ref.comida * 100)}% (la meta es 80%). Cargá las tres comidas y cuidá la proteína.` });
  if (ref.aguaDias < META.aguaDias) out.push({ tema: 'Agua', texto: `Llegaste al litro de agua ${ref.aguaDias} de 7 días. Una botella a la mañana y otra a la tarde.` });
  if (ref.lecturaDias < META.lecturaDias) out.push({ tema: 'Lectura', texto: `Leíste ${ref.lecturaDias} de 7 días. Diez páginas antes de dormir alcanzan.` });
  if (ref.ambientes < META.ambientes) out.push({ tema: 'Orden', texto: `Ordenaste ${ref.ambientes} de ${META.ambientes} ambientes. Elegí hoy el primero de la semana.` });
  if (ref.juegosH > META.juegosH) out.push({ tema: 'Juegos', texto: `Jugaste ${fm(ref.juegosH)} h (tope ${META.juegosH} h). Poné un horario límite.` });
  return out;
}
