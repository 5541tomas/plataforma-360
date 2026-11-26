"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { applySuggestedStage, runCopilot, type CopilotResult } from "@/app/(app)/crm/copilot-actions";
import { waLink } from "@/lib/whatsapp";

export function Copilot({ dealId, currentStage, phone, enabled }: { dealId: string; currentStage: string; phone?: string | null; enabled: boolean }) {
  const [notes, setNotes] = useState("");
  const [res, setRes] = useState<{ result: CopilotResult; applied: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  return (
    <div className="card flex flex-col gap-3 border border-accent/20">
      <div className="flex items-center gap-2">
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0058B0" strokeWidth="1.8" strokeLinecap="round"><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" /></svg>
        <h2 className="h2">Copiloto de reunião</h2>
      </div>
      {!enabled ? <p className="text-sm text-muted">Disponível quando a chave da API da Anthropic estiver configurada.</p> : (<>
        <p className="text-sm text-muted">Cola as notas (ou a transcrição) da reunião. O copiloto regista o resumo, cria as tarefas, sugere a etapa e escreve o contexto da proposta.</p>
        <label htmlFor="cp-notes" className="sr-only">Notas da reunião</label>
        <textarea id="cp-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={5} className="input py-2.5" placeholder="Ex.: Falei com a Marta. Equipa de 12, gestores sobrecarregados, querem começar em janeiro. Orçamento até 4 mil. Decisão com o sócio na próxima semana…" />
        <button disabled={pending || notes.trim().length < 20} onClick={() => start(async () => {
          setError(null);
          const r = await runCopilot(dealId, notes);
          if (r.ok) { setRes({ result: r.result, applied: r.applied }); setNotes(""); router.refresh(); } else setError(r.error);
        })} className="btn self-start disabled:opacity-50">{pending ? "A analisar…" : "Analisar e registar"}</button>
        {error && <p role="alert" className="text-sm text-warn">{error}</p>}
        {res && (
          <div className="flex flex-col gap-3 rounded-xl bg-[#F7F7F9] p-4 text-sm" role="status">
            <ul className="flex flex-col gap-1 text-good">{res.applied.map((a) => <li key={a}>✓ {a}</li>)}</ul>
            <p><strong className="font-semibold">Resumo:</strong> {res.result.resumo}</p>
            {res.result.riscos.length > 0 && <p className="text-warn"><strong className="font-semibold">Riscos:</strong> {res.result.riscos.join(" · ")}</p>}
            {res.result.etapa_sugerida && res.result.etapa_sugerida !== currentStage && (
              <div className="flex flex-wrap items-center gap-2">Etapa sugerida: <strong className="font-semibold">{res.result.etapa_sugerida}</strong>
                <button className="btn-ghost !min-h-9 !text-xs" onClick={() => start(async () => { await applySuggestedStage(dealId, res.result.etapa_sugerida!); router.refresh(); })}>Mover</button></div>
            )}
            <div className="flex flex-col gap-1.5">
              <strong className="font-semibold">Mensagem de follow-up</strong>
              <p className="whitespace-pre-line rounded-lg bg-white p-3">{res.result.mensagem_followup}</p>
              <a href={waLink(phone, res.result.mensagem_followup)} target="_blank" rel="noopener noreferrer" className="self-start rounded-xl bg-[#128C4A] px-4 min-h-10 inline-flex items-center text-sm font-semibold text-white">Enviar por WhatsApp</a>
            </div>
          </div>
        )}
      </>)}
    </div>
  );
}
