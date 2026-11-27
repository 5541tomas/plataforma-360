import { anonClient } from "@/lib/supabase/anon";
import { internalSecret } from "@/lib/stripe";
import { emailConfigured, sendEmail, DEFAULT_SENDER } from "@/lib/email";

type Dg = { enabled: boolean; email: string; name: string; org: string; meetings: { time: string; name: string; notes: string | null }[]; queue: number; tasks: { title: string; late: boolean }[]; tasks_total: number;
  hot: { name: string; score: number }[]; overdue: { n: number; sum: number }; week_in: number; won_month: number; proposals_open: number; proposals_viewed: { number: string; views: number }[] };
const eur = (n: number) => new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(Number(n));

/** Resumo do dia: chamado todas as manhãs pela função agendada do Netlify */
export async function POST(req: Request) {
  const secret = internalSecret();
  if (!secret || req.headers.get("x-internal-secret") !== secret) return new Response("sem permissão", { status: 401 });
  if (!emailConfigured()) return new Response("sem email configurado", { status: 200 });
  const { data, error } = await anonClient().rpc("daily_digest", { p_secret: secret });
  if (error) return new Response(error.message, { status: 500 });
  const d = data as Dg;
  if (!d?.enabled || !d.email) return new Response("desligado");
  const base = new URL(req.url).origin;
  const date = new Intl.DateTimeFormat("pt-PT", { timeZone: "Europe/Lisbon", weekday: "long", day: "numeric", month: "long" }).format(new Date());
  const L: string[] = [`Bom dia, ${d.name}! O teu dia — ${date}.`, ""];
  if (d.meetings.length) { L.push(`REUNIÕES HOJE (${d.meetings.length})`); d.meetings.forEach((m) => L.push(`• ${m.time} — ${m.name}${m.notes ? ` («${m.notes.slice(0, 80)}»)` : ""}`)); L.push(""); }
  if (d.queue) L.push(`MENSAGENS POR APROVAR: ${d.queue} → ${base}/crm/automacoes`, "");
  if (d.tasks.length) { L.push(`TAREFAS (${d.tasks_total})`); d.tasks.forEach((t) => L.push(`• ${t.late ? "[atrasada] " : ""}${t.title}`)); if (d.tasks_total > d.tasks.length) L.push(`• … e mais ${d.tasks_total - d.tasks.length}`); L.push(""); }
  if (d.proposals_viewed.length) { L.push("PROPOSTAS ABERTAS NAS ÚLTIMAS 24H — LIGA HOJE"); d.proposals_viewed.forEach((p) => L.push(`• Proposta ${p.number} (${p.views}×)`)); L.push(""); }
  if (d.hot.length) { L.push("LEADS QUENTES"); d.hot.forEach((h) => L.push(`• ${h.name} — pontuação ${h.score}`)); L.push(""); }
  L.push("DINHEIRO");
  if (d.overdue.n) L.push(`• Em atraso: ${eur(d.overdue.sum)} (${d.overdue.n}) → ${base}/financas/cobrancas`);
  L.push(`• A receber nos próximos 7 dias: ${eur(d.week_in)}`, `• Vendido este mês: ${eur(d.won_month)}`, `• Propostas à espera de resposta: ${d.proposals_open}`, "", `Abrir o Hoje: ${base}/`);
  try {
    await sendEmail({ to: d.email, subject: `O teu dia${d.meetings.length ? ` · ${d.meetings.length} reunião(ões)` : ""}${d.queue ? ` · ${d.queue} por aprovar` : ""}`, text: L.join("\n"), outboxId: "00000000-0000-0000-0000-000000000000", base, orgName: d.org, sender: DEFAULT_SENDER, internal: true });
  } catch (e) { return new Response(e instanceof Error ? e.message : "erro", { status: 502 }); }
  return new Response("enviado");
}
