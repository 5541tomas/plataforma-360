"use client";
import { useState } from "react";

/** Formulário do guia: nome, área, WhatsApp e consentimento. O botão só fica ativo quando está tudo certo. */
export function GuideForm({ org, slug, areas, consent, cta, note, submit, error, utm }: { org: string; slug: string; areas: string[]; consent: string; cta: string; note?: string; submit: (fd: FormData) => Promise<void>; error?: string; utm?: string }) {
  const [name, setName] = useState(""), [email, setEmail] = useState(""), [phone, setPhone] = useState(""), [ok, setOk] = useState(false), [sending, setSending] = useState(false);
  const digits = phone.replace(/\D/g, "");
  const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
  const valid = name.trim().length > 1 && emailOk && digits.length >= 9 && ok;
  return (
    <form id="guia" className="nr-card" action={async (fd) => { if (!valid) return; setSending(true); await submit(fd); setSending(false); }}>
      {error && <p className="nr-err" role="alert">{error}</p>}
      <input type="hidden" name="org" value={org} /><input type="hidden" name="slug" value={slug} /><input type="hidden" name="utm" value={utm ?? "{}"} />
      <div aria-hidden="true" style={{ position: "absolute", left: -9999 }}><label>Site <input name="website" tabIndex={-1} autoComplete="off" /></label></div>
      <div className="nr-fields">
        <label className="nr-field">O teu nome<input name="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" placeholder="Como te chamas?" required /></label>
        <label className="nr-field">O que fazes<select name="area" defaultValue=""><option value="">Escolhe a tua área</option>{areas.map((a) => <option key={a}>{a}</option>)}</select></label>
        <label className="nr-field">O teu email<input name="email" type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="nome@email.com" required /></label>
        <label className="nr-field">O teu WhatsApp<input name="phone" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" placeholder="912 345 678" required /></label>
      </div>
      <label className="nr-check"><input type="checkbox" name="consent" checked={ok} onChange={(e) => setOk(e.target.checked)} /><span>{consent} <a href="#privacidade">Política de privacidade</a>.</span></label>
      <button className="nr-cta" aria-disabled={!valid} disabled={sending}><span>{sending ? "A PREPARAR…" : cta}</span><span className="arw">→</span></button>
      {!valid && <p className="nr-hint">Escreve o teu nome, email e WhatsApp, e aceita receber mensagens para continuar.</p>}
      {note && <p className="nr-note">{note}</p>}
    </form>
  );
}
