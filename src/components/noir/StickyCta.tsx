"use client";
import { useEffect, useState } from "react";

/** Barra fixa no fundo (só telemóvel): aparece quando o formulário sai do ecrã. */
export function StickyCta({ target, label }: { target: string; label: string }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = document.querySelector(target);
    if (!el) return;
    const io = new IntersectionObserver(([e]) => { setOn(!e.isIntersecting && window.scrollY > 300); }, { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, [target]);
  return (
    <div className={`nr-sticky ${on ? "on" : ""}`} aria-hidden={!on}>
      <a className="nr-cta" href={target} tabIndex={on ? 0 : -1} onClick={(e) => { e.preventDefault(); document.querySelector(target)?.scrollIntoView({ behavior: "smooth", block: "center" }); setTimeout(() => (document.querySelector(`${target} input:not([type=hidden])`) as HTMLInputElement | null)?.focus({ preventScroll: true }), 500); }}>
        <span>{label}</span><span className="arw">↑</span>
      </a>
    </div>
  );
}
