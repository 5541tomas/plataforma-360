"use client";
import { useState, useTransition } from "react";
import { createApiToken } from "@/app/(app)/definicoes/actions";

export function ClaudeConnect() {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-3">
      {!url ? (
        <button disabled={pending} onClick={() => start(async () => { const r = await createApiToken(); if ("token" in r) setUrl(`${window.location.origin}/api/mcp/${r.token}`); else setError(r.error); })} className="btn self-start disabled:opacity-50">
          {pending ? "A criar…" : "Criar ligação ao Claude"}
        </button>
      ) : (
        <div className="flex flex-col gap-2 rounded-xl bg-[#F7F7F9] p-4">
          <p className="text-sm font-medium">Copia este endereço agora — por segurança não volta a ser mostrado:</p>
          <code className="break-all rounded-lg bg-white p-3 text-xs">{url}</code>
          <button onClick={async () => { await navigator.clipboard.writeText(url); setCopied(true); }} className="btn-ghost self-start">{copied ? "Copiado ✓" : "Copiar"}</button>
          <ol className="list-decimal pl-5 text-sm text-ink-2">
            <li>Em claude.ai, abre <strong>Definições → Conectores</strong> (Connectors).</li>
            <li>Escolhe <strong>Adicionar conector personalizado</strong>, dá-lhe o nome “Plataforma 360” e cola o endereço.</li>
            <li>Numa conversa, ativa o conector e experimenta: “Qual é o meu resumo do dia?”</li>
          </ol>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-warn">{error}</p>}
    </div>
  );
}
