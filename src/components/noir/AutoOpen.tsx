"use client";
import { useEffect } from "react";
/** Abre o WhatsApp automaticamente uma vez (o botão fica como alternativa). */
export function AutoOpen({ href, id }: { href: string; id: string }) {
  useEffect(() => {
    try { if (sessionStorage.getItem("wa-" + id)) return; sessionStorage.setItem("wa-" + id, "1"); } catch { /* sem armazenamento: abre na mesma */ }
    const t = setTimeout(() => { window.location.href = href; }, 900);
    return () => clearTimeout(t);
  }, [href, id]);
  return null;
}
