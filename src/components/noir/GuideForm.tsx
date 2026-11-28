"use client";
import { useRef, useState } from "react";

/** Formulário do guia em 2 passos: 1) nome + email (o guia sai logo por email); 2) WhatsApp e área (opcionais, mas ajudam). */
export function GuideForm({ org, slug, areas, consent, cta, note, submit, error, utm }: { org: string; slug: string; areas: string[]; consent: string; cta: string; note?: string; submit: (fd: FormData) => Promise<void>; error?: string; utm?: string }) {
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState(""), [email, setEmail] = useState(""), [phone, setPhone] = useState(""), [ok, setOk] = useState(false), [sending, setSending] = useState(false);
  const phoneRef = useRef<HTMLInputElement>(null);
  const digits = phone.replace(/\D/g, "");
  const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
  const step1 = name.trim().length > 1 && emailOk && ok;
  const phoneOk = digits.length === 0 || digits.length >= 9;
  const next = () => { if (!step1) return; setStep(2); setTimeout(() => phoneRef.current?.focus(), 50); };
  return (
    <form id="guia" className="nr-card" onKeyDown={(e) => { if (e.key === "Enter" && step === 1 && (e.target as HTMLElement).tagName === "INPUT") { e.preventDefault(); next(); } }}
      action={async (fd) => { if (step === 1) return next(); if (!step1 || !phoneOk) return; setSending(true); await submit(fd); setSending(false); }}>
      {error && <p className="nr-err" role="alert">{error}</p>}
      <input type="hidden" name="org" value={org} /><input type="hidden" name="slug" value={slug} /><input type="hidden" name="utm" value={utm ?? "{}"} />
      <div aria-hidden="true" style={{ position: "absolute", left: -9999 }}><label>Site <input name="website" tabIndex={-1} autoComplete="off" /></label></div>
      <div className="nr-q-meta" style={{ marginBottom: 18 }}><span>Passo {step} de 2</span><span>{step === 1 ? "Para onde envio o guia?" : "Último passo"}</span></div>
      <div className="nr-q-bar" style={{ margin: "-6px 0 22px" }}><i style={{ width: step === 1 ? "50%" : "100%" }} /></div>
      <div className="nr-fields" hidden={step !== 1}>
        <label className="nr-field">O teu nome<input name="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" placeholder="Como te chamas?" /></label>
        <label className="nr-field">O teu email<input name="email" type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="nome@email.com" /></label>
      </div>
      {step === 1 && <label className="nr-check"><input type="checkbox" name="consent" checked={ok} onChange={(e) => setOk(e.target.checked)} /><span>{consent} <a href="#privacidade">Política de privacidade</a>.</span></label>}
      {step === 2 && <input type="hidden" name="consent" value={ok ? "on" : ""} />}
      <div className="nr-fields" hidden={step !== 2} style={{ marginBottom: 24 }}>
        <label className="nr-field">O teu WhatsApp (opcional)<input ref={phoneRef} name="phone" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" placeholder="912 345 678" /></label>
        <label className="nr-field">O que fazes<select name="area" defaultValue=""><option value="">Escolhe a tua área</option>{areas.map((a) => <option key={a}>{a}</option>)}</select></label>
      </div>
      {step === 1
        ? <button type="button" onClick={next} className="nr-cta" aria-disabled={!step1}><span>CONTINUAR</span><span className="arw">→</span></button>
        : <button className="nr-cta" aria-disabled={!phoneOk} disabled={sending}><span>{sending ? "A ENVIAR…" : cta}</span><span className="arw">→</span></button>}
      {step === 1 && !step1 && <p className="nr-hint">Escreve o teu nome e email, e aceita receber mensagens para continuar.</p>}
      {step === 2 && <p className="nr-note" style={{ marginTop: 12 }}>O guia segue já para <b className="nr-b">{email.trim()}</b>. Com o WhatsApp, recebes também lá as próximas dicas. <button type="button" className="nr-back" onClick={() => setStep(1)}>Alterar</button></p>}
      {step === 2 && !phoneOk && <p className="nr-hint">Esse número parece incompleto.</p>}
      {note && step === 1 && <p className="nr-note">{note}</p>}
    </form>
  );
}
