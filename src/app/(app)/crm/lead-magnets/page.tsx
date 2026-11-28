import Link from "next/link";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { requireModule, canWrite } from "@/lib/context";
import { dateShort, eur } from "@/lib/format";
import { Empty, PageHeader } from "@/components/ui";
import { CopyLink } from "@/components/CopyLink";
import { qrSvg } from "@/lib/qr";
import { GuideUpload } from "@/components/GuideUpload";
import { LinkBuilder } from "@/components/LinkBuilder";
import type { Offer } from "@/lib/magnets";
import { deleteMagnet, enableChallenge, saveMagnet, savePixel, seedBrandMagnets, setMeetingUrl, setPublicSlug } from "./actions";
import { channelLabel } from "@/lib/utm";
import { ConfirmDelete } from "@/components/ConfirmDelete";

type Mag = { id: string; slug: string; kind: "quiz" | "ebook" | "guide"; title: string; subtitle: string | null; config: { content?: string; areas?: { key: string; name: string }[] }; custom_domain: string | null; offer: Offer & { whatsapp?: string; keyword?: string; guide_url?: string; whatsapp_body?: string }; sequence_id: string | null; sequence2_id: string | null; active: boolean; views: number };
type Resp = { id: string; magnet_id: string; contact_id: string | null; deal_id: string | null; total: number | null; weakest: string | null; created_at: string; answers: { utm?: { source?: string; variant?: string } } | null };
type View = { magnet_id: string; channel: string; variant: string; n: number };

export default async function LeadMagnetsPage({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const ctx = await requireModule("crm");
  const write = canWrite(ctx, "crm");
  const sp = await searchParams;
  const supabase = await createClient();
  const h = await headers();
  const base = process.env.NEXT_PUBLIC_SITE_URL || `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const [{ data: org }, { data: mags }, { data: resps }, { data: seqs }, { data: viewRows }] = await Promise.all([
    supabase.from("organizations").select("public_slug, name, settings").eq("id", ctx.org.id).single(),
    supabase.from("lead_magnets").select("*").eq("org_id", ctx.org.id).order("created_at"),
    supabase.from("magnet_responses").select("id, magnet_id, contact_id, deal_id, total, weakest, created_at, answers").eq("org_id", ctx.org.id).order("created_at", { ascending: false }).limit(1000),
    supabase.from("sequences").select("id, name").eq("org_id", ctx.org.id).order("created_at"),
    supabase.from("magnet_views").select("magnet_id, channel, variant, n").eq("org_id", ctx.org.id).gte("day", new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10)),
  ]);
  const views = (viewRows ?? []) as View[];
  const pixel = ((org?.settings ?? {}) as { pixel?: { meta?: string | null } }).pixel?.meta ?? "";
  /** Visitas e leads por canal e por versão (últimos 90 dias de visitas) */
  const breakdown = (m: Mag, rs: Resp[]) => {
    const ch = new Map<string, { v: number; l: number }>(), ab = new Map<string, { v: number; l: number }>();
    for (const v of views.filter((x) => x.magnet_id === m.id)) {
      const c = ch.get(v.channel) ?? { v: 0, l: 0 }; c.v += v.n; ch.set(v.channel, c);
      const a = ab.get(v.variant) ?? { v: 0, l: 0 }; a.v += v.n; ab.set(v.variant, a);
    }
    for (const r of rs) {
      const k = r.answers?.utm?.source || "direto"; const c = ch.get(k) ?? { v: 0, l: 0 }; c.l++; ch.set(k, c);
      const vr = r.answers?.utm?.variant; if (vr) { const a = ab.get(vr) ?? { v: 0, l: 0 }; a.l++; ab.set(vr, a); }
    }
    return { ch: [...ch.entries()].sort((a, b) => b[1].v + b[1].l - (a[1].v + a[1].l)), ab: [...ab.entries()].sort() };
  };
  const responses = (resps ?? []) as Resp[];
  const contactIds = [...new Set(responses.map((r) => r.contact_id).filter(Boolean))] as string[];
  const [{ data: deals }, { data: stages }, { data: contacts }] = await Promise.all([
    contactIds.length ? supabase.from("deals").select("id, contact_id, status, stage_id, value, closed_at, created_at").in("contact_id", contactIds) : Promise.resolve({ data: [] }),
    supabase.from("stages").select("id, position").eq("org_id", ctx.org.id),
    contactIds.length ? supabase.from("contacts").select("id, name, score").in("id", contactIds) : Promise.resolve({ data: [] }),
  ]);
  const pos = new Map((stages ?? []).map((s) => [s.id, s.position as number]));
  const cName = new Map((contacts ?? []).map((c) => [c.id, c as { id: string; name: string; score: number }]));
  const slug = org?.public_slug;
  const meetingUrl = ((mags ?? []) as Mag[]).find((m) => m.offer?.meeting_url)?.offer.meeting_url ?? "";

  const stats = (m: Mag) => {
    const rs = responses.filter((r) => r.magnet_id === m.id);
    const cs = new Set(rs.map((r) => r.contact_id));
    const first = new Map<string, string>(); rs.forEach((r) => { if (r.contact_id) first.set(r.contact_id, r.created_at); });
    const ds = (deals ?? []).filter((d) => cs.has(d.contact_id) && d.created_at >= (first.get(d.contact_id!) ?? "").slice(0, 10));
    const meetings = new Set(ds.filter((d) => d.status === "won" || (pos.get(d.stage_id) ?? 0) >= 1).map((d) => d.contact_id)).size;
    const won = ds.filter((d) => d.status === "won");
    const totals = rs.map((r) => r.total).filter((x): x is number => x != null);
    const weak: Record<string, number> = {}; rs.forEach((r) => { if (r.weakest) weak[r.weakest] = (weak[r.weakest] ?? 0) + 1; });
    return { leads: rs.length, meetings, wonN: new Set(won.map((d) => d.contact_id)).size, wonV: won.reduce((a, d) => a + Number(d.value), 0),
      avg: totals.length ? Math.round(totals.reduce((a, b) => a + b, 0) / totals.length) : null, weak: Object.entries(weak).sort((a, b) => b[1] - a[1]), rs };
  };
  const qrs = new Map<string, string>();
  if (slug) for (const m of (mags ?? []) as Mag[]) qrs.set(m.id, await qrSvg(`${base}/d/${slug}/${m.slug}`));
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");

  return (
    <>
      <PageHeader title="Lead magnets">
      </PageHeader>
      <p className="-mt-2 max-w-[720px] text-sm text-muted">Ofertas gratuitas que trazem leads qualificadas: cada pessoa entra no CRM com as respostas, a pontuação e a área mais fraca, recebe o resultado (depois de aprovares) e entra numa sequência que leva à reunião 1:1.</p>
      {sp.erro && <p role="alert" className="rounded-xl bg-warn-soft px-4 py-3 text-sm text-warn">{sp.erro}</p>}
      {write && slug && (mags?.length ?? 0) > 0 && (
        <details className="self-start text-sm"><summary className="cursor-pointer font-medium text-accent-ink">+ Novo lead magnet</summary>
          <div className="mt-2 flex flex-wrap gap-2">
            {!((mags ?? []) as Mag[]).some((m) => m.slug === "7-erros") && <form action={seedBrandMagnets}><input type="hidden" name="which" value="guide" /><button className="btn-ghost">Guia «Os 7 Erros» (WhatsApp)</button></form>}
            {!((mags ?? []) as Mag[]).some((m) => m.slug === "7-pecados") && <form action={seedBrandMagnets}><input type="hidden" name="which" value="quiz" /><button className="btn-ghost">Teste «Quantos pecados cometes?»</button></form>}
          </div>
        </details>
      )}
      {write && slug && (mags?.length ?? 0) === 0 && (
        <section className="flex flex-wrap items-center justify-between gap-4 rounded-[20px] bg-[#0B0B0B] p-6 text-white">
          <div className="flex max-w-[560px] flex-col gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-[3px] text-[#C9A55C]">No teu estilo · preto e dourado</span>
            <h2 className="text-[22px] font-bold tracking-[-0.4px]">Os 7 Erros do Freelancer + teste «Quantos pecados cometes?»</h2>
            <p className="text-sm text-white/70">A tua landing page, agora ligada ao CRM: cada pedido do guia entra como lead com a área de atividade, abre o teu WhatsApp como antes e começa a sequência de 5 mensagens em 10 dias (todas com a tua aprovação).</p>
          </div>
          <form action={seedBrandMagnets}><input type="hidden" name="which" value="both" /><button className="inline-flex min-h-11 items-center rounded-xl bg-[#C9A55C] px-5 text-sm font-bold text-[#080808] hover:bg-white">Criar os dois</button></form>
        </section>
      )}

      {write && (
        <section className="card grid gap-4 grid-cols-[repeat(auto-fit,minmax(280px,1fr))]">
          <form action={setPublicSlug} className="flex flex-col gap-2">
            <span className="label">O teu endereço público</span>
            <div className="flex gap-2"><span className="flex min-h-11 items-center text-sm text-muted">/d/</span><input name="slug" defaultValue={slug ?? "thomasfaria"} required className="input" /><button className="btn-ghost">Guardar</button></div>
            {!slug && <span className="text-xs text-warn">Define o endereço para poderes criar os lead magnets.</span>}
          </form>
          <form action={setMeetingUrl} className="flex flex-col gap-2">
            <span className="label">Link para marcar a reunião 1:1 (Google Calendar, Calendly…)</span>
            <div className="flex gap-2"><input name="meeting_url" type="url" defaultValue={meetingUrl} placeholder="https://calendar.app.google/…" className="input" /><button className="btn-ghost">Guardar</button></div>
            <span className="text-xs text-muted">{meetingUrl ? "Usado nos botões e emails." : "Deixa vazio para usares a tua Agenda de marcações (CRM → Agenda). Sem agenda ativa, o botão abre o teu WhatsApp ou email."}</span>
          </form>
          <form action={savePixel} className="flex flex-col gap-2">
            <span className="label">Meta Pixel (opcional, para anúncios)</span>
            <div className="flex gap-2"><input name="pixel" inputMode="numeric" defaultValue={pixel} placeholder="ID do Pixel, ex.: 1234567890" className="input" /><button className="btn-ghost">Guardar</button></div>
            <span className="text-xs text-muted">{pixel ? "Ativo: regista visitas e leads (evento Lead) só de quem aceita cookies." : "Sem ID, as páginas não carregam nada da Meta. Com ID, aparece um aviso de cookies e só mede quem aceitar."}</span>
          </form>
        </section>
      )}

      {(mags ?? []).length === 0 ? <Empty>{slug ? "Carrega em “Criar os dois” para teres o teu guia «Os 7 Erros» e o teste «Quantos pecados cometes?» prontos, com a sequência de WhatsApp." : "Começa por definir o teu endereço público."}</Empty> : ((mags ?? []) as Mag[]).map((m) => {
        const s = stats(m);
        const url = m.custom_domain ? `https://${m.custom_domain}` : `${base}/d/${slug}/${m.slug}`;
        return (
          <article key={m.id} className="card flex flex-col gap-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex flex-col gap-1"><span className="text-xs font-semibold uppercase tracking-[0.6px] text-muted">{m.kind === "quiz" ? "Teste interativo" : m.kind === "guide" ? "Guia por WhatsApp" : "Ebook"}</span><h2 className="h2">{m.title}</h2></div>
              <div className="flex items-center gap-3">
                <span className={`chip ${m.active ? "bg-good-soft text-[#1E6B30]" : "bg-[#F2F2F5] text-muted"}`}>{m.active ? "Publicado" : "Pausado"}</span>
                {write && <ConfirmDelete action={deleteMagnet} id={m.id} warning={`Apagar «${m.title}»? O link deixa de funcionar${s.leads ? ` e perdes as ${s.leads} respostas guardadas (os contactos ficam no CRM)` : ""}.`} />}
              </div>
            </div>
            {slug && (
              <div className="flex flex-wrap items-center gap-4">
                <CopyLink url={url} />
                {qrs.get(m.id) && <details className="text-sm"><summary className="cursor-pointer font-medium text-muted">QR code</summary>
                  <div className="mt-2 flex items-end gap-3"><div className="h-36 w-36" dangerouslySetInnerHTML={{ __html: qrs.get(m.id)! }} />
                    <a download={`qr-${m.slug}.svg`} href={`data:image/svg+xml;utf8,${encodeURIComponent(qrs.get(m.id)!)}`} className="text-sm font-medium text-accent-ink">Descarregar</a></div></details>}
              </div>
            )}
            <div className="grid gap-2 grid-cols-[repeat(auto-fit,minmax(110px,1fr))]">
              {[["Visitas", String(m.views), ""], ["Leads", String(s.leads), pct(s.leads, m.views)], ["Reuniões", String(s.meetings), pct(s.meetings, s.leads)], ["Clientes", String(s.wonN), pct(s.wonN, s.meetings)], ["Faturado", eur(s.wonV), ""]].map(([l, v, p]) => (
                <div key={l} className="rounded-2xl bg-[#F7F7F9] px-3 py-2.5"><div className="text-xs text-muted">{l}</div><div className="text-[20px] font-semibold tabular-nums">{v}</div>{p && <div className="text-[11px] text-muted">conversão {p}</div>}</div>
              ))}
            </div>
            {(() => { const b = breakdown(m, s.rs); const abOn = !!((m.kind === "guide" ? (m.config as { ab?: { on?: boolean } }).ab : (m.config as { landing?: { ab?: { on?: boolean } } }).landing?.ab)?.on); return (b.ch.length > 0 || abOn) && (
              <div className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(260px,1fr))]">
                {b.ch.length > 0 && <div className="rounded-2xl border border-line p-3"><div className="label mb-1.5">Por canal</div>
                  <table className="w-full text-sm"><thead><tr className="text-left text-xs text-muted"><th className="font-medium">Canal</th><th className="text-right font-medium">Visitas</th><th className="text-right font-medium">Leads</th><th className="text-right font-medium">Conversão</th></tr></thead>
                    <tbody>{b.ch.map(([k, x]) => <tr key={k} className="border-t border-[#F0F0F2]"><td className="py-1.5">{channelLabel(k)}</td><td className="text-right tabular-nums">{x.v}</td><td className="text-right tabular-nums">{x.l}</td><td className="text-right tabular-nums">{pct(x.l, x.v)}</td></tr>)}</tbody></table></div>}
                {abOn && <div className="rounded-2xl border border-line p-3"><div className="label mb-1.5">Teste A/B do título</div>
                  {b.ab.length === 0 ? <p className="text-sm text-muted">A recolher dados…</p> : <table className="w-full text-sm"><tbody>{b.ab.map(([k, x]) => { const best = b.ab.length === 2 && x.v >= 30 && b.ab.every(([, y]) => (x.l / Math.max(1, x.v)) >= (y.l / Math.max(1, y.v))); return <tr key={k} className="border-t border-[#F0F0F2] first:border-0"><td className="py-1.5 font-medium">Versão {k}{best && <span className="chip ml-2 bg-good-soft text-[#1E6B30]">a ganhar</span>}</td><td className="text-right tabular-nums">{x.v} visitas</td><td className="text-right tabular-nums">{x.l} leads</td><td className="text-right font-semibold tabular-nums">{pct(x.l, x.v)}</td></tr>; })}</tbody></table>}
                  <p className="mt-1.5 text-xs text-muted">Decide só depois de cada versão ter pelo menos 100 visitas.</p></div>}
              </div>
            ); })()}
            {write && m.kind === "guide" && !m.sequence2_id && <form action={enableChallenge} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-accent-soft px-4 py-3"><input type="hidden" name="id" value={m.id} /><span className="text-sm text-accent-ink"><strong className="font-semibold">Desafio de 7 dias por email:</strong> um pecado por dia, uma ação de 15 minutos e o convite para a reunião no fim. Os emails passam pela tua fila.</span><button className="btn">Ativar</button></form>}
            {slug && <LinkBuilder url={url} />}
            {write && m.kind === "guide" && <GuideUpload magnetId={m.id} orgId={ctx.org.id} slug={m.slug} current={m.offer.guide_url || undefined} />}
            {m.kind === "quiz" && s.leads > 0 && (
              <p className="text-sm text-ink-2">Pontuação média <strong className="font-semibold">{s.avg}/100</strong> · Área mais fraca: {s.weak.map(([w, n]) => `${w} (${n})`).join(" · ")}</p>
            )}
            {s.rs.length > 0 && (
              <details><summary className="cursor-pointer text-sm font-medium text-accent-ink">Últimas leads ({s.rs.length})</summary>
                <div className="mt-2 flex flex-col">{s.rs.slice(0, 25).map((r) => { const c = r.contact_id ? cName.get(r.contact_id) : undefined; return (
                  <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-[#F0F0F2] py-2 text-sm last:border-0">
                    {c ? <Link href={`/crm/contactos/${c.id}`} className="font-medium hover:text-accent-ink">{c.name}</Link> : <span>—</span>}
                    <span className="text-xs text-muted">{r.total != null ? `${r.total}/100 · ${r.weakest} · ` : ""}{dateShort(r.created_at)}{c ? ` · pontuação ${c.score}` : ""}</span>
                    {m.kind === "quiz" && <a href={`/r/${r.id}`} target="_blank" className="text-xs text-accent-ink">Ver resultado</a>}
                  </div>); })}</div>
              </details>
            )}
            {write && (
              <details><summary className="cursor-pointer text-sm font-medium text-muted">Editar textos, email e sequência</summary>
                <form action={saveMagnet} className="mt-3 flex flex-col gap-3">
                  <input type="hidden" name="id" value={m.id} /><input type="hidden" name="meeting_url" value={m.offer.meeting_url ?? ""} />
                  <label className="flex flex-col gap-1.5"><span className="label">Domínio próprio (opcional)</span><input name="custom_domain" defaultValue={m.custom_domain ?? ""} placeholder="7erros.thomasfaria.pt" className="input" />
                    <span className="text-xs text-muted">Depois adiciona o domínio no Netlify (site da plataforma → Domain management → Add domain alias) e aponta o DNS (CNAME) para plataforma-360-0sri.netlify.app.</span></label>
                  <label className="flex flex-col gap-1.5"><span className="label">Título</span><input name="title" defaultValue={m.title} className="input" /></label>
                  <label className="flex flex-col gap-1.5"><span className="label">Subtítulo</span><textarea name="subtitle" rows={2} defaultValue={m.subtitle ?? ""} className="input py-2.5" /></label>
                  <div className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(220px,1fr))]">
                    <label className="flex flex-col gap-1.5"><span className="label">Texto do botão da reunião</span><input name="meeting_label" defaultValue={m.offer.meeting_label ?? ""} className="input" /></label>
                    <label className="flex flex-col gap-1.5"><span className="label">Sequência de nutrição</span><select name="sequence_id" defaultValue={m.sequence_id ?? ""} className="input"><option value="">Nenhuma</option>{(seqs ?? []).map((q) => <option key={q.id} value={q.id}>{q.name}</option>)}</select></label>
                    <label className="flex flex-col gap-1.5"><span className="label">2.ª sequência (email)</span><select name="sequence2_id" defaultValue={m.sequence2_id ?? ""} className="input"><option value="">Nenhuma</option>{(seqs ?? []).map((q) => <option key={q.id} value={q.id}>{q.name}</option>)}</select></label>
                  </div>
                  <label className="flex flex-col gap-1.5"><span className="label">Assunto do email com o resultado</span><input name="email_subject" defaultValue={m.offer.email_subject ?? ""} className="input" /></label>
                  <label className="flex flex-col gap-1.5"><span className="label">{m.kind === "guide" ? "Email com o guia" : "Email com o resultado (fica na fila para aprovares)"}</span><textarea name="email_body" rows={10} defaultValue={m.offer.email_body ?? ""} className="input py-2.5 text-sm leading-relaxed" /></label>
                  <div className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(200px,1fr))]">
                    <label className="flex flex-col gap-1.5"><span className="label">O teu WhatsApp (recebe os pedidos)</span><input name="whatsapp" defaultValue={m.offer.whatsapp ?? ""} placeholder="351912345678" className="input" /></label>
                    <label className="flex flex-col gap-1.5"><span className="label">Palavra-chave na mensagem</span><input name="keyword" defaultValue={m.offer.keyword ?? ""} placeholder="GUIA" className="input" /></label>
                    <label className="flex flex-col gap-1.5"><span className="label">Ou link do PDF (Drive, Dropbox…)</span><input name="guide_url" type="url" defaultValue={m.offer.guide_url ?? ""} placeholder="https://drive.google.com/…" className="input" /></label>
                  </div>
                  <label className="flex flex-col gap-1.5"><span className="label">Primeira mensagem de WhatsApp (fica na fila para aprovares)</span><textarea name="whatsapp_body" rows={5} defaultValue={m.offer.whatsapp_body ?? ""} className="input py-2.5 text-sm leading-relaxed" /></label>
                  <p className="text-xs text-muted">Variáveis: {"{{primeiro_nome}} {{area}} {{pontuacao}} {{area_fraca}} {{link_guia}} {{link_resultado}} {{link_reuniao}} {{meu_nome}}"}</p>
                  {(m.kind === "guide" || "landing" in (m.config as object)) && (
                    <details className="rounded-xl border border-line p-3"><summary className="cursor-pointer text-sm font-medium">Textos da página (avançado)</summary>
                      <p className="mt-2 text-xs text-muted">Todos os textos da página. Use **negrito** e *dourado*. Mantém as aspas e vírgulas — se houver um erro de formatação, nada é alterado.</p>
                      <textarea name="config_json" rows={18} defaultValue={JSON.stringify(m.config, null, 2)} className="input mt-2 py-2.5 font-mono text-xs leading-relaxed" /></details>
                  )}
                  {m.kind === "ebook" && <label className="flex flex-col gap-1.5"><span className="label">Conteúdo do ebook (## título, - lista, &gt; destaque, **negrito**)</span><textarea name="content" rows={16} defaultValue={m.config.content ?? ""} className="input py-2.5 font-mono text-xs leading-relaxed" /></label>}
                  {m.kind === "guide" && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="auto_email" defaultChecked={(m.offer as { auto_email?: boolean }).auto_email !== false} className="h-4 w-4" /> Enviar o email com o guia logo após o pedido (sem passar pela fila)</label>}
                  {(m.kind === "guide" || "landing" in (m.config as object)) && (() => { const ab = (m.kind === "guide" ? (m.config as { ab?: { on?: boolean; lines?: string[]; accent?: string; lead?: string } }).ab : (m.config as { landing?: { ab?: { on?: boolean; lines?: string[]; accent?: string; lead?: string } } }).landing?.ab) ?? {}; return (
                    <details className="rounded-xl border border-line p-3" open={!!ab.on}><summary className="cursor-pointer text-sm font-medium">Teste A/B do título</summary>
                      <p className="mt-2 text-xs text-muted">Metade das visitas vê esta versão B. Cada pessoa vê sempre a mesma. Os resultados aparecem acima, no cartão.</p>
                      <div className="mt-2 grid gap-3 grid-cols-[repeat(auto-fit,minmax(220px,1fr))]">
                        <label className="flex flex-col gap-1.5"><span className="label">Linhas do título B (uma por linha)</span><textarea name="ab_lines" rows={2} defaultValue={(ab.lines ?? []).join("\n")} placeholder={"FATURA MAIS\nSEM TRABALHAR"} className="input py-2.5" /></label>
                        <label className="flex flex-col gap-1.5"><span className="label">Final em dourado</span><input name="ab_accent" defaultValue={ab.accent ?? ""} placeholder="mais horas." className="input" /></label>
                      </div>
                      <label className="mt-2 flex flex-col gap-1.5"><span className="label">Texto de apoio B (opcional)</span><textarea name="ab_lead" rows={2} defaultValue={ab.lead ?? ""} className="input py-2.5" /></label>
                      <label className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" name="ab_on" defaultChecked={!!ab.on} className="h-4 w-4" /> Teste ativo</label>
                    </details>); })()}
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={m.active} className="h-4 w-4" /> Publicado</label>
                  <button className="btn self-start">Guardar</button>
                </form>
              </details>
            )}
          </article>
        );
      })}
      {(mags ?? []).length > 0 && <p className="text-sm text-muted">Onde usar: na bio do Instagram e do LinkedIn, na assinatura de email, no fim de cada publicação («faz o diagnóstico gratuito»), em apresentações e eventos (gera um QR code com o link).</p>}
    </>
  );
}
