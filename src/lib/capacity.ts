import type { createClient } from "@/lib/supabase/server";
import { productKey, DEFAULTS, type GoalSettings } from "@/lib/goal-engine";
type DB = Awaited<ReturnType<typeof createClient>>;

/** Horas de entrega planeadas por trimestre (a partir dos KRs trimestrais) vs capacidade, e €/hora por produto e cliente */
export async function capacityAndProfit(supabase: DB, orgId: string, year: number) {
  const [{ data: org }, { data: products }, { data: goals }, { data: krs }, { data: won }] = await Promise.all([
    supabase.from("organizations").select("settings").eq("id", orgId).single(),
    supabase.from("products").select("id, name, kind, price, hours_per_unit, duration_months").eq("org_id", orgId).eq("active", true).order("position"),
    supabase.from("goals").select("id, title, period_start, horizon").eq("org_id", orgId).eq("horizon", "quarter"),
    supabase.from("key_results").select("goal_id, label, unit, target_value").eq("org_id", orgId),
    supabase.from("v_deals").select("company_name, total_value, quantity, product_hours, kind, duration_months, won_at").eq("org_id", orgId).eq("status", "won"),
  ]);
  const s: GoalSettings = { ...DEFAULTS, ...((org?.settings as { goal?: GoalSettings })?.goal ?? {}) };
  const cap = s.capacity_hours_week!;
  const byKey = new Map((products ?? []).map((p) => [productKey(p.name), p]));
  const quarters = (goals ?? []).filter((g) => new Date(g.period_start).getFullYear() === year).sort((a, b) => a.period_start.localeCompare(b.period_start)).map((g) => {
    const lines = (krs ?? []).filter((k) => k.goal_id === g.id && k.unit !== "€").map((k) => {
      const p = byKey.get(productKey(k.label));
      const hours = p ? Number(p.hours_per_unit) * Number(k.target_value) * (p.kind === "retainer" ? 1 : 1) : 0;
      return { label: k.label, qty: Number(k.target_value), hours };
    }).filter((l) => l.hours > 0);
    const total = lines.reduce((a, l) => a + l.hours, 0);
    const weeks = 13 - s.weeks_off! / 4;
    return { title: g.title.split(":")[0], lines, total, perWeek: total / weeks, cap, load: total / weeks / cap };
  });
  const profit = (products ?? []).filter((p) => Number(p.hours_per_unit) > 0).map((p) => ({
    name: p.name, kind: p.kind, price: Number(p.price), hours: Number(p.hours_per_unit), perHour: Number(p.price) / Number(p.hours_per_unit),
  })).sort((a, b) => b.perHour - a.perHour);
  const avg = profit.length ? profit.reduce((a, x) => a + x.perHour, 0) / profit.length : 0;
  const clients = new Map<string, { value: number; hours: number }>();
  (won ?? []).forEach((d) => {
    if (!d.company_name || !d.product_hours) return;
    const c = clients.get(d.company_name) ?? { value: 0, hours: 0 };
    c.value += Number(d.total_value);
    c.hours += Number(d.product_hours) * (d.kind === "retainer" ? Number(d.duration_months) : Number(d.quantity));
    clients.set(d.company_name, c);
  });
  return {
    cap, quarters, profit, avgPerHour: avg,
    clients: [...clients.entries()].map(([name, c]) => ({ name, ...c, perHour: c.hours ? c.value / c.hours : 0 })).sort((a, b) => b.value - a.value).slice(0, 8),
  };
}
