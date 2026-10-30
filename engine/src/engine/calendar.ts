/** Calendario: semanas lunes→domingo; cada semana pertenece al mes de su jueves. Aritmética en UTC, sin zona horaria. */
export interface MonthInfo { ym: string; weeks: number[] }

function addDays(iso: string, n: number): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n));
}

export function isMonday(iso: string): boolean {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 1;
}

export function buildCalendar(startDate: string, weeks = 520) {
  if (!isMonday(startDate)) throw new Error('startDate debe ser lunes');
  const monthOfWeek: number[] = [];
  const months: MonthInfo[] = [];
  for (let k = 0; k < weeks; k++) {
    const thu = addDays(startDate, 7 * k + 3);
    const ym = `${thu.getUTCFullYear()}-${String(thu.getUTCMonth() + 1).padStart(2, '0')}`;
    if (!months.length || months[months.length - 1].ym !== ym) months.push({ ym, weeks: [] });
    months[months.length - 1].weeks.push(k);
    monthOfWeek.push(months.length - 1);
  }
  return { months, monthOfWeek };
}

export function dateOfDay(startDate: string, day: number): string {
  return addDays(startDate, day).toISOString().slice(0, 10);
}

/** Índice de día (0 = startDate) para una fecha ISO. */
export function dayOfDate(startDate: string, iso: string): number {
  const a = addDays(startDate, 0).getTime();
  const [y, m, d] = iso.split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - a) / 86400000);
}
