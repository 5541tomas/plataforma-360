import { normalizeDescription } from "@/lib/categorize";

export type Sub = { pattern: string; label: string; monthly: number; annual: number; months: number; last: string; looksCancelled: boolean };

/** Deteta pagamentos que se repetem todos os meses com valor estável */
export function detectSubscriptions(tx: { date: string; description: string; amount: number }[]): Sub[] {
  const groups = new Map<string, { label: string; rows: { date: string; amount: number }[] }>();
  for (const t of tx) {
    if (t.amount >= 0) continue;
    const p = normalizeDescription(t.description);
    if (p.length < 3) continue;
    const g = groups.get(p) ?? { label: t.description, rows: [] };
    g.rows.push({ date: t.date, amount: -Number(t.amount) });
    groups.set(p, g);
  }
  const subs: Sub[] = [];
  for (const [pattern, g] of groups) {
    const months = new Set(g.rows.map((r) => r.date.slice(0, 7)));
    if (months.size < 3 && !(months.size === 2 && g.rows.length === 2)) continue;
    if (g.rows.length > months.size * 1.5) continue; // muitas compras no mesmo mês = não é subscrição (ex.: supermercado)
    const amounts = g.rows.map((r) => r.amount);
    const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const sd = Math.sqrt(amounts.reduce((a, b) => a + (b - mean) ** 2, 0) / amounts.length);
    if (mean <= 0 || sd / mean > 0.2) continue;
    const last = g.rows.map((r) => r.date).sort().pop()!;
    subs.push({ pattern, label: g.label.replace(/\s+/g, " ").trim(), monthly: Math.round(mean * 100) / 100, annual: Math.round(mean * 12), months: months.size, last,
      looksCancelled: (Date.now() - new Date(last).getTime()) / 864e5 > 45 });
  }
  return subs.sort((a, b) => b.monthly - a.monthly);
}
