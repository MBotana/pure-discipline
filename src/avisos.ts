/* Avisos por Telegram. Puro (sin red ni base): decide QUÉ decir y quién lo dice; el servidor se ocupa de redactar con Gemini y entregar.
 * El hombre habla de las estadísticas (leer, ordenar, subidas de nivel). La bestia, del entrenamiento y las comidas. */

export const META = { protG: 150, kcal: 2000, protMinTarde: 90, gymSemMin: 360, ambientes: 5 };

export interface Ctx {
  date: string;                       // fecha local de hoy
  hour: number;                       // hora local 0-23
  dow: number;                        // 0 = domingo … 6 = sábado
  weekStart: string;                  // lunes de esta semana (clave semanal)
  gymMinSem: number;                  // minutos de gimnasio acumulados en la semana (con hoy)
  ambientesSem: number;               // ambientes distintos limpiados en la semana
  leyoHoy: boolean;
  protHoy: number | null;             // gramos de proteína acumulados hoy (null = sin comidas cargadas)
  nivel: { h: number; p: number; stats: Record<string, number> };
  nivelPrev: { h: number; p: number; stats: Record<string, number> } | null;
}
export interface Aviso { kind: string; date: string; voz: 'hombre' | 'behemot'; hechos: string; fallback: string }

export const NOMBRES: Record<string, string> = { F: 'Fuerza', I: 'Inteligencia', V: 'Vitalidad', D: 'Disciplina', O: 'Orden' };

/** Lee proteína y kcal del texto que arma Gemini ("Acumulado hoy: ~1.250 kcal · 95 g de proteína" o "Macros del día…"). */
export function parseMacros(text: string): { kcal: number; prot: number } | null {
  const num = (s: string) => { s = s.trim(); return /^\d{1,3}(\.\d{3})+$/.test(s) ? Number(s.replace(/\./g, '')) : Number(s.replace(',', '.')); };
  const lines = text.split('\n');
  const line = lines.find(l => /acumulado/i.test(l)) ?? lines.find(l => /macros del d[ií]a/i.test(l)) ?? '';
  const k = /([\d.,]+)\s*kcal/i.exec(line), p = /([\d.,]+)\s*g\s*(?:de\s*)?prote/i.exec(line) ?? /prote[ií]na\s*:?\s*~?([\d.,]+)\s*g/i.exec(line);
  if (!p) return null;
  const prot = num(p[1]), kcal = k ? num(k[1]) : 0;
  return Number.isFinite(prot) ? { kcal: Number.isFinite(kcal) ? kcal : 0, prot } : null;
}

export function decide(c: Ctx): Aviso[] {
  const out: Aviso[] = [];
  const dia = (kind: string) => ({ kind, date: c.date }), sem = (kind: string) => ({ kind, date: c.weekStart });
  const activo = c.hour >= 9 && c.hour <= 23;
  if (!activo) return out;

  // ---- La bestia: entrenamiento y comidas ----
  if (c.hour >= 21 && (c.protHoy ?? 0) < META.protMinTarde)
    out.push({ ...dia('b_prot'), voz: 'behemot', hechos: `Son las ${c.hour}:00 y lleva ${Math.round(c.protHoy ?? 0)} g de proteína de ${META.protG} g de meta. Falta la cena. Gritá: FALTA PROTEEE.`, fallback: `FALTA PROTEEE. Llevás ${Math.round(c.protHoy ?? 0)} g de ${META.protG}. Comé algo con proteína ya.` });
  const min = Math.round(c.gymMinSem), h = (m: number) => `${Math.floor(m / 60)} h ${m % 60} min`;
  if (c.gymMinSem >= META.gymSemMin)
    out.push({ ...sem('b_gym_listo'), voz: 'behemot', hechos: `Ya cumplió la meta semanal de gimnasio (${h(min)} de ${h(META.gymSemMin)})${c.dow >= 1 && c.dow <= 5 ? ' antes de que termine la semana' : ''}. Celebralo con orgullo.`, fallback: `Meta de la semana cumplida: ${h(min)}. Así se hace.` });
  else {
    if (c.dow === 4 && c.hour >= 19 && c.gymMinSem < META.gymSemMin / 2)
      out.push({ ...sem('b_gym_poco'), voz: 'behemot', hechos: `Es jueves y lleva ${h(min)} de gimnasio esta semana; la meta es ${h(META.gymSemMin)}. Recriminalo.`, fallback: `Jueves y solo ${h(min)} de ${h(META.gymSemMin)}. Así no se llega. Mañana no se falla.` });
    if (c.dow === 6 && c.hour >= 12)
      out.push({ ...sem('b_gym_sab'), voz: 'behemot', hechos: `Es sábado y la semana cierra con ${h(min)} de gimnasio; la meta era ${h(META.gymSemMin)}. Reproche firme y salida: arrancar fuerte el lunes.`, fallback: `La semana cierra con ${h(min)} de ${h(META.gymSemMin)}. El lunes se arranca fuerte.` });
  }
  if (c.nivelPrev && c.nivel.p > c.nivelPrev.p)
    out.push({ kind: `b_nivel:${c.nivel.p}`, date: 'una vez', voz: 'behemot', hechos: `La bestia subió al nivel ${c.nivel.p}. Gritá exactamente: SOY UNA BESTIAAAA.`, fallback: `SOY UNA BESTIAAAA. Nivel ${c.nivel.p}.` });

  // ---- El hombre: estadísticas ----
  if (c.hour >= 21 && !c.leyoHoy)
    out.push({ ...dia('h_leer'), voz: 'hombre', hechos: `Son las ${c.hour}:00 y hoy no leyó. Recordale que leer alimenta Inteligencia; una página alcanza.`, fallback: 'Hoy no leíste. Unas páginas antes de dormir alcanzan.' });
  if ((c.dow === 5 && c.hour >= 18 || c.dow === 6 && c.hour >= 12) && c.ambientesSem < META.ambientes)
    out.push({ ...sem(c.dow === 5 ? 'h_ordenar' : 'h_ordenar_sab'), voz: 'hombre', hechos: `Esta semana limpió ${c.ambientesSem} de ${META.ambientes} ambientes. Pedile ordenar uno hoy (Orden).`, fallback: `Llevás ${c.ambientesSem} de ${META.ambientes} ambientes. Ordená uno hoy.` });
  if (c.nivelPrev) {
    const subidas = Object.keys(c.nivel.stats).filter(k => c.nivel.stats[k] > (c.nivelPrev!.stats[k] ?? 0)).map(k => `${NOMBRES[k]} ${c.nivel.stats[k]}`);
    if (subidas.length || c.nivel.h > c.nivelPrev.h) {
      const txt = [subidas.length ? `subió ${subidas.join(', ')}` : '', c.nivel.h > c.nivelPrev.h ? `nivel general ${c.nivel.h}` : ''].filter(Boolean).join(' · ');
      out.push({ kind: `h_nivel:${c.nivel.h}:${Object.values(c.nivel.stats).join('-')}`, date: 'una vez', voz: 'hombre', hechos: `Progreso real: ${txt}.`, fallback: `Progreso: ${txt}.` });
    }
  }
  return out;
}
