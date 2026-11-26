"use client";
import { useEffect, useRef, useState } from "react";

type Msg = { role: "user" | "assistant"; content: string };
const SUGESTOES = [
  "Quanto gastei este mês e em quê?",
  "Que negócios devo atacar esta semana?",
  "Estou no caminho certo para os meus objetivos?",
  "Quanto posso pagar-me este mês sem pôr a empresa em risco?",
  "Onde posso cortar despesas pessoais?",
];

/** Markdown mínimo e seguro: **negrito** e listas, sem HTML */
function Rich({ text }: { text: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      {text.split("\n").map((line, i) => {
        const bullet = /^\s*([-*•]|\d+\.)\s+/.test(line);
        const clean = line.replace(/^\s*([-*•])\s+/, "").replace(/^#+\s*/, "");
        const parts = clean.split(/(\*\*[^*]+\*\*)/g).map((p, j) => (p.startsWith("**") && p.endsWith("**") ? <strong key={j} className="font-semibold">{p.slice(2, -2)}</strong> : <span key={j}>{p}</span>));
        if (!line.trim()) return <div key={i} className="h-1" />;
        return bullet ? <div key={i} className="flex gap-2"><span aria-hidden="true">•</span><span>{parts}</span></div> : <p key={i}>{parts}</p>;
      })}
    </div>
  );
}

export function Chat({ initial }: { initial?: string }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    const next: Msg[] = [...msgs, { role: "user", content: q }];
    setMsgs([...next, { role: "assistant", content: "" }]);
    setInput(""); setBusy(true);
    try {
      const res = await fetch("/api/assistente", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: next }) });
      if (!res.ok || !res.body) {
        const err = await res.text();
        setMsgs([...next, { role: "assistant", content: `⚠ ${err || "Erro ao contactar o assistente."}` }]);
        return;
      }
      const reader = res.body.getReader(); const dec = new TextDecoder(); let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += dec.decode(value, { stream: true });
        setMsgs([...next, { role: "assistant", content: acc }]);
      }
    } catch {
      setMsgs([...next, { role: "assistant", content: "⚠ Sem ligação. Tenta novamente." }]);
    } finally { setBusy(false); }
  }

  useEffect(() => { if (initial && !started.current) { started.current = true; send(initial); } }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [msgs]);

  return (
    <div className="flex flex-col gap-4">
      {msgs.length === 0 && (
        <div className="flex flex-wrap gap-2">
          {SUGESTOES.map((s) => <button key={s} onClick={() => send(s)} className="rounded-full border border-line bg-card px-3.5 min-h-9 text-[13px] hover:bg-soft">{s}</button>)}
        </div>
      )}
      <div className="flex flex-col gap-3" aria-live="polite">
        {msgs.map((m, i) => (
          <div key={i} className={m.role === "user" ? "self-end max-w-[85%] rounded-2xl bg-accent px-4 py-2.5 text-sm text-white" : "max-w-[95%] card !p-5 text-sm leading-relaxed"}>
            {m.role === "assistant" ? (m.content ? <Rich text={m.content} /> : <span className="text-muted">A analisar os teus dados…</span>) : m.content}
          </div>
        ))}
        <div ref={end} />
      </div>
      <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="sticky bottom-4 flex items-center gap-2 rounded-2xl border border-line bg-card p-2 shadow-lg">
        <label htmlFor="q" className="sr-only">Pergunta</label>
        <input id="q" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Pergunta sobre as tuas finanças, clientes ou objetivos…" className="flex-1 bg-transparent px-3 text-[15px] outline-none min-h-11" />
        <button disabled={busy || !input.trim()} className="btn disabled:opacity-50">{busy ? "…" : "Enviar"}</button>
      </form>
    </div>
  );
}
