"use client";
import { useState } from "react";

/** Formulário do guia: nome, área, WhatsApp e consentimento. O botão só fica ativo quando está tudo certo. */
export function GuideForm({ org, slug, areas, consent, cta, note, submit, error, source }: { org: string; slug: string; areas: string[]; consent: string; cta: string; note?: string; submit: (fd: FormData) => Promise<void>; error?: string; source?: string }) {
  const [name, setName] = useState(""), [phone, setPhone] = useState(""), [ok, setOk] = useState(false), [sending, setSending] = useState(false);
  const digits = phone.replace(/\D/g, "");
  const valid = name.trim().length > 1 && digits.length >= 9 && ok;
  return (
    <form id="guia" className="nr-card" action={async (fd) => { if (!valid) return; setSending(true); await submit(fd); setSending(false); }}>
      {error && <p className="nr-err" role="alert">{error}</p>}
      <input type="hidden" name="org" value={org} /><input type="hidden" name="slug" value={slug} /><input type="hidden" name="source" value={source ?? ""} />
      <div aria-hidden="true" style={{ position: "absolute", left: -9999 }}><label>Site <input name="website" tabIndex={-1} autoComplete="off" /></label></div>
      <div className="nr-fields">
        <label className="nr-field">O teu nome<input name="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" placeholder="Como te chamas?" required /></label>
        <label className="nr-field">O que fazes<select name="area" defaultValue=""><option value="">Escolhe a tua área</option>{areas.map((a) => <option key={a}>{a}</option>)}</select></label>
        <label className="nr-field" style={{ flexBasis: "100%" }}>O teu WhatsApp<input name="phone" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" placeholder="912 345 678" required /></label>
      </div>
      <label className="nr-check"><input type="checkbox" name="consent" checked={ok} onChange={(e) => setOk(e.target.checked)} /><span>{consent} <a href="#privacidade">Política de privacidade</a>.</span></label>
      <button className="nr-cta" aria-disabled={!valid} disabled={sending}><span>{sending ? "A PREPARAR…" : cta}</span><span className="arw">→</span></button>
      {!valid && <p className="nr-hint">Escreve o teu nome e o teu WhatsApp, e aceita receber mensagens para continuar.</p>}
      {note && <p className="nr-note">{note}</p>}
    </form>
  );
}
