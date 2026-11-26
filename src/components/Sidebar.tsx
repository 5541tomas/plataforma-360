"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
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
  { href: "/revisao", label: "Revisões", icon: "review" },
  { href: "/assistente", label: "Assistente IA", icon: "ai" },
];


const more = { href: "/mais", label: "Mais" };
const tabs = ["/", "/meta", "/crm", "/financas"];

export function Sidebar({ orgName, userName, perms }: { orgName: string; userName: string; perms: Record<Module, Access> }) {
  const path = usePathname();
  const [sheet, setSheet] = useState(false);
  useEffect(() => setSheet(false), [path]);
  const visible = items.filter((i) => !i.module || perms[i.module] !== "none");
  const isActive = (h: string) => (h === "/" ? path === "/" : path.startsWith(h));
  const search = () => window.dispatchEvent(new Event("open-palette"));
  const Icon = ({ k, size = 18 }: { k: keyof typeof icons; size?: number }) => <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">{icons[k]}</svg>;
  const tabItems = visible.filter((i) => tabs.includes(i.href));
  const sheetItems = visible.filter((i) => !tabs.includes(i.href));
  const moreActive = sheetItems.some((i) => isActive(i.href)) || path.startsWith("/definicoes");

  return (
    <>
      {/* Computador: barra lateral */}
      <nav aria-label="Navegação principal" className="hidden md:flex flex-col gap-6 border-r border-line bg-white/70 backdrop-blur px-4 py-7 w-[240px] min-h-screen sticky top-0 h-screen">
        <div className="flex items-center gap-2.5 px-2">
          <div className="flex h-[34px] w-[34px] items-center justify-center rounded-[10px] bg-accent text-[13px] font-bold text-white">360</div>
          <div className="min-w-0">
            <div className="text-[15px] font-semibold tracking-[-0.2px] truncate">{orgName}</div>
            <div className="text-xs text-muted truncate">{userName}</div>
          </div>
        </div>
        <button onClick={search} className="flex items-center gap-2 rounded-[10px] border border-line bg-white px-3 py-2 text-left text-sm text-muted hover:border-[#D2D2D7]">
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
          <span className="flex-1">Pesquisar</span><kbd className="rounded-md bg-[#F2F2F5] px-1.5 text-[11px] font-medium">⌘K</kbd>
        </button>
        <ul className="flex flex-col gap-1">
          {visible.map((i) => (
            <li key={i.href}>
              <Link href={i.href} aria-current={isActive(i.href) ? "page" : undefined}
                className={`flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-sm whitespace-nowrap ${isActive(i.href) ? "bg-white font-semibold text-ink shadow-[0_1px_2px_rgba(0,0,0,0.05)]" : "text-ink-2 hover:bg-white/60"}`}>
                <Icon k={i.icon} />{i.label}
              </Link>
            </li>
          ))}
        </ul>
        <div className="mt-auto flex flex-col gap-1">
          <Link href="/definicoes" aria-current={path.startsWith("/definicoes") ? "page" : undefined}
            className={`rounded-[10px] px-3 py-2.5 text-sm ${path.startsWith("/definicoes") ? "bg-white font-semibold" : "text-ink-2 hover:bg-white/60"}`}>Definições</Link>
          <form action="/auth/signout" method="post">
            <button className="w-full text-left rounded-[10px] px-3 py-2.5 text-sm text-muted hover:bg-white/60">Terminar sessão</button>
          </form>
        </div>
      </nav>

      {/* Telemóvel: barra superior */}
      <header className="md:hidden sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-[#F5F5F7]/85 px-4 pb-2.5 pt-[max(10px,env(safe-area-inset-top))] backdrop-blur-xl">
        <div className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-accent text-[11px] font-bold text-white">360</div>
        <div className="min-w-0 flex-1 truncate text-[15px] font-semibold">{orgName}</div>
        <button onClick={search} aria-label="Pesquisar" className="flex h-10 w-10 items-center justify-center rounded-full text-ink-2 hover:bg-white">
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
        </button>
      </header>

      {/* Telemóvel: barra de separadores inferior */}
      <nav aria-label="Navegação principal" className="md:hidden fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl">
        <ul className="grid" style={{ gridTemplateColumns: `repeat(${tabItems.length + 1}, minmax(0, 1fr))` }}>
          {tabItems.map((i) => (
            <li key={i.href}>
              <Link href={i.href} aria-current={isActive(i.href) ? "page" : undefined} className={`flex min-h-[54px] flex-col items-center justify-center gap-0.5 text-[10.5px] font-medium ${isActive(i.href) ? "text-accent" : "text-muted"}`}>
                <Icon k={i.icon} size={22} />{i.label}
              </Link>
            </li>
          ))}
          <li>
            <button onClick={() => setSheet(true)} aria-expanded={sheet} className={`flex min-h-[54px] w-full flex-col items-center justify-center gap-0.5 text-[10.5px] font-medium ${moreActive ? "text-accent" : "text-muted"}`}>
              <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>{more.label}
            </button>
          </li>
        </ul>
      </nav>
      {sheet && (
        <div className="md:hidden fixed inset-0 z-50 flex items-end bg-black/30" onClick={() => setSheet(false)}>
          <div role="dialog" aria-label="Mais" className="w-full rounded-t-[22px] bg-[#F5F5F7] px-4 pb-[max(20px,env(safe-area-inset-bottom))] pt-2.5" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-[#D2D2D7]" />
            <div className="mb-3 px-1 text-xs text-muted">{userName}</div>
            <ul className="flex flex-col overflow-hidden rounded-2xl bg-white">
              {sheetItems.map((i) => (
                <li key={i.href} className="border-b border-[#F0F0F2] last:border-0"><Link href={i.href} className="flex min-h-[50px] items-center gap-3 px-4 text-[15px]"><Icon k={i.icon} size={20} />{i.label}</Link></li>
              ))}
              <li className="border-b border-[#F0F0F2]"><Link href="/definicoes" className="flex min-h-[50px] items-center gap-3 px-4 text-[15px]"><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" /></svg>Definições</Link></li>
              <li><form action="/auth/signout" method="post"><button className="flex min-h-[50px] w-full items-center px-4 text-left text-[15px] text-warn">Terminar sessão</button></form></li>
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
