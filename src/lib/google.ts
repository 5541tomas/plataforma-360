import type { createClient } from "@/lib/supabase/server";
type DB = Awaited<ReturnType<typeof createClient>>;

export const GOOGLE_SCOPES = [
  "openid", "email",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events",
];
const clientId = () => (process.env.GOOGLE_CLIENT_ID ?? "").trim().replace(/^["']|["']$/g, "");
const clientSecret = () => (process.env.GOOGLE_CLIENT_SECRET ?? "").trim().replace(/^["']|["']$/g, "");
export const googleClientId = clientId;
export const googleConfigured = () => !!(clientId() && clientSecret());
export const redirectUri = (origin: string) => `${origin}/api/google/callback`;

export async function exchangeCode(code: string, origin: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code, client_id: clientId(), client_secret: clientSecret(),
      redirect_uri: redirectUri(origin), grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string; error_description?: string };
    const why = j.error === "invalid_client" ? "o ID ou o segredo do cliente não estão corretos no Netlify (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)"
      : j.error === "redirect_uri_mismatch" ? "o URI de redirecionamento na Google Cloud não é exatamente o da plataforma"
      : j.error === "invalid_grant" ? "a autorização expirou — tenta ligar de novo" : (j.error_description || j.error || "erro desconhecido");
    throw new Error(`Google recusou a ligação (${res.status}): ${why}.`);
  }
  return res.json() as Promise<{ access_token: string; refresh_token?: string; expires_in: number; id_token?: string }>;
}

export async function refresh(refreshToken: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ refresh_token: refreshToken, client_id: clientId(), client_secret: clientSecret(), grant_type: "refresh_token" }),
  });
  if (!res.ok) throw new Error("A ligação ao Google expirou. Volta a ligar a conta nas Definições.");
  return res.json() as Promise<{ access_token: string; expires_in: number }>;
}

/** Email da conta a partir do id_token (recebido diretamente da Google por TLS) */
export function emailFromIdToken(idToken?: string) {
  if (!idToken) return null;
  try { return JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString()).email as string; } catch { return null; }
}

const headerOf = (h: { name: string; value: string }[], n: string) => h.find((x) => x.name.toLowerCase() === n.toLowerCase())?.value ?? "";
const emailsIn = (s: string) => (s.toLowerCase().match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/g) ?? []);

export type SyncResult = { emails: number; meetings: number };

/** Importa emails e reuniões com contactos do CRM para o histórico (atividades). */
export async function syncGoogle(supabase: DB, orgId: string, userId: string): Promise<SyncResult> {
  const { data: integ } = await supabase.from("integrations").select("*").eq("org_id", orgId).eq("user_id", userId).eq("provider", "google").maybeSingle();
  if (!integ?.refresh_token) throw new Error("Conta Google não ligada.");
  let token = integ.access_token as string | null;
  if (!token || !integ.expires_at || new Date(integ.expires_at).getTime() < Date.now() + 60_000) {
    const t = await refresh(integ.refresh_token);
    token = t.access_token;
    await supabase.from("integrations").update({ access_token: token, expires_at: new Date(Date.now() + t.expires_in * 1000).toISOString() })
      .eq("org_id", orgId).eq("user_id", userId).eq("provider", "google");
  }
  const g = async (url: string) => {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) throw new Error(`Erro do Google (${r.status}) ao sincronizar.`);
    return r.json();
  };

  // Contactos com email → negócio mais recente desse contacto
  const { data: contacts } = await supabase.from("contacts").select("id, email, company_id").eq("org_id", orgId).not("email", "is", null);
  const { data: deals } = await supabase.from("deals").select("id, contact_id, company_id, created_at").eq("org_id", orgId).order("created_at", { ascending: false });
  const byEmail = new Map<string, { contactId: string; dealId: string | null; companyId: string | null }>();
  (contacts ?? []).forEach((c) => {
    const e = c.email!.trim().toLowerCase();
    const d = (deals ?? []).find((x) => x.contact_id === c.id) ?? (c.company_id ? (deals ?? []).find((x) => x.company_id === c.company_id) : undefined);
    byEmail.set(e, { contactId: c.id, dealId: d?.id ?? null, companyId: c.company_id });
  });
  if (byEmail.size === 0) {
    await supabase.from("integrations").update({ last_sync_at: new Date().toISOString() }).eq("org_id", orgId).eq("user_id", userId).eq("provider", "google");
    return { emails: 0, meetings: 0 };
  }
  const own = (integ.account_email ?? "").toLowerCase();
  const sinceDays = integ.last_sync_at ? Math.max(1, Math.ceil((Date.now() - new Date(integ.last_sync_at).getTime()) / 864e5) + 1) : 60;
  const rows: Record<string, unknown>[] = [];

  // Gmail: pesquisa por blocos de 15 endereços
  const all = [...byEmail.keys()];
  const seen = new Set<string>();
  for (let i = 0; i < all.length; i += 15) {
    const group = all.slice(i, i + 15).join(" OR ");
    const q = encodeURIComponent(`newer_than:${sinceDays}d {from:(${group}) to:(${group})}`);
    const list = await g(`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=100&q=${q}`);
    for (const m of (list.messages ?? []) as { id: string }[]) {
      if (seen.has(m.id)) continue; seen.add(m.id);
      const msg = await g(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Subject&metadataHeaders=Date`);
      const h = msg.payload?.headers ?? [];
      const from = emailsIn(headerOf(h, "From"))[0] ?? "";
      const others = [...emailsIn(headerOf(h, "From")), ...emailsIn(headerOf(h, "To")), ...emailsIn(headerOf(h, "Cc"))].filter((e) => e !== own);
      const match = others.map((e) => byEmail.get(e)).find(Boolean);
      if (!match) continue;
      const incoming = from !== own;
      const subject = headerOf(h, "Subject") || "(sem assunto)";
      rows.push({
        org_id: orgId, deal_id: match.dealId, contact_id: match.contactId, company_id: match.companyId, type: "email",
        summary: `${incoming ? "Recebido" : "Enviado"}: ${subject}${msg.snippet ? `\n${String(msg.snippet).slice(0, 220)}` : ""}`,
        occurred_at: new Date(Number(msg.internalDate)).toISOString(), done: true, external_id: `gmail:${m.id}`,
      });
    }
  }

  // Calendar: 30 dias para trás e 30 para a frente
  const tMin = new Date(Date.now() - Math.max(sinceDays, 30) * 864e5).toISOString();
  const tMax = new Date(Date.now() + 30 * 864e5).toISOString();
  const ev = await g(`https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true&orderBy=startTime&maxResults=250&timeMin=${encodeURIComponent(tMin)}&timeMax=${encodeURIComponent(tMax)}`);
  for (const e of (ev.items ?? []) as { id: string; summary?: string; status?: string; start?: { dateTime?: string; date?: string }; attendees?: { email: string }[] }[]) {
    if (e.status === "cancelled") continue;
    const match = (e.attendees ?? []).map((a) => byEmail.get(a.email.toLowerCase())).find(Boolean);
    if (!match) continue;
    const start = e.start?.dateTime ?? e.start?.date;
    if (!start) continue;
    rows.push({
      org_id: orgId, deal_id: match.dealId, contact_id: match.contactId, company_id: match.companyId, type: "meeting",
      summary: `Reunião: ${e.summary ?? "(sem título)"}`, occurred_at: new Date(start).toISOString(),
      done: new Date(start).getTime() <= Date.now(), external_id: `gcal:${e.id}`,
    });
  }


  let inserted = { emails: 0, meetings: 0 };
  if (rows.length) {
    const { data, error } = await supabase.from("activities").upsert(rows, { onConflict: "org_id,external_id", ignoreDuplicates: true }).select("type");
    if (error) throw new Error(error.message);
    inserted = { emails: (data ?? []).filter((r) => r.type === "email").length, meetings: (data ?? []).filter((r) => r.type === "meeting").length };
    // atualizar "último contacto" dos negócios com emails/reuniões passados
    const latest = new Map<string, string>();
    rows.forEach((r) => { if (r.deal_id && r.done && (!latest.get(r.deal_id as string) || latest.get(r.deal_id as string)! < (r.occurred_at as string))) latest.set(r.deal_id as string, r.occurred_at as string); });
    for (const [id, at] of latest) await supabase.from("deals").update({ last_activity_at: at }).eq("id", id).lt("last_activity_at", at);
  }
  await supabase.from("integrations").update({ last_sync_at: new Date().toISOString() }).eq("org_id", orgId).eq("user_id", userId).eq("provider", "google");
  return inserted;
}
