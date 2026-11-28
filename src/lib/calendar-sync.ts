import { anonClient } from "@/lib/supabase/anon";
import { googleError, refresh } from "@/lib/google";

type Job = { connected: boolean; refresh_token?: string; horizon?: number; title?: string; location?: string | null; meet_url?: string | null;
  create?: { id: string; start: string; end: string; name: string; email: string; phone: string | null; notes: string | null }[]; delete?: { id: string; event: string }[] };
export type CalResult = { connected: boolean; busy?: number; created?: number; deleted?: number; error?: string };

/** Sincroniza a agenda com o Google Calendar do dono: ocupado → bloqueia horários; marcações → eventos com Meet e convite. */
export async function runCalendarSync(secret: string): Promise<CalResult> {
  if (!secret) return { connected: false, error: "Falta a chave interna (APP_INTERNAL_SECRET)." };
  if (!process.env.GOOGLE_CLIENT_ID) return { connected: false, error: "A ligação ao Google ainda não está configurada no servidor." };
  const db = anonClient();
  const { data, error } = await db.rpc("calendar_job", { p_secret: secret });
  if (error) return { connected: false, error: error.message };
  const job = data as Job;
  if (!job.connected || !job.refresh_token) return { connected: false };
  const save = (busy: unknown, created: unknown[], deleted: string[], err: string | null) => db.rpc("calendar_save", { p_secret: secret, p_busy: busy, p_created: created, p_deleted: deleted, p_error: err });
  let token: string;
  try { token = (await refresh(job.refresh_token)).access_token; } catch (e) { const m = e instanceof Error ? e.message : "Erro do Google"; await save(null, [], [], m); return { connected: true, error: m }; }
  const g = async (url: string, init?: RequestInit) => fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const errs: string[] = [];

  // 1) Ocupado no Google
  const now = new Date(), until = new Date(Date.now() + (job.horizon ?? 28) * 864e5);
  let busy: { start: string; end: string }[] | null = null;
  const fb = await g("https://www.googleapis.com/calendar/v3/freeBusy", { method: "POST", body: JSON.stringify({ timeMin: now.toISOString(), timeMax: until.toISOString(), items: [{ id: "primary" }] }) });
  if (fb.ok) busy = ((await fb.json()) as { calendars: { primary: { busy: { start: string; end: string }[] } } }).calendars.primary.busy ?? [];
  else errs.push(await googleError(fb, "calendar"));

  // 2) Criar eventos das novas marcações (com Meet e convite para o cliente)
  const created: { id: string; event: string; meet?: string }[] = [];
  for (const b of job.create ?? []) {
    const desc = [`Marcada online por ${b.name}`, b.email, b.phone, b.notes ? `\n«${b.notes}»` : "", job.meet_url ? `\nLink: ${job.meet_url}` : ""].filter(Boolean).join("\n");
    const body: Record<string, unknown> = { summary: `${job.title} · ${b.name}`, description: desc, start: { dateTime: b.start }, end: { dateTime: b.end },
      attendees: [{ email: b.email, displayName: b.name }], reminders: { useDefault: true }, ...(job.location ? { location: job.meet_url ?? job.location } : {}) };
    if (!job.meet_url) body.conferenceData = { createRequest: { requestId: b.id, conferenceSolutionKey: { type: "hangoutsMeet" } } };
    const r = await g("https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all", { method: "POST", body: JSON.stringify(body) });
    if (r.ok) { const ev = (await r.json()) as { id: string; hangoutLink?: string }; created.push({ id: b.id, event: ev.id, meet: ev.hangoutLink }); }
    else errs.push(r.status === 403 ? "Falta permissão para criar eventos: volta a ligar a conta Google nas Definições." : `Não consegui criar o evento de ${b.name} (${r.status}).`);
  }
  // 3) Apagar eventos de marcações canceladas
  const deleted: string[] = [];
  for (const d of job.delete ?? []) {
    const r = await g(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(d.event)}?sendUpdates=all`, { method: "DELETE" });
    if (r.ok || r.status === 404 || r.status === 410) deleted.push(d.id); else errs.push(`Não consegui apagar um evento cancelado (${r.status}).`);
  }
  await save(busy, created, deleted, errs[0] ?? null);
  return { connected: true, busy: busy?.length ?? 0, created: created.length, deleted: deleted.length, error: errs[0] };
}
