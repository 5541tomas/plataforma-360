"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function RevNav() {
  const path = usePathname();
  const tabs = [{ href: "/revisao", label: "Semanal" }, { href: "/revisao/mensal", label: "Mensal · roda da vida" }];
  return (
    <nav aria-label="Revisões" className="-mb-2 flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((t) => {
        const on = t.href === "/revisao" ? path === "/revisao" : path.startsWith(t.href);
        return <Link key={t.href} href={t.href} aria-current={on ? "page" : undefined} className={`whitespace-nowrap border-b-2 px-3 pb-2.5 pt-1 text-sm ${on ? "border-accent font-semibold text-ink" : "border-transparent text-muted hover:text-ink"}`}>{t.label}</Link>;
      })}
    </nav>
  );
}
