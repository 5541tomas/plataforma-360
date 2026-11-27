import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { canWrite, type AppContext as Ctx } from "@/lib/context";
import { emailConfigured } from "@/lib/email";
import { aiConfigured } from "@/lib/ai";
import { dismissSetup } from "@/app/(app)/setup-actions";

/** "Primeiros passos": o que falta configurar para tirar o máximo da plataforma. */
export async function SetupChecklist({ ctx }: { ctx: Ctx }) {
  if (ctx.role !== "owner" && ctx.role !== "admin") return null;
  const supabase = await createClient();
  const n = (q: PromiseLike<{ count: number | null }>) => q.then((r) => r.count ?? 0);
  const [{ data: org }, seqs, mags, contacts, txs, goals] = await Promise.all([
    supabase.from("organizations").select("public_slug, booking, settings, signature_name, about").eq("id", ctx.org.id).single(),
    n(supabase.from("sequences").select("id", { count: "exact", head: true }).eq("org_id", ctx.org.id)),
    n(supabase.from("lead_magnets").select("id", { count: "exact", head: true }).eq("org_id", ctx.org.id)),
    n(supabase.from("contacts").select("id", { count: "exact", head: true }).eq("org_id", ctx.org.id)),
    n(supabase.from("transactions").select("id", { count: "exact", head: true }).eq("org_id", ctx.org.id)),
    n(supabase.from("goals").select("id", { count: "exact", head: true }).eq("org_id", ctx.org.id)),
  ]);
  if ((org?.settings as { setup_dismissed?: boolean })?.setup_dismissed) return null;
  const crm = canWrite(ctx, "crm");
  const steps = [
    { done: !!(org?.signature_name && org?.about), label: "Dados da empresa, assinatura e “sobre mim” (usados nas propostas)", href: "/definicoes" },
    { done: goals > 0, label: "Definir a meta anual e os objetivos", href: "/meta" },
    { done: txs > 0, label: "Importar o primeiro extrato bancário", href: "/financas/importar" },
    ...(crm ? [
      { done: contacts >= 5, label: "Importar os teus contactos (CSV)", href: "/crm/contactos/importar" },
      { done: !!org?.public_slug, label: "Escolher o teu endereço público", href: "/crm/lead-magnets" },
      { done: seqs > 0, label: "Criar as sequências e regras de nutrição", href: "/crm/automacoes" },
      { done: mags > 0, label: "Publicar o guia «Os 7 Erros» e o teste dos 7 pecados", href: "/crm/lead-magnets" },
      { done: !!(org?.booking as { enabled?: boolean })?.enabled, label: "Ativar a agenda de marcações 1:1", href: "/crm/agenda" },
    ] : []),
    { done: emailConfigured(), label: "Ligar o envio de email (Resend) — pede-me para te guiar", href: "/crm/automacoes" },
    { done: aiConfigured(), label: "Ligar a IA (chave da Anthropic no Netlify)", href: "/assistente" },
  ];
  const done = steps.filter((s) => s.done).length;
  if (done === steps.length) return null;
  return (
    <section className="card flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><h2 className="h2">Primeiros passos</h2><p className="text-sm text-muted">{done} de {steps.length} concluídos</p></div>
        <form action={dismissSetup}><button className="text-xs text-muted hover:text-ink">Esconder</button></form>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-soft"><div className="h-full rounded-full bg-accent" style={{ width: `${(done / steps.length) * 100}%` }} /></div>
      <ul className="grid gap-1.5 sm:grid-cols-2">
        {steps.map((s) => (
          <li key={s.label}>
            <Link href={s.href} className={`flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm ${s.done ? "text-muted line-through" : "text-ink hover:bg-soft"}`}>
              <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] ${s.done ? "bg-good text-white" : "border-2 border-line"}`}>{s.done ? "✓" : ""}</span>{s.label}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
