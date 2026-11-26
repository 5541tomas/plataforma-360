import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireModule } from "@/lib/context";
import { eur2 } from "@/lib/format";
import { PrintButton } from "./PrintButton";
import type { Item, Phase } from "@/lib/proposals";

export const metadata = { title: "Proposta" };
const longDate = (s: string) => new Date(s).toLocaleDateString("pt-PT", { day: "numeric", month: "long", year: "numeric" });
const lines = (s?: string | null) => (s ?? "").split("\n").map((l) => l.trim()).filter(Boolean);

function Page({ children, className = "", style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <section style={style} className={`sheet relative mx-auto flex min-h-[297mm] w-full max-w-[210mm] flex-col bg-white px-[18mm] py-[20mm] text-[13px] leading-relaxed text-ink shadow-xl print:min-h-0 print:max-w-none print:px-0 print:py-0 print:shadow-none ${className}`}>
      {children}
    </section>
  );
}

function Heading({ n, children, accent }: { n: string; children: React.ReactNode; accent: string }) {
  return (
    <div className="mb-6 flex items-baseline gap-4">
      <span className="text-sm font-semibold tabular-nums" style={{ color: accent }}>{n}</span>
      <h2 className="text-[26px] font-bold leading-tight tracking-[-0.6px]">{children}</h2>
    </div>
  );
}

function Footer({ org, number }: { org: string; number: string }) {
  return <div className="mt-auto flex justify-between border-t border-line pt-3 text-[10px] uppercase tracking-[0.8px] text-muted print:hidden"><span>{org}</span><span>Proposta {number}</span></div>;
}

export default async function PrintProposal({ params }: { params: Promise<{ pid: string }> }) {
  const ctx = await requireModule("crm");
  const { pid } = await params;
  const supabase = await createClient();
  const { data: p } = await supabase.from("proposals").select("*").eq("id", pid).eq("org_id", ctx.org.id).maybeSingle();
  if (!p) notFound();
  const [{ data: org }, { data: deal }] = await Promise.all([
    supabase.from("organizations").select("*").eq("id", ctx.org.id).single(),
    supabase.from("v_deals").select("title, company_name, contact_name, contact_email, duration_months").eq("id", p.deal_id).single(),
  ]);
  const accent: string = p.accent || "#0071E3";
  const items = (p.items ?? []) as Item[];
  const phases = (p.phases ?? []) as Phase[];
  const objectives = lines(p.objectives);
  const steps = lines(p.next_steps);
  const testimonials = (org?.testimonials ?? "").split(/\n\s*\n/).map((t: string) => t.trim()).filter(Boolean);
  const vat = Number(p.total) * Number(p.vat_rate) / 100;
  const per = p.recurring ? " /mês" : "";
  const orgName = org?.legal_name || org?.name || "";
  const client = deal?.company_name ?? deal?.contact_name ?? "";
  let sec = 0;
  const next = () => String(++sec).padStart(2, "0");

  return (
    <div className="min-h-screen bg-[#E8E8ED] py-8 print:bg-white print:py-0">
      <style>{`
        @page { size: A4; margin: 18mm 18mm 16mm; }
        @media print {
          .no-print { display: none !important }
          body { background: #fff }
          .sheet { break-after: page; }
          .sheet:last-child { break-after: auto; }
          .cover { margin: -18mm -18mm -16mm !important; padding: 22mm 20mm !important; min-height: 297mm !important; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
        .sheet + .sheet { margin-top: 24px; }
        @media print { .sheet + .sheet { margin-top: 0 } }
      `}</style>
      <div className="no-print mx-auto mb-4 flex max-w-[210mm] justify-between px-4">
        <a href={`/crm/${p.deal_id}/proposta/${p.id}`} className="btn-ghost">‹ Editar</a>
        <PrintButton />
      </div>

      {/* Capa */}
      <Page className="cover justify-between !px-[20mm] !py-[22mm] text-white" style={{ background: `linear-gradient(160deg, ${accent} 0%, #0B1220 100%)` }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 text-sm font-bold backdrop-blur">{(org?.name ?? "").slice(0, 2).toUpperCase()}</div>
            <span className="text-[15px] font-semibold">{orgName}</span>
          </div>
          <span className="text-xs uppercase tracking-[1.5px] text-white/70">Proposta {p.number}</span>
        </div>
        <div className="flex flex-col gap-5">
          <span className="text-xs uppercase tracking-[2px] text-white/70">Proposta de serviços{client ? ` · ${client}` : ""}</span>
          <h1 className="max-w-[150mm] text-[44px] font-bold leading-[1.05] tracking-[-1.4px]">{p.title}</h1>
          {p.intro && <p className="max-w-[130mm] text-[15px] leading-relaxed text-white/85">{p.intro}</p>}
        </div>
        <div className="grid grid-cols-3 gap-6 border-t border-white/20 pt-6 text-xs">
          <div><div className="text-white/60 uppercase tracking-[1px] mb-1">Para</div><div className="font-semibold text-sm">{client || "—"}</div>{deal?.contact_name && deal.contact_name !== client && <div className="text-white/80">{deal.contact_name}</div>}</div>
          <div><div className="text-white/60 uppercase tracking-[1px] mb-1">Preparado por</div><div className="font-semibold text-sm">{org?.signature_name || ctx.name}</div>{org?.signature_role && <div className="text-white/80">{org.signature_role}</div>}</div>
          <div><div className="text-white/60 uppercase tracking-[1px] mb-1">Data</div><div className="font-semibold text-sm">{longDate(p.created_at)}</div>{p.valid_until && <div className="text-white/80">Válida até {longDate(p.valid_until)}</div>}</div>
        </div>
      </Page>

      {/* Contexto e objetivos */}
      {(p.context || objectives.length > 0) && (
        <Page>
          {p.context && (<>
            <Heading n={next()} accent={accent}>O vosso contexto</Heading>
            <div className="mb-10 flex flex-col gap-3 text-[14px] text-ink-2">{lines(p.context).map((l, i) => <p key={i}>{l}</p>)}</div>
          </>)}
          {objectives.length > 0 && (<>
            <Heading n={next()} accent={accent}>Objetivos</Heading>
            <ol className="flex flex-col gap-3">
              {objectives.map((o, i) => (
                <li key={i} className="flex items-start gap-4 rounded-2xl bg-[#F7F7F9] px-5 py-4 text-[14px]">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: accent }}>{i + 1}</span>
                  <span className="pt-0.5">{o}</span>
                </li>
              ))}
            </ol>
          </>)}
          <Footer org={orgName} number={p.number} />
        </Page>
      )}

      {/* Abordagem e cronograma */}
      {phases.length > 0 && (
        <Page>
          <Heading n={next()} accent={accent}>A nossa abordagem</Heading>
          <ol className="relative flex flex-col gap-6 pl-10">
            <span aria-hidden="true" className="absolute left-[13px] top-2 bottom-2 w-px" style={{ background: `${accent}55` }} />
            {phases.map((f, i) => (
              <li key={i} className="relative">
                <span className="absolute -left-10 flex h-7 w-7 items-center justify-center rounded-full border-2 bg-white text-xs font-bold" style={{ borderColor: accent, color: accent }}>{i + 1}</span>
                <div className="flex flex-wrap items-baseline gap-x-3">
                  <h3 className="text-[16px] font-semibold">{f.nome}</h3>
                  {f.duracao && <span className="text-xs font-medium uppercase tracking-[0.8px] text-muted">{f.duracao}</span>}
                </div>
                {f.descricao && <p className="mt-1 text-ink-2">{f.descricao}</p>}
              </li>
            ))}
          </ol>
          {phases.some((f) => f.duracao) && (
            <div className="mt-10">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.8px] text-muted">Cronograma</h3>
              <div className="flex overflow-hidden rounded-xl">
                {phases.map((f, i) => (
                  <div key={i} className="flex-1 px-3 py-3 text-white" style={{ background: accent, opacity: 1 - i * (0.55 / Math.max(1, phases.length - 1)) }}>
                    <div className="text-[11px] font-semibold leading-tight">{f.nome}</div>
                    <div className="text-[10px] text-white/85">{f.duracao}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <Footer org={orgName} number={p.number} />
        </Page>
      )}

      {/* Investimento */}
      <Page>
        <Heading n={next()} accent={accent}>Investimento</Heading>
        <table className="w-full border-collapse">
          <thead><tr className="border-b-2 border-ink text-left text-[11px] uppercase tracking-[0.6px] text-muted">
            <th className="py-2 font-medium">Serviço</th><th className="py-2 text-right font-medium w-14">Qtd.</th><th className="py-2 text-right font-medium w-28">Preço</th><th className="py-2 text-right font-medium w-32">Total</th></tr></thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i} className="border-b border-line align-top">
                <td className="py-3.5 pr-4 text-[14px]">{it.descricao}</td><td className="py-3.5 text-right">{it.qtd}</td>
                <td className="py-3.5 text-right whitespace-nowrap">{eur2(it.preco)}</td><td className="py-3.5 text-right whitespace-nowrap font-medium">{eur2(it.qtd * it.preco)}{per}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="ml-auto mt-6 flex w-80 flex-col gap-2 rounded-2xl bg-[#F7F7F9] p-5">
          <div className="flex justify-between"><span className="text-muted">Subtotal</span><span>{eur2(p.total)}{per}</span></div>
          <div className="flex justify-between"><span className="text-muted">IVA ({Number(p.vat_rate)}%)</span><span>{eur2(vat)}{per}</span></div>
          <div className="flex justify-between border-t border-line pt-3 text-lg font-bold"><span>Total</span><span style={{ color: accent }}>{eur2(Number(p.total) + vat)}{per}</span></div>
          {p.recurring && deal?.duration_months && <div className="text-right text-xs text-muted">{deal.duration_months} meses · {eur2(Number(p.total) * deal.duration_months)} + IVA no período</div>}
        </div>
        {p.terms && (
          <div className="mt-10">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.8px] text-muted">Condições</h3>
            <div className="flex flex-col gap-2 text-ink-2">{lines(p.terms).map((l, i) => <p key={i}>{l}</p>)}</div>
          </div>
        )}
        <Footer org={orgName} number={p.number} />
      </Page>

      {/* Sobre, próximos passos e aceitação */}
      <Page>
        {p.show_about && org?.about && (<>
          <Heading n={next()} accent={accent}>Sobre {org.signature_name ? "mim" : "nós"}</Heading>
          <div className="mb-8 flex flex-col gap-3 text-[14px] text-ink-2">{lines(org.about).map((l, i) => <p key={i}>{l}</p>)}</div>
          {testimonials.length > 0 && (
            <div className="mb-10 grid grid-cols-2 gap-4">
              {testimonials.slice(0, 4).map((t: string, i: number) => {
                const [quote, author] = t.split(/\s[—–-]\s(?=[^—–-]+$)/);
                return (
                  <figure key={i} className="rounded-2xl border border-line p-4">
                    <blockquote className="text-[13px] italic text-ink-2">“{quote}”</blockquote>
                    {author && <figcaption className="mt-2 text-xs font-semibold">{author}</figcaption>}
                  </figure>
                );
              })}
            </div>
          )}
        </>)}
        {steps.length > 0 && (<>
          <Heading n={next()} accent={accent}>Próximos passos</Heading>
          <ol className="mb-10 flex flex-col gap-2.5">
            {steps.map((s, i) => <li key={i} className="flex gap-3 text-[14px]"><span className="font-semibold" style={{ color: accent }}>{i + 1}.</span><span>{s}</span></li>)}
          </ol>
        </>)}
        <div className="mt-auto grid grid-cols-2 gap-10 pt-6">
          <div><div className="mb-12 text-xs uppercase tracking-[0.8px] text-muted">Pelo cliente — aceito a proposta</div><div className="border-t border-ink pt-2 text-xs">{client || "Nome"} · Data</div></div>
          <div><div className="mb-12 text-xs uppercase tracking-[0.8px] text-muted">Por {orgName}</div><div className="border-t border-ink pt-2 text-xs">{org?.signature_name || ctx.name}{org?.signature_role ? ` · ${org.signature_role}` : ""}</div></div>
        </div>
        <div className="mt-8 flex flex-wrap justify-between gap-4 border-t border-line pt-4 text-[11px] text-muted">
          <span>{[orgName, org?.nif && `NIF ${org.nif}`, org?.address].filter(Boolean).join(" · ")}</span>
          <span>{[org?.email, org?.phone, org?.website].filter(Boolean).join(" · ")}{org?.iban ? ` · IBAN ${org.iban}` : ""}</span>
        </div>
      </Page>
    </div>
  );
}
