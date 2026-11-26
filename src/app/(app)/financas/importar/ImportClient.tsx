"use client";
import { useMemo, useState, useTransition } from "react";
import { applyMapping, guessMapping, parseCsv, type Mapping } from "@/lib/csv";
import { importTransactions, type ImportResult } from "./actions";

type Account = { id: string; name: string; bank: string | null; scope: string };

export function ImportClient({ accounts }: { accounts: Account[] }) {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [rows, setRows] = useState<string[][]>([]);
  const [map, setMap] = useState<Mapping | null>(null);
  const [fileName, setFileName] = useState("");
  const [invert, setInvert] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [pending, start] = useTransition();

  async function onFile(f: File | undefined) {
    if (!f) return;
    setResult(null); setFileName(f.name);
    const buf = await f.arrayBuffer();
    let text = new TextDecoder("utf-8").decode(buf);
    if (text.includes("�")) text = new TextDecoder("windows-1252").decode(buf); // ficheiros antigos em ANSI
    const parsed = parseCsv(text.replace(/^﻿/, ""));
    setRows(parsed); setMap(guessMapping(parsed));
  }

  const parsed = useMemo(() => {
    if (!map) return { ok: [], skipped: 0 };
    const r = applyMapping(rows, map);
    return invert ? { ...r, ok: r.ok.map((t) => ({ ...t, amount: -t.amount })) } : r;
  }, [rows, map, invert]);
  const headers = map ? rows[map.header] ?? [] : [];
  const totIn = parsed.ok.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const totOut = parsed.ok.filter((t) => t.amount < 0).reduce((s, t) => s + t.amount, 0);
  const fmt = (n: number) => n.toLocaleString("pt-PT", { style: "currency", currency: "EUR" });

  const col = (label: string, key: keyof Mapping, optional = false) => (
    <label className="flex flex-col gap-1.5">
      <span className="label">{label}</span>
      <select className="input" value={map![key]} onChange={(e) => setMap({ ...map!, [key]: Number(e.target.value) })}>
        {optional && <option value={-1}>— não usar —</option>}
        {headers.map((h, i) => <option key={i} value={i}>{h || `Coluna ${i + 1}`}</option>)}
      </select>
    </label>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="card flex flex-col gap-4">
        <h2 className="h2">1. Escolhe a conta e o ficheiro</h2>
        <div className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(240px,1fr))]">
          <label className="flex flex-col gap-1.5"><span className="label">Conta de destino</span>
            <select className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}{a.scope === "business" ? " (Empresa)" : ""}</option>)}
            </select></label>
          <label className="flex flex-col gap-1.5"><span className="label">Extrato em CSV</span>
            <input type="file" accept=".csv,.txt,text/csv" className="input py-2.5" onChange={(e) => onFile(e.target.files?.[0])} /></label>
        </div>
        <p className="text-xs text-muted">No homebanking do Santander, ActivoBank ou ABANCA, exporta os movimentos em CSV. Se só houver Excel, abre-o e faz “Guardar como → CSV”. Podes importar o mesmo período várias vezes: os movimentos repetidos são ignorados.</p>
      </div>

      {map && (
        <div className="card flex flex-col gap-4">
          <h2 className="h2">2. Confirma as colunas · {fileName}</h2>
          <div className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(180px,1fr))]">
            <label className="flex flex-col gap-1.5"><span className="label">Linha de cabeçalho</span>
              <select className="input" value={map.header} onChange={(e) => setMap({ ...guessMapping(rows.slice(Number(e.target.value))), header: Number(e.target.value) })}>
                {rows.slice(0, 20).map((r, i) => <option key={i} value={i}>{i + 1}: {r.slice(0, 3).join(" | ").slice(0, 40)}</option>)}
              </select></label>
            {col("Data", "date")}
            {col("Descrição", "description")}
            {col("Montante (com sinal)", "amount", true)}
            {map.amount < 0 && col("Débito", "debit", true)}
            {map.amount < 0 && col("Crédito", "credit", true)}
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={invert} onChange={(e) => setInvert(e.target.checked)} className="h-4 w-4" /> Inverter sinais (se as despesas aparecerem como entradas)</label>

          <div className="flex flex-wrap gap-6 text-sm">
            <span><strong className="font-semibold">{parsed.ok.length}</strong> movimentos</span>
            <span className="text-good">Entradas {fmt(totIn)}</span>
            <span>Saídas {fmt(totOut)}</span>
            {parsed.skipped > 0 && <span className="text-muted">{parsed.skipped} linhas ignoradas</span>}
          </div>
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full text-sm">
              <thead className="bg-[#F7F7F9] text-left text-xs text-muted"><tr><th className="px-3 py-2 font-medium">Data</th><th className="px-3 py-2 font-medium">Descrição</th><th className="px-3 py-2 text-right font-medium">Valor</th></tr></thead>
              <tbody>
                {parsed.ok.slice(0, 12).map((t, i) => (
                  <tr key={i} className="border-t border-line"><td className="px-3 py-2 whitespace-nowrap">{t.date}</td><td className="px-3 py-2">{t.description}</td><td className={`px-3 py-2 text-right whitespace-nowrap ${t.amount > 0 ? "text-good" : ""}`}>{fmt(t.amount)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          {parsed.ok.length > 12 && <p className="text-xs text-muted">A mostrar 12 de {parsed.ok.length}.</p>}
          <div className="flex flex-wrap items-center gap-3">
            <button className="btn" disabled={pending || parsed.ok.length === 0 || !accountId}
              onClick={() => start(async () => setResult(await importTransactions(accountId, parsed.ok)))}>
              {pending ? "A importar…" : `Importar ${parsed.ok.length} movimentos`}
            </button>
            {result && !result.error && <span role="status" className="text-sm text-good">{result.inserted} importados · {result.duplicates} já existiam · {result.categorized} categorizados automaticamente. <a href="/financas" className="font-medium text-accent-ink">Ver movimentos</a></span>}
            {result?.error && <span role="alert" className="text-sm text-warn">{result.error}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
