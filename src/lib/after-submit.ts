/** Depois de um pedido público: envia já o guia (se aprovado para envio automático) e avisa o dono da nova lead. */
import { anonClient } from "@/lib/supabase/anon";
import { emailConfigured, sendEmail, type Sender } from "@/lib/email";

type SenderInfo = { org_name: string; from_name: string; from_email: string; reply_to: string | null };
type Alert = { to: string | null; name: string; email: string | null; phone: string | null; area?: string | null; channel?: string | null; magnet?: string; kind?: string; total?: number | null; weakest?: string | null; notes?: string | null; starts_at?: string; deal_id: string | null; contact_id: string | null };

/** Endereço da plataforma (os alertas apontam para lá, mesmo quando o pedido veio de 7erros.…) */
export function appBase(base: string) {
  try {
    const u = new URL(base);
    if (/^(localhost|127\.)/.test(u.hostname) || u.hostname.endsWith(".netlify.app") || u.hostname.startsWith("app.")) return u.origin;
    const parts = u.hostname.split(".");
    return `${u.protocol}//app.${parts.slice(-2).join(".")}`;
  } catch { return base; }
}

const senderOf = (s: SenderInfo): Sender => ({ from_name: s.from_name, from_email: s.from_email, reply_to: s.reply_to });
const lisbon = (iso: string) => new Date(iso).toLocaleString("pt-PT", { timeZone: "Europe/Lisbon", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

async function sendAlert(a: Alert, s: SenderInfo, base: string, subject: string, lines: string[]) {
  if (!a.to) return;
  const app = appBase(base);
  const wa = a.phone ? `https://wa.me/${a.phone.replace(/\D/g, "").replace(/^(9\d{8})$/, "351$1")}` : null;
  const text = [...lines, "", a.email ? `Email: ${a.email}` : null, a.phone ? `WhatsApp: ${a.phone}${wa ? ` — ${wa}` : ""}` : null, "",
    a.deal_id ? `Abrir o negócio: ${app}/crm/${a.deal_id}` : a.contact_id ? `Abrir o contacto: ${app}/crm/contactos/${a.contact_id}` : null,
    `Fila de aprovação: ${app}/crm/automacoes`, "", "— Plataforma 360"].filter((l): l is string => l !== null).join("\n");
  await sendEmail({ to: a.to, subject, text, outboxId: "00000000-0000-0000-0000-000000000000", base, orgName: s.org_name, sender: { from_name: "Plataforma 360", from_email: s.from_email }, internal: true });
}

export async function afterMagnet(rid: string, base: string) {
  const sb = anonClient();
  const send = emailConfigured();
  const { data } = await sb.rpc("public_magnet_after", { p_rid: rid, p_send: send });
  const d = data as { mail: { id: string; to: string; subject: string; body: string } | null; alert: Alert | null; sender: SenderInfo } | null;
  if (!d || !send) return;
  if (d.mail) {
    try { await sendEmail({ to: d.mail.to, subject: d.mail.subject, text: d.mail.body, outboxId: d.mail.id, base, orgName: d.sender.org_name, sender: senderOf(d.sender) }); }
    catch (e) { await sb.rpc("public_magnet_mail_failed", { p_rid: rid, p_outbox: d.mail.id, p_error: e instanceof Error ? e.message : "Erro ao enviar" }); }
  }
  if (d.alert) {
    const a = d.alert;
    const what = a.kind === "quiz" ? `fez o teste «${a.magnet}»: ${a.total ?? 0}/100${a.weakest ? ` · mais fraco em ${a.weakest}` : ""}` : `pediu «${a.magnet}»`;
    try {
      await sendAlert(a, d.sender, base, `Nova lead: ${a.name}${a.area ? ` · ${a.area}` : ""}`, [
        `${a.name} ${what}.`, [a.area && `Área: ${a.area}`, a.channel && `Canal: ${a.channel}`].filter(Boolean).join(" · "),
        d.mail ? "O guia já seguiu por email. A mensagem de WhatsApp está na fila à tua espera." : "As mensagens estão na fila à tua espera.",
      ].filter(Boolean) as string[]);
    } catch { /* o alerta nunca pode estragar o pedido */ }
  }
}

export async function afterBooking(id: string, base: string) {
  if (!emailConfigured()) return;
  const { data } = await anonClient().rpc("public_booking_after", { p_id: id });
  const d = data as { alert: Alert; sender: SenderInfo } | null;
  if (!d?.alert) return;
  try {
    await sendAlert(d.alert, d.sender, base, `Nova reunião: ${d.alert.name} · ${lisbon(d.alert.starts_at!)}`, [
      `${d.alert.name} marcou uma reunião para ${lisbon(d.alert.starts_at!)}.`, d.alert.notes ? `Notas: ${d.alert.notes}` : "",
    ].filter(Boolean));
  } catch { /* idem */ }
}

export async function afterEvent(id: string, base: string) {
  if (!emailConfigured()) return;
  const { data } = await anonClient().rpc("public_event_after", { p_id: id });
  const d = data as { alert: Alert & { event: string; taken: number; capacity: number | null }; sender: SenderInfo } | null;
  if (!d?.alert) return;
  try {
    await sendAlert(d.alert, d.sender, base, `Nova inscrição: ${d.alert.name} · ${d.alert.event}`, [
      `${d.alert.name} inscreveu-se em «${d.alert.event}».`, `Inscritos: ${d.alert.taken}${d.alert.capacity ? ` de ${d.alert.capacity}` : ""}.`,
    ]);
  } catch { /* idem */ }
}
