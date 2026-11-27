"use client";
import { useState } from "react";
import type { QuizConfig } from "@/lib/magnets";

export function QuizRunner({ cfg, org, slug, submit, error, initial, utm }: { cfg: QuizConfig; org: string; slug: string; submit: (fd: FormData) => Promise<void>; error?: string; initial?: number[]; utm?: string }) {
  const n = cfg.questions.length;
  const [answers, setAnswers] = useState<number[]>(initial?.length === n ? initial : []);
  const [step, setStep] = useState<number>(initial?.length === n ? n : -1); // -1 intro · 0..n-1 perguntas · n contacto
  const [sending, setSending] = useState(false);
  const pick = (i: number, a: number) => { const next = [...answers]; next[i] = a; setAnswers(next); setTimeout(() => setStep(i + 1), 180); };

  if (step === -1) return (
    <div className="card flex flex-col items-center gap-5 text-center">
      <div className="flex gap-6 text-sm text-ink-2"><span><strong className="text-[22px] font-bold text-ink">{n}</strong><br />perguntas</span><span><strong className="text-[22px] font-bold text-ink">{cfg.minutes ?? 3}</strong><br />minutos</span><span><strong className="text-[22px] font-bold text-ink">{cfg.areas.length}</strong><br />áreas avaliadas</span></div>
      <button onClick={() => setStep(0)} className="btn !min-h-12 w-full max-w-xs text-base">Começar o diagnóstico</button>
      <p className="text-xs text-muted">Recebes o resultado no ecrã, com recomendações para cada área, e o ebook de oferta.</p>
    </div>
  );

  if (step < n) {
    const q = cfg.questions[step], area = cfg.areas.find((a) => a.key === q.area);
    return (
      <div className="card flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs font-medium text-muted"><span>{area?.name}</span><span>{step + 1} de {n}</span></div>
          <div className="h-1.5 overflow-hidden rounded-full bg-soft" role="progressbar" aria-valuemin={0} aria-valuemax={n} aria-valuenow={step}><div className="h-full rounded-full bg-accent transition-all duration-300" style={{ width: `${(step / n) * 100}%` }} /></div>
        </div>
        <h2 className="text-[22px] font-semibold leading-snug tracking-[-0.4px]">{q.text}</h2>
        <div className="flex flex-col gap-2.5" role="radiogroup" aria-label={q.text}>
          {q.options.map((op, a) => (
            <button key={a} role="radio" aria-checked={answers[step] === a} onClick={() => pick(step, a)}
              className={`min-h-14 rounded-2xl border px-4 py-3 text-left text-[15px] transition ${answers[step] === a ? "border-accent bg-accent-soft font-medium text-accent-ink" : "border-line bg-card hover:border-accent/50 hover:bg-[#FAFAFC]"}`}>{op.label}</button>
          ))}
        </div>
        {step > 0 && <button onClick={() => setStep(step - 1)} className="self-start text-sm text-muted hover:text-ink">‹ Anterior</button>}
      </div>
    );
  }

  return (
    <form action={async (fd) => { setSending(true); await submit(fd); }} className="card flex flex-col gap-4">
      <div className="flex flex-col gap-1 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-good-soft text-xl text-good">✓</div>
        <h2 className="text-[22px] font-semibold tracking-[-0.4px]">O teu resultado está pronto</h2>
        <p className="text-sm text-muted">Diz-me para onde enviar o resultado e o ebook.</p>
      </div>
      {error && <p role="alert" className="rounded-xl bg-warn-soft px-3 py-2 text-sm text-warn">{error}</p>}
      <input type="hidden" name="org" value={org} /><input type="hidden" name="slug" value={slug} /><input type="hidden" name="answers" value={JSON.stringify(answers)} /><input type="hidden" name="utm" value={utm ?? "{}"} />
      <div aria-hidden="true" className="absolute -left-[9999px]"><label>Site <input name="website" tabIndex={-1} autoComplete="off" /></label></div>
      <label className="flex flex-col gap-1.5"><span className="label">Nome</span><input name="name" required autoComplete="name" className="input" /></label>
      <label className="flex flex-col gap-1.5"><span className="label">Email</span><input name="email" type="email" required autoComplete="email" className="input" /></label>
      <label className="flex flex-col gap-1.5"><span className="label">Telemóvel (opcional)</span><input name="phone" type="tel" autoComplete="tel" className="input" /></label>
      <label className="flex items-start gap-2 text-sm text-ink-2"><input type="checkbox" name="consent" className="mt-0.5 h-4 w-4" /> Quero receber dicas de vendas por email. Posso cancelar a qualquer momento.</label>
      <button disabled={sending} className="btn !min-h-12 text-base disabled:opacity-60">{sending ? "A calcular…" : "Ver o meu resultado"}</button>
      <button type="button" onClick={() => setStep(n - 1)} className="text-sm text-muted hover:text-ink">‹ Rever respostas</button>
      <p className="text-center text-xs text-muted">Os teus dados são usados só para te enviar o resultado e, se aceitares, dicas de vendas.</p>
    </form>
  );
}
