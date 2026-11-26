"use client";
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { parseCsv } from "@/lib/csv";
import { importContacts, type Row } from "./actions";

const FIELDS: { key: keyof Row; label: string; guess: RegExp }[] = [
  { key: "name", label: "Nome", guess: /^(nome|name|full ?name|contacto|cliente)/i },
  { key: "email", label: "Email", guess: /e-?mail/i },
  { key: "phone", label: "Telemóvel", guess: /(telem|telef|phone|mobile|tlm|whats)/i },
  { key: "company", label: "Empresa", guess: /(empresa|company|organiza)/i },
  { key: "role", label: "Cargo", guess: /(cargo|fun[cç][aã]o|role|title|job)/i },
  { key: "source", label: "Origem", guess: /(origem|source|fonte|canal)/i },
  { key: "notes", label: "Notas", guess: /(nota|notes|obs|coment)/i },
];

export function ImportContacts() {
  const [rows, setRows] = useState<string[][]>([]);
  const [map, setMap] = useState<Record<string, number>>({});
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [consent, setConsent] = useState(false);
  const [result, setResult] = useState("");
  const [pending, start] = useTransition();
  const header = rows[0] ?? [];
  const load = async (f: File) => {
    let text = await f.text();
    if (text.includes("�")) text = new TextDecoder("windows-1252").decode(await f.arrayBuffer());
    const r = parseCsv(text.replace(/^﻿/, ""));
    setRows(r); setResult("");
    const m: Record<string, number> = {};
    FIELDS.forEach((fd) => { const i = (r[0] ?? []).findIndex((h) => fd.guess.test(h)); if (i >= 0) m[fd.key] = i; });
    const fi = (r[0] ?? []).findIndex((h) => /(primeiro|first)/i.test(h)), li = (r[0] ?? []).findIndex((h) => /(apelido|último|ultimo|last|surname)/i.test(h));
    setFirst(fi >= 0 ? String(fi) : ""); setLast(li >= 0 ? String(li) : "");
    setMap(m);
  };
  const parsed: Row[] = useMemo(() => rows.slice(1).map((r) => {
    const get = (k: string) => (map[k] !== undefined && map[k] >= 0 ? r[map[k]] ?? "" : "");
    const name = get("name") || [first ? r[+first] : "", last ? r[+last] : ""].join(" ").trim();
    return { name, email: get("email"), phone: get("phone"), company: get("company"), role: get("role"), source: get("source"), notes: get("notes") };
  }).filter((r) => r.name || r.email), [rows, map, first, last]);

  return (
    <div className="flex flex-col gap-4">
      <section className="card flex flex-col gap-3">
        <h2 className="h2">1. Escolhe o ficheiro</h2>
        <p className="text-sm text-muted">CSV exportado do Excel, Google Sheets, HubSpot, LinkedIn, telemóvel… A primeira linha deve ter os nomes das colunas.</p>
        <input type="file" accept=".csv,text/csv" onChange={(e) => e.target.files?.[0] && load(e.target.files[0])} className="text-sm" aria-label="Ficheiro CSV" />
      </section>
      {rows.length > 1 && (
        <section className="card flex flex-col gap-3">
          <h2 className="h2">2. Confirma as colunas</h2>
          <div className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(170px,1fr))]">
            {FIELDS.map((f) => (
              <label key={f.key} className="flex flex-col gap-1.5"><span className="label">{f.label}</span>
                <select value={map[f.key] ?? -1} onChange={(e) => setMap({ ...map, [f.key]: Number(e.target.value) })} className="input">
                  <option value={-1}>—</option>{header.map((h, i) => <option key={i} value={i}>{h || `Coluna ${i + 1}`}</option>)}
                </select></label>
            ))}
          </div>
          {map.name === undefined && <p className="text-xs text-muted">Sem coluna de nome? Junto o primeiro nome ({first ? header[+first] : "—"}) e o apelido ({last ? header[+last] : "—"}).</p>}
          <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-xs text-muted"><tr><th className="py-1.5 pr-3">Nome</th><th className="pr-3">Email</th><th className="pr-3">Telemóvel</th><th>Empresa</th></tr></thead>
            <tbody>{parsed.slice(0, 6).map((r, i) => <tr key={i} className="border-t border-[#F0F0F2]"><td className="py-1.5 pr-3">{r.name}</td><td className="pr-3">{r.email}</td><td className="pr-3">{r.phone}</td><td>{r.company}</td></tr>)}</tbody></table></div>
          <label className="flex items-start gap-2 text-sm text-ink-2"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4" />Estas pessoas deram consentimento para receber a newsletter (só marca se for verdade — RGPD).</label>
          <div className="flex flex-wrap items-center gap-3">
            <button disabled={pending || !parsed.length} onClick={() => start(async () => { const r = await importContacts(parsed, consent); setResult(r.error ? `Erro: ${r.error}` : `✓ ${r.created} novos · ${r.updated} atualizados · ${r.skipped} ignorados (duplicados ou sem nome)`); })} className="btn disabled:opacity-50">
              {pending ? "A importar…" : `Importar ${parsed.length} contactos`}</button>
            {result && <span role="status" className="text-sm text-ink-2">{result} {!result.startsWith("Erro") && <Link href="/crm/contactos" className="font-medium text-accent-ink">Ver contactos ›</Link>}</span>}
          </div>
        </section>
      )}
    </div>
  );
}
