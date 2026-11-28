import type { createClient } from "@/lib/supabase/server";
type DB = Awaited<ReturnType<typeof createClient>>;

/** Endereço base para os links de recomendação: o domínio próprio do guia, se existir */
export async function referralBase(supabase: DB, orgId: string, base: string) {
  const [{ data: org }, { data: mags }] = await Promise.all([
    supabase.from("organizations").select("public_slug").eq("id", orgId).single(),
    supabase.from("lead_magnets").select("slug, kind, custom_domain").eq("org_id", orgId).eq("active", true).order("created_at"),
  ]);
  const g = (mags ?? []).find((m) => m.kind === "guide") ?? (mags ?? [])[0];
  if (!g || !org?.public_slug) return null;
  return g.custom_domain ? `https://${g.custom_domain}/` : `${base}/d/${org.public_slug}/${g.slug}`;
}

export const refLink = (b: string, code: string) => `${b}${b.includes("?") ? "&" : "?"}ref=${code}`;

/** Quantas leads por semana são precisas para a meta, a partir da conversão real do funil (lead → conversa). */
export async function funnelForecast(supabase: DB, orgId: string, convPerWeek: number) {
  const since = new Date(Date.now() - 180 * 864e5).toISOString(), last4 = Date.now() - 28 * 864e5, mature = Date.now() - 14 * 864e5;
  const [{ data: rs }, { data: regs }, { data: stages }] = await Promise.all([
    supabase.from("magnet_responses").select("contact_id, created_at").eq("org_id", orgId).gte("created_at", since).limit(2000),
    supabase.from("event_registrations").select("contact_id, created_at").eq("org_id", orgId).gte("created_at", since).limit(2000),
    supabase.from("stages").select("id, position").eq("org_id", orgId),
  ]);
  const leads = [...(rs ?? []), ...(regs ?? [])];
  const ids = [...new Set(leads.map((l) => l.contact_id).filter(Boolean))] as string[];
  const { data: deals } = ids.length ? await supabase.from("deals").select("contact_id, status, stage_id, value").in("contact_id", ids.slice(0, 900)) : { data: [] as { contact_id: string; status: string; stage_id: string; value: number }[] };
  const pos = new Map((stages ?? []).map((s) => [s.id, s.position as number]));
  const talked = new Set((deals ?? []).filter((d) => d.status === "won" || (pos.get(d.stage_id) ?? 0) >= 1).map((d) => d.contact_id));
  const matureLeads = leads.filter((l) => new Date(l.created_at).getTime() < mature && l.contact_id);
  const realRate = matureLeads.length >= 20 ? new Set(matureLeads.filter((l) => talked.has(l.contact_id!)).map((l) => l.contact_id)).size / new Set(matureLeads.map((l) => l.contact_id)).size : null;
  const rate = Math.max(0.03, realRate ?? 0.2);
  const nowPerWeek = leads.filter((l) => new Date(l.created_at).getTime() >= last4).length / 4;
  const { data: chans } = await supabase.from("contacts").select("channel").eq("org_id", orgId).in("id", ids.slice(0, 900));
  const cnt: Record<string, number> = {}; (chans ?? []).forEach((c) => { if (c.channel && c.channel !== "direto") cnt[c.channel] = (cnt[c.channel] ?? 0) + 1; });
  const bestChannel = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return { rate, rateSource: realRate === null ? ("estimada" as const) : ("real" as const), needPerWeek: Math.ceil(convPerWeek / rate), nowPerWeek: Math.round(nowPerWeek * 10) / 10, totalLeads: leads.length, bestChannel };
}
