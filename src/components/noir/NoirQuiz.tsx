"use client";
import { useState } from "react";
import type { QuizConfig } from "@/lib/magnets";

/** Teste no estilo da marca: começa no cartão do topo, uma pergunta de cada vez, contacto no fim. */
export function NoirQuiz({ cfg, org, slug, areas, consent, cta, note, submit, error, initial }: { cfg: QuizConfig; org: string; slug: string; areas: string[]; consent: string; cta: string; note?: string; submit: (fd: FormData) => Promise<void>; error?: string; initial?: number[] }) {
  const n = cfg.questions.length;
  const [answers, setAnswers] = useState<number[]>(initial?.length === n ? initial : []);
  const [step, setStep] = useState(error && initial?.length === n ? n : -1);
  const [name, setName] = useState(""), [phone, setPhone] = useState(""), [ok, setOk] = useState(false), [sending, setSending] = useState(false);
  const pick = (i: number, a: number) => { const next = [...answers]; next[i] = a; setAnswers(next); setTimeout(() => setStep(i + 1), 220); };
  const valid = name.trim().length > 1 && phone.replace(/\D/g, "").length >= 9 && ok && answers.length === n;

  if (step === -1) return (
    <div id="teste" className="nr-card">
      <div className="nr-stats"><div><b>{n}</b><span>perguntas</span></div><div><b>{cfg.minutes ?? 2}</b><span>minutos</span></div><div><b>1</b><span>verdade</span></div></div>
      <button className="nr-cta" onClick={() => setStep(0)}><span>{cta}</span><span className="arw">→</span></button>
      {note && <p className="nr-note">{note}</p>}
    </div>
  );
  if (step < n) {
    const q = cfg.questions[step];
    return (
      <div id="teste" className="nr-card">
        <div className="nr-q-meta"><span>Pecado {String(step + 1).padStart(2, "0")}</span><span>{step + 1} / {n}</span></div>
        <div className="nr-q-bar"><i style={{ width: `${(step / n) * 100}%` }} /></div>
        <h2 className="nr-q-title">{q.text}</h2>
        <div role="radiogroup" aria-label={q.text}>
          {q.options.map((op, a) => <button key={a} type="button" role="radio" aria-checked={answers[step] === a} className="nr-opt" onClick={() => pick(step, a)}><span className="k">{"ABCD"[a]}</span>{op.label}</button>)}
        </div>
        {step > 0 && <button type="button" className="nr-back" onClick={() => setStep(step - 1)}>← Anterior</button>}
      </div>
    );
  }
  return (
    <form id="teste" className="nr-card" action={async (fd) => { if (!valid) return; setSending(true); await submit(fd); setSending(false); }}>
      <p className="nr-eyebrow" style={{ marginBottom: 10 }}>RESULTADO PRONTO</p>
      <h2 className="nr-q-title">Para onde te mando o resultado?</h2>
      {error && <p className="nr-err" role="alert">{error}</p>}
      <input type="hidden" name="org" value={org} /><input type="hidden" name="slug" value={slug} /><input type="hidden" name="answers" value={JSON.stringify(answers)} />
      <div aria-hidden="true" style={{ position: "absolute", left: -9999 }}><label>Site <input name="website" tabIndex={-1} autoComplete="off" /></label></div>
      <div className="nr-fields">
        <label className="nr-field">O teu nome<input name="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" placeholder="Como te chamas?" /></label>
        <label className="nr-field">O que fazes<select name="area" defaultValue=""><option value="">Escolhe a tua área</option>{areas.map((a) => <option key={a}>{a}</option>)}</select></label>
        <label className="nr-field">O teu WhatsApp<input name="phone" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" placeholder="912 345 678" /></label>
        <label className="nr-field">Email (opcional)<input name="email" type="email" autoComplete="email" placeholder="para receberes por email" /></label>
      </div>
      <label className="nr-check"><input type="checkbox" name="consent" checked={ok} onChange={(e) => setOk(e.target.checked)} /><span>{consent} <a href="#privacidade">Política de privacidade</a>.</span></label>
      <button className="nr-cta" aria-disabled={!valid} disabled={sending}><span>{sending ? "A CALCULAR…" : "VER O MEU RESULTADO"}</span><span className="arw">→</span></button>
      {!valid && <p className="nr-hint">Nome, WhatsApp e consentimento para veres o resultado.</p>}
      <button type="button" className="nr-back" onClick={() => setStep(n - 1)}>← Rever respostas</button>
    </form>
  );
}
