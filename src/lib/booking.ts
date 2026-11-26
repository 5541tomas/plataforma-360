// Agenda de marcações: configuração e cálculo de horários livres (fuso de Lisboa)
export type BookingCfg = { enabled?: boolean; duration?: number; buffer?: number; days?: number[]; start?: string; end?: string; notice_hours?: number; horizon_days?: number; title?: string; intro?: string; location?: string; meet_url?: string };
export const BOOKING_DEFAULTS: Required<Omit<BookingCfg, "meet_url">> & { meet_url: string } = {
  enabled: false, duration: 30, buffer: 15, days: [1, 2, 3, 4, 5], start: "09:30", end: "18:00", notice_hours: 12, horizon_days: 21,
  title: "Reunião 1:1 gratuita", intro: "30 minutos para revermos onde estás e sairmos com as 3 prioridades para os próximos 90 dias.", location: "Videochamada (envio o link na confirmação)", meet_url: "",
};
export const cfgOf = (c: BookingCfg | null | undefined) => ({ ...BOOKING_DEFAULTS, ...(c ?? {}) });

const TZ = "Europe/Lisbon";
/** Desvio (minutos) de Lisboa face a UTC num dado instante. */
function offsetAt(d: Date) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(d).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
  return Math.round((asUtc - d.getTime()) / 60000);
}
/** Hora local de Lisboa (AAAA-MM-DD + HH:MM) → instante UTC. */
export function lisbonToUtc(date: string, time: string) {
  const [y, m, d] = date.split("-").map(Number), [hh, mm] = time.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const off = offsetAt(new Date(guess));
  const t = guess - off * 60000;
  return new Date(guess - offsetAt(new Date(t)) * 60000);
}
export const lisbonDate = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d); // AAAA-MM-DD
export const lisbonTime = (d: Date) => new Intl.DateTimeFormat("pt-PT", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(d);
export const lisbonLong = (d: Date) => new Intl.DateTimeFormat("pt-PT", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" }).format(d);

export type Day = { date: string; label: string; weekday: string; slots: string[] }; // slots em ISO UTC
/** Horários livres para os próximos dias, a partir da configuração e das marcações existentes. */
export function freeSlots(c: BookingCfg, busy: [string, string][], now = new Date()): Day[] {
  const cfg = cfgOf(c);
  const step = (cfg.duration + cfg.buffer) * 60000, dur = cfg.duration * 60000, buf = cfg.buffer * 60000;
  const minStart = now.getTime() + cfg.notice_hours * 3600000;
  const busyMs = busy.map(([a, b]) => [new Date(a).getTime(), new Date(b).getTime() + buf]);
  const days: Day[] = [];
  for (let i = 0; i <= cfg.horizon_days; i++) {
    const date = lisbonDate(new Date(now.getTime() + i * 86400000));
    const dow = ((new Date(date + "T12:00:00Z").getUTCDay() + 6) % 7) + 1;
    if (!cfg.days.includes(dow)) continue;
    const from = lisbonToUtc(date, cfg.start).getTime(), to = lisbonToUtc(date, cfg.end).getTime();
    const slots: string[] = [];
    for (let t = from; t + dur <= to; t += step) {
      if (t < minStart) continue;
      if (busyMs.some(([a, b]) => t < b && t + dur > a)) continue;
      slots.push(new Date(t).toISOString());
    }
    if (slots.length) {
      const d = new Date(date + "T12:00:00Z");
      days.push({ date, slots, weekday: new Intl.DateTimeFormat("pt-PT", { weekday: "short", timeZone: "UTC" }).format(d).replace(".", "").slice(0, 3), label: `${Number(date.slice(8))} ${new Intl.DateTimeFormat("pt-PT", { month: "short", timeZone: "UTC" }).format(d).replace(".", "")}` });
    }
  }
  return days;
}

/** Ficheiro de calendário (.ics) para a reunião. */
export function ics(o: { id: string; start: string; end: string; title: string; description: string; location?: string | null }) {
  const f = (s: string) => new Date(s).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Plataforma 360//PT", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "BEGIN:VEVENT",
    `UID:${o.id}@plataforma360`, `DTSTAMP:${f(new Date().toISOString())}`, `DTSTART:${f(o.start)}`, `DTEND:${f(o.end)}`,
    `SUMMARY:${esc(o.title)}`, `DESCRIPTION:${esc(o.description)}`, o.location ? `LOCATION:${esc(o.location)}` : "",
    "BEGIN:VALARM", "TRIGGER:-PT30M", "ACTION:DISPLAY", "DESCRIPTION:Lembrete", "END:VALARM", "END:VEVENT", "END:VCALENDAR"].filter(Boolean).join("\r\n");
}
