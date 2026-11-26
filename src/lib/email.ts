/** Envio de email via Resend (https://resend.com). Sem chave configurada, a app usa o "abrir no meu email". */
export const emailConfigured = () => !!process.env.RESEND_API_KEY;

export type Sender = { from_name: string; from_email: string; reply_to?: string | null };
export const DEFAULT_SENDER: Sender = { from_name: "Thomas Faria", from_email: "geral@thomasfaria.pt" };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Texto simples → HTML limpo, com links rastreados, pixel de abertura e rodapé de cancelamento */
export function toHtml(text: string, base: string, outboxId: string, orgName: string) {
  const linkify = (line: string) => esc(line).replace(/https?:\/\/[^\s<]+/g, (u) => `<a href="${base}/api/t/c/${outboxId}?u=${encodeURIComponent(u.replace(/&amp;/g, "&"))}" style="color:#0066CC">${u}</a>`);
  const paras = text.trim().split(/\n{2,}/).map((p) => `<p style="margin:0 0 16px">${p.split("\n").map(linkify).join("<br>")}</p>`).join("");
  return `<!doctype html><html lang="pt-PT"><body style="margin:0;padding:24px;background:#ffffff;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#1D1D1F">
<div style="max-width:560px">${paras}
<p style="margin:32px 0 0;font-size:12px;color:#8E8E93">Recebes este email porque falaste com ${esc(orgName)}. <a href="${base}/u/${outboxId}" style="color:#8E8E93">Não quero receber mais emails</a>.</p>
</div><img src="${base}/api/t/o/${outboxId}" width="1" height="1" alt="" style="display:block;border:0"></body></html>`;
}

export async function sendEmail(o: { to: string; subject: string; text: string; outboxId: string; base: string; orgName: string; sender: Sender }) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: `${o.sender.from_name} <${o.sender.from_email}>`,
      to: [o.to], reply_to: o.sender.reply_to || o.sender.from_email,
      subject: o.subject,
      html: toHtml(o.text, o.base, o.outboxId, o.orgName),
      text: `${o.text}\n\n—\nPara deixares de receber emails: ${o.base}/u/${o.outboxId}`,
      headers: { "List-Unsubscribe": `<${o.base}/u/${o.outboxId}>` },
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(res.status === 403 ? "O domínio do remetente ainda não está verificado no Resend." : `Resend recusou o envio (${res.status}) ${body.slice(0, 160)}`);
  }
}
