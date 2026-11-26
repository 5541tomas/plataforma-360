"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/crm", label: "Pipeline" },
  { href: "/crm/contactos", label: "Contactos" },
  { href: "/crm/empresas", label: "Empresas" },
  { href: "/crm/produtos", label: "Produtos" },
  { href: "/crm/automacoes", label: "Automações" },
  { href: "/crm/lead-magnets", label: "Lead magnets" },
  { href: "/crm/relatorios", label: "Relatórios" },
];

export function CrmNav() {
  const path = usePathname();
  const active = (h: string) => (h === "/crm" ? path === "/crm" || /^\/crm\/[0-9a-f-]{36}/.test(path) : path.startsWith(h));
  return (
    <nav aria-label="CRM" className="-mb-2 flex gap-1 overflow-x-auto border-b border-line">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} aria-current={active(t.href) ? "page" : undefined}
          className={`whitespace-nowrap border-b-2 px-3 pb-2.5 pt-1 text-sm ${active(t.href) ? "border-accent font-semibold text-ink" : "border-transparent text-muted hover:text-ink"}`}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
