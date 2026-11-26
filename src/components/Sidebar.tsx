"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Access, Module } from "@/lib/context";

const icons = {
  hoje: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  meta: <><path d="M4 20l5-6 4 3 7-9" /><path d="M15 8h5v5" /></>,
  review: <><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M8 12l3 3 5-6" /></>,
  goals: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.5" /></>,
  finance: <><rect x="3" y="6" width="18" height="13" rx="3" /><path d="M3 10h18M7 15h4" /></>,
  ai: <><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" /><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" /></>,
  crm: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5M16 4.5a3.5 3.5 0 010 7M18.5 14.8c1.6.8 2.6 2.6 3 5.2" /></>,
};

const items: { href: string; label: string; icon: keyof typeof icons; module?: Module }[] = [
  { href: "/", label: "Hoje", icon: "hoje" },
  { href: "/meta", label: "Meta", icon: "meta", module: "goals" },
  { href: "/objetivos", label: "Objetivos", icon: "goals", module: "goals" },
  { href: "/financas", label: "Finanças", icon: "finance", module: "finance" },
  { href: "/crm", label: "CRM", icon: "crm", module: "crm" },
  { href: "/revisao", label: "Revisão semanal", icon: "review" },
  { href: "/assistente", label: "Assistente IA", icon: "ai" },
];


export function Sidebar({ orgName, userName, perms }: { orgName: string; userName: string; perms: Record<Module, Access> }) {
  const path = usePathname();
  return (
    <nav aria-label="Navegação principal" className="flex flex-col gap-6 border-b md:border-b-0 md:border-r border-line bg-white/70 backdrop-blur px-4 py-5 md:py-7 md:w-[240px] md:min-h-screen md:sticky md:top-0">
      <div className="flex items-center gap-2.5 px-2">
        <div className="flex h-[34px] w-[34px] items-center justify-center rounded-[10px] bg-accent text-[13px] font-bold text-white">360</div>
        <div className="min-w-0">
          <div className="text-[15px] font-semibold tracking-[-0.2px] truncate">{orgName}</div>
          <div className="text-xs text-muted truncate">{userName}</div>
        </div>
      </div>
      <ul className="flex md:flex-col gap-1 overflow-x-auto">
        {items.filter((i) => !i.module || perms[i.module] !== "none").map((i) => {
          const active = i.href === "/" ? path === "/" : path.startsWith(i.href);
          return (
            <li key={i.href}>
              <Link href={i.href} aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-sm whitespace-nowrap ${active ? "bg-white font-semibold text-ink shadow-[0_1px_2px_rgba(0,0,0,0.05)]" : "text-ink-2 hover:bg-white/60"}`}>
                <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">{icons[i.icon]}</svg>
                {i.label}
              </Link>
            </li>
          );
        })}
        <li className="md:hidden"><Link href="/definicoes" className="flex items-center rounded-[10px] px-3 py-2.5 text-sm whitespace-nowrap text-ink-2">Definições</Link></li>
      </ul>
      <div className="hidden md:flex mt-auto flex-col gap-1">
      <Link href="/definicoes" aria-current={path.startsWith("/definicoes") ? "page" : undefined}
        className={`rounded-[10px] px-3 py-2.5 text-sm ${path.startsWith("/definicoes") ? "bg-white font-semibold" : "text-ink-2 hover:bg-white/60"}`}>Definições</Link>
      <form action="/auth/signout" method="post">
        <button className="w-full text-left rounded-[10px] px-3 py-2.5 text-sm text-muted hover:bg-white/60">Terminar sessão</button>
      </form>
      </div>
    </nav>
  );
}
