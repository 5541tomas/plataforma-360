"use client";
import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { acceptProposal } from "@/app/p/[token]/actions";

export function AcceptProposal({ token, total, accent, suggested }: { token: string; total: string; accent: string; suggested?: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(suggested ?? "");
  const [agree, setAgree] = useState(false);
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <>
      <button onClick={() => setOpen(true)} className="inline-flex min-h-11 items-center rounded-xl px-5 text-sm font-semibold text-white shadow-lg" style={{ background: accent }}>Aceitar proposta</button>
      {open && createPortal(
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center" onClick={() => setOpen(false)}>
          <div role="dialog" aria-label="Aceitar proposta" className="flex w-full max-w-[440px] flex-col gap-4 rounded-[22px] bg-white p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-bold tracking-[-0.3px]">Aceitar a proposta</h2>
            <p className="text-sm text-ink-2">Investimento: <strong>{total}</strong>. Ao aceitar, confirmas que concordas com o âmbito e as condições descritas.</p>
            <label className="flex flex-col gap-1.5"><span className="label">O teu nome completo</span><input value={name} onChange={(e) => setName(e.target.value)} autoFocus className="input" /></label>
            {name.trim() && <div className="rounded-xl bg-[#F7F7F9] px-4 py-3 font-[cursive] text-[22px]" style={{ color: accent }}>{name}</div>}
            <label className="flex items-start gap-2 text-sm text-ink-2"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 h-4 w-4" /> Li e aceito a proposta e as condições.</label>
            {err && <p role="alert" className="text-sm text-warn">{err}</p>}
            <button disabled={!agree || !name.trim() || pending} onClick={() => start(async () => { const r = await acceptProposal(token, name); if (r.ok) { setOpen(false); router.refresh(); } else setErr(r.error ?? "Erro"); })}
              className="min-h-12 rounded-xl text-[15px] font-semibold text-white disabled:opacity-40" style={{ background: accent }}>{pending ? "A confirmar…" : "Confirmar aceitação"}</button>
            <button onClick={() => setOpen(false)} className="text-sm text-muted">Cancelar</button>
          </div>
        </div>, document.body
      )}
    </>
  );
}
