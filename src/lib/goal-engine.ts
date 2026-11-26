import type { createClient } from "@/lib/supabase/server";
type DB = Awaited<ReturnType<typeof createClient>>;

export type GoalSettings = { win_rate?: number; lead_to_proposal?: number; capacity_hours_week?: number; weeks_off?: number };
export const DEFAULTS = { win_rate: 35, lead_to_proposal: 50, capacity_hours_week: 25, weeks_off: 6 };

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
/** Associa nomes de produtos e de KRs ao mesmo "tipo" (programa, tarde, 1:1, imersão, continuidade) */
export const productKey = (n: string) => {
  const x = norm(n);
  return x.includes("8 sess") || x.includes("programa") ? "programa" : x.includes("tarde") ? "tarde" : x.includes("1:1") ? "1:1"
    : x.includes("imers") ? "imersao" : x.includes("continuidade") || x.includes("avenca") ? "continuidade" : x;
};

export async function goalEngine(supabase: DB, orgId: string, yearParam?: number) {
  const now = new Date();
  const [{ data: org }, { data: goals }, { data: krs }, { data: deals }, { data: products }, { data: sentActs }] = await Promise.all([
    supabase.from("organizations").select("settings").eq("id", orgId).single(),
    supabase.from("goals").select("id, title, horizon, period_start, status").eq("org_id", orgId).in("horizon", ["year", "quarter"]).neq("status", "dropped"),
    supabase.from("v_key_results").select("goal_id, label, unit, target_value, computed_value, source, source_config").eq("org_id", orgId),
    supabase.from("v_deals").select("id, status, kind, value, quantity, total_value, weighted_value, created_at, won_at, expected_close, product_id, product_name, stage_position, source").eq("org_id", orgId),
    supabase.from("products").select("id, name, price, kind, duration_months, hours_per_unit").eq("org_id", orgId).eq("active", true),
    supabase.from("activities").select("deal_id, occurred_at").eq("org_id", orgId).like("summary", "Proposta enviada%"),
  ]);
  const settings: GoalSettings = { ...DEFAULTS, ...((org?.settings as { goal?: GoalSettings })?.goal ?? {}) };

  // Ano: o pedido, senão o ano com objetivo anual mais próximo (atual ou seguinte)
  const yearsWithGoal = (goals ?? []).filter((g) => g.horizon === "year").map((g) => new Date(g.period_start).getFullYear());
  const year = yearParam ?? (yearsWithGoal.includes(now.getFullYear()) ? now.getFullYear() : yearsWithGoal.find((y) => y > now.getFullYear()) ?? now.getFullYear());
  const annual = (goals ?? []).find((g) => g.horizon === "year" && new Date(g.period_start).getFullYear() === year);
  const annualKrs = (krs ?? []).filter((k) => k.goal_id === annual?.id);
  const revenueKr = annualKrs.find((k) => k.source === "finance_income") ?? annualKrs.find((k) => k.unit === "€");
  const target = Number(revenueKr?.target_value ?? 0);
  const invoiced = Number(revenueKr?.source === "finance_income" ? revenueKr.computed_value : 0);

  const inYear = (s?: string | null) => !!s && new Date(s).getFullYear() === year;
  const all = deals ?? [];
  const won = all.filter((d) => d.status === "won" && inYear(d.won_at));
  const sold = won.reduce((s, d) => s + Number(d.total_value), 0);
  const openDeals = all.filter((d) => d.status === "open");
  const pipelineYear = openDeals.filter((d) => !d.expected_close || inYear(d.expected_close) || new Date(d.expected_close) < new Date(`${year}-01-01`)).reduce((s, d) => s + Number(d.weighted_value), 0);

  // Taxas reais (com mínimo de dados), senão as definidas
  const closed12 = all.filter((d) => d.status !== "open" && new Date(d.won_at ?? d.created_at) > new Date(Date.now() - 365 * 864e5));
  const wonN = closed12.filter((d) => d.status === "won").length;
  const realWin = closed12.length >= 5 ? Math.round((wonN / closed12.length) * 100) : null;
  const winRate = realWin ?? settings.win_rate!;
  const created12 = all.filter((d) => new Date(d.created_at) > new Date(Date.now() - 365 * 864e5));
  const reachedProposal = created12.filter((d) => (d.stage_position ?? 0) >= 2 || d.status === "won").length;
  const realL2P = created12.length >= 8 ? Math.round((reachedProposal / created12.length) * 100) : null;
  const l2p = realL2P ?? settings.lead_to_proposal!;

  // Ticket médio: real (12 meses) → mix do plano (KRs × preços) → média dos produtos
  const prodByKey = new Map((products ?? []).map((p) => [productKey(p.name), p]));
  // Vendas consultivas (precisam de proposta): avenças e produtos ≥ 1000 €. As restantes (1:1, imersão…) são vendas diretas.
  const isConsultive = (p: { kind: string; price: number }) => p.kind === "retainer" || Number(p.price) >= 1000;
  const planMix = annualKrs.map((k) => ({ k, p: prodByKey.get(productKey(k.label)) })).filter((x) => x.p && x.k.unit !== "€");
  const value = (x: (typeof planMix)[number]) => Number(x.p!.price) * Number(x.k.target_value);
  const units = (x: (typeof planMix)[number]) => (x.p!.kind === "retainer" ? 1 : Number(x.k.target_value));
  const cons = planMix.filter((x) => isConsultive(x.p!));
  const planValue = cons.reduce((s, x) => s + value(x), 0);
  const planCount = cons.reduce((s, x) => s + units(x), 0);
  const planTotal = planMix.reduce((s, x) => s + value(x), 0);
  const consultiveShare = planTotal ? planValue / planTotal : 1;
  const wonLast = all.filter((d) => d.status === "won" && d.won_at && new Date(d.won_at) > new Date(Date.now() - 365 * 864e5));
  const realTicket = wonLast.length >= 3 ? wonLast.reduce((s, d) => s + Number(d.total_value), 0) / wonLast.length : null;
  const ticket = realTicket ?? (planCount ? planValue / planCount : (products?.length ? (products ?? []).reduce((s, p) => s + Number(p.price), 0) / products.length : 1000));

  // Tempo
  const yStart = new Date(`${year}-01-01T00:00:00`), yEnd = new Date(`${year + 1}-01-01T00:00:00`);
  const started = now > yStart;
  const elapsed = Math.min(1, Math.max(0, (now.getTime() - yStart.getTime()) / (yEnd.getTime() - yStart.getTime())));
  const weeksLeft = Math.max(1, Math.ceil(((started ? yEnd.getTime() - now.getTime() : yEnd.getTime() - yStart.getTime()) / (7 * 864e5)) - (started ? settings.weeks_off! * (1 - elapsed) : settings.weeks_off!)));
  const monthsLeft = Math.max(1, started ? 12 - now.getMonth() : 12);

  const remaining = Math.max(0, target - sold);
  const gap = Math.max(0, remaining - pipelineYear);
  const winsNeeded = Math.ceil((gap * consultiveShare) / Math.max(1, ticket));
  const proposalsNeeded = Math.ceil(winsNeeded / Math.max(0.01, winRate / 100));
  const convNeeded = Math.ceil(proposalsNeeded / Math.max(0.01, l2p / 100));
  const per = (n: number, d: number) => Math.ceil((n / d) * 10) / 10;

  // Atividade atual
  const weekStart = new Date(now); weekStart.setHours(0, 0, 0, 0); weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const sentWeek = new Set((sentActs ?? []).filter((a) => new Date(a.occurred_at) >= weekStart).map((a) => a.deal_id)).size;
  const sentMonth = new Set((sentActs ?? []).filter((a) => new Date(a.occurred_at) >= monthStart).map((a) => a.deal_id)).size;
  const newWeek = all.filter((d) => new Date(d.created_at) >= weekStart).length;
  const newMonth = all.filter((d) => new Date(d.created_at) >= monthStart).length;
  const winsWeek = all.filter((d) => d.status === "won" && d.won_at && new Date(d.won_at) >= weekStart).length;
  // Vendido acumulado mês a mês (para o gráfico)
  const soldByMonth = Array.from({ length: 12 }, (_, m) => won.filter((d) => new Date(d.won_at!).getMonth() <= m).reduce((a, d) => a + Number(d.total_value), 0));

  // Ritmo: quanto devia estar vendido hoje (pelos objetivos trimestrais, se existirem)
  const quarters = (goals ?? []).filter((g) => g.horizon === "quarter" && new Date(g.period_start).getFullYear() === year)
    .sort((a, b) => a.period_start.localeCompare(b.period_start))
    .map((g) => {
      const k = (krs ?? []).find((x) => x.goal_id === g.id && (x.source === "finance_income" || x.unit === "€"));
      const qs = new Date(g.period_start), qe = new Date(qs); qe.setMonth(qe.getMonth() + 3);
      const qSold = won.filter((d) => new Date(d.won_at!) >= qs && new Date(d.won_at!) < qe).reduce((s, d) => s + Number(d.total_value), 0);
      return { title: g.title, start: g.period_start, target: Number(k?.target_value ?? 0), sold: qSold, invoiced: Number(k?.source === "finance_income" ? k.computed_value : 0), current: now >= qs && now < qe, past: now >= qe };
    });
  let expectedNow = target * elapsed;
  if (quarters.length === 4 && started) {
    expectedNow = quarters.reduce((s, q) => {
      const qs = new Date(q.start), qe = new Date(qs); qe.setMonth(qe.getMonth() + 3);
      const f = Math.min(1, Math.max(0, (now.getTime() - qs.getTime()) / (qe.getTime() - qs.getTime())));
      return s + q.target * f;
    }, 0);
  }
  const pace = started ? sold - expectedNow : 0;
  // Projeção para dezembro: ao ritmo atual (a partir de ~15% do ano); antes disso, vendido + pipeline ponderado
  const projection = !started ? pipelineYear : elapsed >= 0.15 ? Math.max(sold + pipelineYear * 0.5, sold / elapsed) : sold + pipelineYear;

  // Mix de produtos: vendido vs plano
  const soldByKey = new Map<string, number>();
  won.forEach((d) => { if (!d.product_name) return; const k = productKey(d.product_name); soldByKey.set(k, (soldByKey.get(k) ?? 0) + (d.kind === "retainer" ? Number(d.quantity) : Number(d.quantity))); });
  const mix = annualKrs.filter((k) => k.unit !== "€").map((k) => {
    const key = productKey(k.label), p = prodByKey.get(key);
    const soldQ = soldByKey.get(key) ?? 0;
    return { label: k.label, target: Number(k.target_value), sold: soldQ, left: Math.max(0, Number(k.target_value) - soldQ), unitPrice: p ? Number(p.price) : null, hours: p ? Number(p.hours_per_unit) : 0, kind: p?.kind };
  });

  const alerts: { tone: "warn" | "good" | "info"; text: string }[] = [];
  if (!annual) alerts.push({ tone: "info", text: `Não há objetivo anual para ${year}. Cria um em Objetivos com um KR de faturação.` });
  if (started && pace < -0.05 * target) alerts.push({ tone: "warn", text: `Estás ${Math.round(-pace).toLocaleString("pt-PT")} € abaixo do ritmo necessário.` });
  if (started && pace > 0.05 * target) alerts.push({ tone: "good", text: `Estás ${Math.round(pace).toLocaleString("pt-PT")} € acima do ritmo. Excelente.` });
  if (per(proposalsNeeded, weeksLeft) > sentWeek && started) alerts.push({ tone: "warn", text: `Esta semana precisas de ${Math.ceil(per(proposalsNeeded, weeksLeft))} proposta(s) enviada(s); vais com ${sentWeek}.` });
  if (openDeals.filter((d) => !d.expected_close).length) alerts.push({ tone: "info", text: `${openDeals.filter((d) => !d.expected_close).length} negócio(s) sem data de fecho — a previsão fica menos fiável.` });
  if (realWin === null) alerts.push({ tone: "info", text: `Ainda com poucos negócios fechados: uso uma taxa de ganho de ${winRate}% (podes ajustar).` });

  return {
    year, years: [...new Set([...yearsWithGoal, now.getFullYear()])].sort(), annualTitle: annual?.title ?? null,
    target, sold, invoiced, remaining, pipelineYear, gap, ticket, ticketSource: realTicket ? "real" : planCount ? "plano" : "produtos",
    winRate, winSource: realWin === null ? "definida" : "real", l2p, l2pSource: realL2P === null ? "definida" : "real",
    winsNeeded, proposalsNeeded, convNeeded, consultiveShare, directGap: gap * (1 - consultiveShare), weeksLeft, monthsLeft, started, elapsed, expectedNow, pace,
    perWeek: { wins: per(winsNeeded, weeksLeft), proposals: per(proposalsNeeded, weeksLeft), conversations: per(convNeeded, weeksLeft) },
    perMonth: { wins: per(winsNeeded, monthsLeft), proposals: per(proposalsNeeded, monthsLeft), conversations: per(convNeeded, monthsLeft) },
    actual: { sentWeek, sentMonth, newWeek, newMonth, winsWeek },
    soldByMonth, projection,
    quarters, mix, alerts, settings,
  };
}
