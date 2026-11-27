"use client";
import { useState, useTransition } from "react";
import { generateInternalKey, sendTestEmail } from "@/app/(app)/definicoes/integration-actions";

export function InternalKeyButton({ exists }: { exists: boolean }) {
  const [key, setKey] = useState(""), [err, setErr] = useState(""), [copied, setCopied] = useState(false), [ask, setAsk] = useState(false);
  const [pending, start] = useTransition();
  if (key) return (
    <div className="flex flex-col gap-2 rounded-xl bg-accent-soft p-3 text-sm text-accent-ink">
      <span className="font-semibold">Copia agora — por segurança não volta a ser mostrada:</span>
      <code className="break-all rounded-lg bg-white px-2.5 py-2 text-xs text-ink">{key}</code>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(key); setCopied(true); } catch { /* sem acesso */ } }} className="btn !min-h-9">{copied ? "Copiada ✓" : "Copiar"}</button>
        <span>No Netlify: Site configuration → Environment variables → <strong>APP_INTERNAL_SECRET</strong> (marca “secret”) e faz novo deploy.</span>
      </div>
    </div>
  );
  if (exists && !ask) return <button type="button" onClick={() => setAsk(true)} className="self-start text-sm font-medium text-muted hover:text-ink">Gerar nova chave</button>;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {exists && <span className="text-sm text-warn">A chave atual deixa de funcionar.</span>}
      <button type="button" disabled={pending} onClick={() => start(async () => { const r = await generateInternalKey(); if (r.key) setKey(r.key); else setErr(r.error ?? "Erro"); })} className="btn-ghost !min-h-10">{pending ? "A gerar…" : "Gerar chave interna"}</button>
      {err && <span className="text-sm text-warn">{err}</span>}
    </div>
  );
}

export function TestEmailButton() {
  const [msg, setMsg] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" disabled={pending} onClick={() => start(async () => setMsg(await sendTestEmail()))} className="btn-ghost !min-h-10">{pending ? "A enviar…" : "Enviar email de teste"}</button>
      {msg && <span role="status" className={`text-sm ${msg.ok ? "text-good" : "text-warn"}`}>{msg.message}</span>}
    </div>
  );
}
