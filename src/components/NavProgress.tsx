"use client";
import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/** Barra fina no topo enquanto a próxima página carrega (feedback imediato ao clicar). */
export function NavProgress() {
  const path = usePathname(), search = useSearchParams();
  const [on, setOn] = useState(false);
  useEffect(() => { setOn(false); }, [path, search]);
  useEffect(() => {
    const click = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement).closest("a");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || (url.pathname === location.pathname && url.search === location.search)) return;
      setOn(true);
    };
    document.addEventListener("click", click, true);
    const t = on ? setTimeout(() => setOn(false), 12000) : undefined;
    return () => { document.removeEventListener("click", click, true); if (t) clearTimeout(t); };
  }, [on]);
  return <div aria-hidden="true" className={`pointer-events-none fixed inset-x-0 top-0 z-[70] h-[3px] origin-left bg-accent transition-[transform,opacity] ease-out ${on ? "scale-x-[0.85] opacity-100 duration-[2500ms]" : "scale-x-100 opacity-0 duration-300"}`} />;
}
