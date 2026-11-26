"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/financas", label: "Movimentos" },
  { href: "/financas/dividas", label: "Dívidas" },
  { href: "/financas/impostos", label: "Impostos e salário" },
  { href: "/financas/importar", label: "Importar extrato" },
];

export function FinNav() {
  const path = usePathname();
  const active = (h: string) => (h === "/financas" ? path === "/financas" : path.startsWith(h));
  return (
    <nav aria-label="Finanças" className="-mb-2 flex gap-1 overflow-x-auto border-b border-line">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} aria-current={active(t.href) ? "page" : undefined}
          className={`whitespace-nowrap border-b-2 px-3 pb-2.5 pt-1 text-sm ${active(t.href) ? "border-accent font-semibold text-ink" : "border-transparent text-muted hover:text-ink"}`}>{t.label}</Link>
      ))}
    </nav>
  );
}
