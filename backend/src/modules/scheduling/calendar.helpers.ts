export const todayGuatemala = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guatemala', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
export function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
export function hasClassEnded(date: string, endTime: string, now = Date.now()): boolean {
  if (!validDate(date) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(endTime)) return false;
  const end = Date.parse(`${date}T${endTime}:00-06:00`);
  return Number.isFinite(end) && end <= now;
}
export function expandDates(date: string, recurrence: unknown): string[] {
  if (!validDate(date)) throw new Error('Fecha inválida.');
  if (recurrence === undefined || recurrence === null) return [date];
  if (typeof recurrence !== 'object' || Array.isArray(recurrence)) throw new Error('La repetición debe incluir días y una fecha final.');
  const rule = recurrence as { until?: unknown; weekdays?: unknown };
  if (!validDate(rule.until) || rule.until < date || !Array.isArray(rule.weekdays) || rule.weekdays.length === 0 || rule.weekdays.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) throw new Error('Indica días y una fecha final válida para la repetición semanal.');
  if ((Date.parse(rule.until) - Date.parse(date)) / 86400000 > 180) throw new Error('La repetición puede abarcar hasta 180 días.');
  if (!rule.weekdays.includes(new Date(`${date}T12:00:00Z`).getUTCDay())) throw new Error('Incluye el día de la primera sesión en la repetición semanal.');
  const dates: string[] = [];
  for (const cursor = new Date(`${date}T12:00:00Z`); cursor.toISOString().slice(0, 10) <= rule.until; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    if (rule.weekdays.includes(cursor.getUTCDay())) dates.push(cursor.toISOString().slice(0, 10));
  }
  if (!dates.length || dates.length > 52) throw new Error('Selecciona entre 1 y 52 sesiones por serie.');
  return dates;
}
type Interval = { date: string; startTime: string; endTime: string; bufferMinutes?: number };
export function legacyIntervals(records: Array<Record<string, unknown>> = []): Interval[] {
  const times = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  return records.flatMap((record) => {
    if (!['pending', 'confirmed'].includes(String(record.status)) || !validDate(record.date) || typeof record.startTime !== 'string' || typeof record.endTime !== 'string' || !times.test(record.startTime) || !times.test(record.endTime) || record.startTime >= record.endTime) return [];
    return [{ date: record.date, startTime: record.startTime, endTime: record.endTime }];
  });
}
export function calendarConflict(a: Interval, b: Interval, travel = false): boolean {
  const start = (slot: Interval) => Date.parse(`${slot.date}T00:00:00Z`) / 60000 + minutes(slot.startTime);
  const buffer = travel ? Math.max(a.bufferMinutes ?? 0, b.bufferMinutes ?? 0) : 0;
  return start(a) < start(b) + minutes(b.endTime) - minutes(b.startTime) + buffer
    && start(b) < start(a) + minutes(a.endTime) - minutes(a.startTime) + buffer;
}
export function sessionTotal(startTime: string, endTime: string, hourlyRate: number, travelCost: number): number {
  return Math.round(((minutes(endTime) - minutes(startTime)) / 60 * hourlyRate + travelCost) * 100) / 100;
}
