import { createClient } from "@/lib/supabase/server";
import { getContext } from "@/lib/context";
import { PageHeader } from "@/components/ui";
import { revokeApiToken } from "./actions";
import { addMember, changePassword, disconnectGoogle, removeMember, renameOrg, syncGoogleNow, updateMember, updateProfile } from "./actions";
import { googleConfigured } from "@/lib/google";
import { ClaudeConnect } from "@/components/ClaudeConnect";

const LEVELS = [["none", "Sem acesso"], ["read", "Ler"], ["write", "Editar"]] as const;
const MODULES = [["perm_goals", "Objetivos"], ["perm_finance", "Finanças (empresa)"], ["perm_crm", "CRM"]] as const;
type Member = { user_id: string; email: string; full_name: string | null; role: string; perm_goals: string; perm_finance: string; perm_crm: string };

function PermSelects({ m }: { m?: Partial<Member> }) {
  return (
    <>
      {MODULES.map(([k, label]) => (
        <label key={k} className="flex flex-col gap-1"><span className="label">{label}</span>
          <select name={k} defaultValue={(m?.[k as keyof Member] as string) ?? (k === "perm_crm" ? "write" : "none")} className="input !min-h-10">
            {LEVELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select></label>
      ))}
    </>
  );
}

export default async function DefinicoesPage({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string }> }) {
  const ctx = await getContext();
  const sp = await searchParams;
  const admin = ctx.role === "owner" || ctx.role === "admin";
  const supabase = await createClient();
  const { data: members } = await supabase.rpc("list_members", { p_org: ctx.org.id });
  const { data: profile } = await supabase.from("profiles").select("phone").eq("id", ctx.userId).maybeSingle();
  const { data: tokens } = await supabase.from("api_tokens").select("id, name, created_at, last_used_at").eq("user_id", ctx.userId).order("created_at", { ascending: false });
  const { data: google } = await supabase.from("integrations").select("account_email, last_sync_at").eq("org_id", ctx.org.id).eq("user_id", ctx.userId).eq("provider", "google").maybeSingle();
  const { data: org } = await supabase.from("organizations").select("name, legal_name, nif, address, email, phone, website, iban, about, testimonials, signature_name, signature_role").eq("id", ctx.org.id).single();

  return (
    <>
      <PageHeader title="Definições" />
      {sp.ok && <p role="status" className="rounded-xl bg-good-soft px-4 py-3 text-sm text-[#1E6B30]">{sp.ok}</p>}
      {sp.erro && <p role="alert" className="rounded-xl bg-warn-soft px-4 py-3 text-sm text-[#8F4300]">{sp.erro}</p>}

      <section className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(320px,1fr))]">
        <form action={updateProfile} className="card flex flex-col gap-3">
          <h2 className="h2">Perfil</h2>
          <p className="text-sm text-muted">{ctx.email}</p>
          <label className="flex flex-col gap-1.5"><span className="label">Nome</span><input name="full_name" defaultValue={ctx.name} className="input" required /></label>
          <label className="flex flex-col gap-1.5"><span className="label">Telemóvel (para o resumo no WhatsApp)</span><input name="phone" type="tel" defaultValue={profile?.phone ?? ""} placeholder="+351 912 345 678" className="input" /></label>
          <button className="btn self-start">Guardar</button>
        </form>
        <form action={changePassword} className="card flex flex-col gap-3">
          <h2 className="h2">Palavra-passe</h2>
          <label className="flex flex-col gap-1.5"><span className="label">Nova palavra-passe</span><input name="password" type="password" minLength={8} autoComplete="new-password" className="input" required /></label>
          <label className="flex flex-col gap-1.5"><span className="label">Repetir</span><input name="password2" type="password" minLength={8} autoComplete="new-password" className="input" required /></label>
          <button className="btn self-start">Alterar</button>
        </form>
        {admin && (
          <form action={renameOrg} className="card flex flex-col gap-3">
            <h2 className="h2">Empresa</h2>
            <label className="flex flex-col gap-1.5"><span className="label">Nome na plataforma</span><input name="name" defaultValue={ctx.org.name} className="input" required /></label>
            <p className="text-xs text-muted">Os dados abaixo aparecem nas propostas.</p>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1 col-span-2"><span className="label">Denominação legal</span><input name="legal_name" defaultValue={org?.legal_name ?? ""} className="input" /></label>
              <label className="flex flex-col gap-1"><span className="label">NIF</span><input name="nif" defaultValue={org?.nif ?? ""} className="input" /></label>
              <label className="flex flex-col gap-1"><span className="label">Telefone</span><input name="phone" defaultValue={org?.phone ?? ""} className="input" /></label>
              <label className="flex flex-col gap-1"><span className="label">Email</span><input name="email" type="email" defaultValue={org?.email ?? ""} className="input" /></label>
              <label className="flex flex-col gap-1"><span className="label">Site</span><input name="website" defaultValue={org?.website ?? ""} className="input" /></label>
              <label className="flex flex-col gap-1 col-span-2"><span className="label">Morada</span><input name="address" defaultValue={org?.address ?? ""} className="input" /></label>
              <label className="flex flex-col gap-1 col-span-2"><span className="label">IBAN</span><input name="iban" defaultValue={org?.iban ?? ""} className="input" /></label>
              <label className="flex flex-col gap-1"><span className="label">Quem assina as propostas</span><input name="signature_name" defaultValue={org?.signature_name ?? ""} className="input" /></label>
              <label className="flex flex-col gap-1"><span className="label">Função</span><input name="signature_role" defaultValue={org?.signature_role ?? ""} placeholder="Ex.: Consultor" className="input" /></label>
              <label className="flex flex-col gap-1 col-span-2"><span className="label">Sobre (aparece nas propostas)</span><textarea name="about" rows={4} defaultValue={org?.about ?? ""} className="input py-2.5" placeholder="Quem és, experiência, para quem trabalhas e resultados." /></label>
              <label className="flex flex-col gap-1 col-span-2"><span className="label">Testemunhos (um por parágrafo, “texto — autor”)</span><textarea name="testimonials" rows={4} defaultValue={org?.testimonials ?? ""} className="input py-2.5" placeholder={"O programa mudou a forma como gerimos a equipa. — Ana Silva, CEO da Exemplo"} /></label>
            </div>
            <button className="btn self-start">Guardar</button>
          </form>
        )}
      </section>

      <section className="card flex flex-col gap-3">
        <h2 className="h2">Falar com a plataforma a partir do Claude</h2>
        <p className="text-sm text-muted">Liga a Plataforma 360 ao Claude (claude.ai ou app do telemóvel) e escreve coisas como “fechei o programa com a Marta” ou “regista 45 € de almoço com cliente”. O Claude atualiza o CRM, as finanças e os objetivos.</p>
        {(tokens?.length ?? 0) > 0 && (
          <div className="flex flex-col gap-1.5">
            {tokens!.map((t) => (
              <div key={t.id} className="flex flex-wrap items-center gap-3 text-sm">
                <span>Ligação criada a {new Date(t.created_at).toLocaleDateString("pt-PT")}{t.last_used_at ? ` · última utilização ${new Date(t.last_used_at).toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short" })}` : " · ainda não usada"}</span>
                <form action={revokeApiToken}><input type="hidden" name="id" value={t.id} /><button className="min-h-9 px-2 text-sm font-medium text-warn">Revogar</button></form>
              </div>
            ))}
          </div>
        )}
        <ClaudeConnect />
      </section>

      <section className="card flex flex-col gap-3">
        <h2 className="h2">Gmail e Google Calendar</h2>
        <p className="text-sm text-muted">Os emails e reuniões com contactos do CRM (com email preenchido) entram automaticamente no histórico de cada negócio. Só leitura: a plataforma nunca envia nem apaga nada.</p>
        {!googleConfigured() ? <p className="text-sm text-warn">A integração ainda não está configurada no servidor (faltam GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET).</p>
          : google ? (
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm">Ligado a <strong className="font-semibold">{google.account_email}</strong>{google.last_sync_at ? ` · última sincronização ${new Date(google.last_sync_at).toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short" })}` : ""}</span>
              <form action={syncGoogleNow}><button className="btn">Sincronizar agora</button></form>
              <form action={disconnectGoogle}><button className="min-h-11 px-2 text-sm font-medium text-warn">Desligar</button></form>
            </div>
          ) : <a href="/api/google/connect" className="btn self-start">Ligar conta Google</a>}
      </section>

      <section className="card flex flex-col gap-4">
        <h2 className="h2">Equipa e permissões</h2>
        <p className="text-sm text-muted">As finanças <strong>pessoais</strong> de cada pessoa são sempre privadas. “Finanças (empresa)” controla o acesso às contas da empresa.</p>
        <div className="flex flex-col">
          {((members ?? []) as Member[]).map((m) => (
            <div key={m.user_id} className="flex flex-col gap-2 border-b border-[#F0F0F2] py-3 last:border-0">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div><span className="text-sm font-medium">{m.full_name ?? m.email}</span> <span className="text-xs text-muted">{m.email}</span></div>
                <span className="chip bg-[#F2F2F5] text-ink-2">{m.role === "owner" ? "Dono" : m.role === "admin" ? "Admin" : "Membro"}</span>
              </div>
              {admin && m.role !== "owner" && m.user_id !== ctx.userId && (
                <div className="flex flex-wrap items-end gap-2">
                  <form action={updateMember} className="flex flex-wrap items-end gap-2">
                    <input type="hidden" name="user_id" value={m.user_id} />
                    <label className="flex flex-col gap-1"><span className="label">Papel</span>
                      <select name="role" defaultValue={m.role} className="input !min-h-10"><option value="member">Membro</option><option value="admin">Admin</option></select></label>
                    <PermSelects m={m} />
                    <button className="btn-ghost !min-h-10">Guardar</button>
                  </form>
                  <form action={removeMember}><input type="hidden" name="user_id" value={m.user_id} />
                    <button className="min-h-10 px-2 text-sm font-medium text-warn">Remover</button></form>
                </div>
              )}
            </div>
          ))}
        </div>
        {admin && (
          <form action={addMember} className="flex flex-col gap-3 rounded-2xl bg-[#F7F7F9] p-4">
            <h3 className="text-[15px] font-semibold">Adicionar membro</h3>
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1 flex-[1_1_220px]"><span className="label">Email</span><input name="email" type="email" required className="input !min-h-10" /></label>
              <label className="flex flex-col gap-1"><span className="label">Papel</span>
                <select name="role" className="input !min-h-10"><option value="member">Membro</option><option value="admin">Admin</option></select></label>
              <PermSelects />
              <button className="btn !min-h-10">Adicionar</button>
            </div>
            <p className="text-xs text-muted">A pessoa precisa de ter conta. Enquanto partilhamos o login com o Mentoria, cria-a no Supabase (Authentication → Users → Add user, com “Auto Confirm”).</p>
          </form>
        )}
      </section>
    </>
  );
}
