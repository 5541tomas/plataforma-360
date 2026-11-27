"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { browserClient } from "@/lib/supabase/client";
import { setGuideUrl } from "@/app/(app)/crm/lead-magnets/actions";

/** Carrega o PDF do guia para o armazenamento público e liga-o ao lead magnet. */
export function GuideUpload({ magnetId, orgId, slug, current }: { magnetId: string; orgId: string; slug: string; current?: string }) {
  const [state, setState] = useState<"idle" | "up" | "ok" | "err">("idle");
  const [msg, setMsg] = useState("");
  const router = useRouter();
  const upload = async (f: File) => {
    if (f.type !== "application/pdf") { setState("err"); setMsg("Escolhe um ficheiro PDF."); return; }
    if (f.size > 25 * 1024 * 1024) { setState("err"); setMsg("O PDF tem mais de 25 MB."); return; }
    setState("up");
    const path = `${orgId}/${slug}-${Date.now()}.pdf`;
    const sb = browserClient();
    const { error } = await sb.storage.from("p360-public").upload(path, f, { contentType: "application/pdf", upsert: false });
    if (error) { setState("err"); setMsg(error.message); return; }
    const url = sb.storage.from("p360-public").getPublicUrl(path).data.publicUrl;
    const r = await setGuideUrl(magnetId, url);
    if (r) { setState("err"); setMsg(r); return; }
    setState("ok"); setMsg("PDF carregado ✓"); router.refresh();
  };
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line p-3">
      <span className="label">O teu guia em PDF</span>
      {current ? <a href={current} target="_blank" rel="noopener noreferrer" className="truncate text-sm font-medium text-accent-ink">📄 {decodeURIComponent(current.split("/").pop() ?? "guia.pdf")}</a> : <span className="text-sm text-warn">Ainda sem PDF — a 1.ª mensagem vai sem link (anexas no WhatsApp).</span>}
      <label className="btn-ghost w-fit cursor-pointer">{state === "up" ? "A carregar…" : current ? "Substituir PDF" : "Carregar PDF"}
        <input type="file" accept="application/pdf" className="sr-only" disabled={state === "up"} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} /></label>
      {msg && <span role="status" className={`text-sm ${state === "err" ? "text-warn" : "text-good"}`}>{msg}</span>}
    </div>
  );
}
