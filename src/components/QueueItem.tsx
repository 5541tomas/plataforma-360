"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { approveOutbox, approveAllEmails, sendCampaign, skipOutbox } from "@/app/(app)/crm/automacoes/actions";
import { waLink } from "@/lib/whatsapp";
import { WaIcon } from "@/components/WhatsAppMenu";

export type QItem = { id: string; channel: "email" | "whatsapp"; to_address: string | null; subject: string | null; body: string; contact: string; deal: string | null; step: string; due_on: string };

export function QueueItem({ item, emailReady }: { item: QItem; emailReady: boolean }) {
  const [subject, setSubject] = useState(item.subject ?? "");
  const [body, setBody] = useState(item.body);
  const [state, setState] = useState<"idle" | "done" | "error">("idle");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const approve = () => start(async () => {
    const fd = new FormData(); fd.set("id", item.id); fd.set("subject", subject); fd.set("body", body);
    const r = await approveOutbox(fd);
    if (r.ok) { setState("done"); if (r.mailto) window.location.href = r.mailto; router.refresh(); } else { setState("error"); setError(r.error); }
  });
  if (state === "done") return <div className="rounded-2xl bg-good-soft px-4 py-3 text-sm text-[#1E6B30]">✓ {item.channel === "email" ? (emailReady ? "Email enviado" : "Aberto no teu email — envia de lá") : "Marcado como enviado"} · {item.contact}</div>;
  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-line p-4">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <span className={`chip ${item.channel === "email" ? "bg-accent-soft text-accent-ink" : "bg-good-soft text-[#1E6B30]"}`}>{item.channel === "email" ? "Email" : "WhatsApp"}</span>
        <span className="font-medium text-ink">{item.contact}</span>{item.deal && <span>· {item.deal}</span>}<span>· {item.step}</span><span>· {item.to_address}</span>
      </div>
      {item.channel === "email" && <label className="flex flex-col gap-1"><span className="label">Assunto</span><input value={subject} onChange={(e) => setSubject(e.target.value)} className="input" /></label>}
      <label className="flex flex-col gap-1"><span className="label">Mensagem</span><textarea value={body} onChange={(e) => setBody(e.target.value)} rows={item.channel === "email" ? 7 : 3} className="input py-2.5 leading-relaxed" /></label>
      <div className="flex flex-wrap items-center gap-2">
        {item.channel === "email" ? (
          <button disabled={pending} onClick={approve} className="btn disabled:opacity-50">{pending ? "A enviar…" : emailReady ? "Aprovar e enviar" : "Aprovar e abrir no email"}</button>
        ) : (
          <a href={waLink(item.to_address, body)} target="_blank" rel="noopener noreferrer" onClick={approve} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#128C4A] px-4 text-sm font-semibold text-white"><WaIcon /> Abrir WhatsApp e marcar enviado</a>
        )}
        <SkipButton id={item.id} />
        {state === "error" && <span role="alert" className="text-sm text-warn">{error}</span>}
      </div>
    </article>
  );
}

function SkipButton({ id }: { id: string }) {
  return (
    <form action={skipOutbox}>
      <input type="hidden" name="id" value={id} /><button className="min-h-11 px-3 text-sm text-muted hover:text-warn">Saltar</button>
    </form>
  );
}

export function ApproveAll({ count }: { count: number }) {
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button disabled={pending || !count} onClick={() => start(async () => { const r = await approveAllEmails(); setMsg(r.error ?? `${r.sent} enviados${r.failed ? ` · ${r.failed} falharam` : ""}`); router.refresh(); })} className="btn-ghost disabled:opacity-50">
        {pending ? "A enviar…" : `Aprovar os ${count} emails`}</button>
      {msg && <span role="status" className="text-sm text-muted">{msg}</span>}
    </div>
  );
}

export function SendCampaign({ id, count }: { id: string; count: number }) {
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button disabled={pending || !count} onClick={() => { if (!confirm(`Enviar a ${count} contacto(s)? Esta ação não pode ser anulada.`)) return; start(async () => { const fd = new FormData(); fd.set("id", id); const r = await sendCampaign(fd); setMsg(r.error ?? `${r.sent} enviados${r.failed ? ` · ${r.failed} falharam` : ""}`); router.refresh(); }); }} className="btn disabled:opacity-50">
        {pending ? "A enviar…" : `Aprovar e enviar a ${count}`}</button>
      {msg && <span role="status" className="text-sm text-muted">{msg}</span>}
    </div>
  );
}
