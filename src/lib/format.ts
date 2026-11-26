const eurFmt = new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const eurFmt2 = new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR", minimumFractionDigits: 2 });

export const eur = (n: number | string | null | undefined) => eurFmt.format(Number(n ?? 0));
export const eur2 = (n: number | string | null | undefined) => eurFmt2.format(Number(n ?? 0));
export const pct = (n: number) => `${Math.round(Math.max(0, Math.min(100, n)))}%`;
export const today = () => new Date().toISOString().slice(0, 10);
export const dateLong = (d = new Date()) =>
  d.toLocaleDateString("pt-PT", { weekday: "long", day: "numeric", month: "long" });
export const dateShort = (s: string) =>
  new Date(s).toLocaleDateString("pt-PT", { day: "numeric", month: "short" });

/** Progresso de um KR entre valor inicial e alvo, 0–100 */
export function krProgress(start: number, target: number, value: number) {
  const span = Number(target) - Number(start);
  if (span === 0) return Number(value) >= Number(target) ? 100 : 0;
  return Math.max(0, Math.min(100, ((Number(value) - Number(start)) / span) * 100));
}
