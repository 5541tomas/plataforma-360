import Link from "next/link";
const MSG: Record<string, [string, string]> = {
  fila: ["good", "Nutrição iniciada. A 1.ª mensagem já está na fila de aprovação — nada sai sem ti."],
  tarefa: ["good", "Nutrição iniciada. O 1.º passo é uma tarefa e já está na tua lista de hoje."],
  semtel: ["warn", "Nutrição iniciada, mas o contacto não tem telemóvel: os passos de WhatsApp vão ser saltados. Acrescenta o número no contacto."],
  semmail: ["warn", "Nutrição iniciada, mas o contacto não tem email (ou cancelou): os passos de email vão ser saltados."],
  ja: ["warn", "Este contacto já está nesta sequência."],
  erro: ["warn", "Não foi possível iniciar a sequência. Tenta novamente."],
};
/** Confirmação depois de carregar em "Iniciar nutrição" */
export function NurtureNotice({ code }: { code?: string }) {
  if (!code || !MSG[code]) return null;
  const [tone, text] = MSG[code];
  return (
    <p role="status" className={`flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm ${tone === "good" ? "bg-good-soft text-[#1E6B30]" : "bg-warn-soft text-warn"}`}>
      <span>{text}</span>{code === "fila" && <Link href="/crm/automacoes" className="font-semibold underline">Ver fila</Link>}
    </p>
  );
}
