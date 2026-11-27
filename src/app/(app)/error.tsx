"use client";
import { useEffect } from "react";
import Link from "next/link";

/** Depois de uma atualização, páginas abertas há muito tempo podem chamar ações que já não existem: recarrega sozinha. */
const isStale = (m?: string) => !!m && (/Server Action .* was not found/i.test(m) || /failed-to-find-server-action/i.test(m) || /Loading chunk .* failed/i.test(m));

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const stale = isStale(error.message);
  useEffect(() => {
    if (!stale) return;
    try { if (sessionStorage.getItem("p360-reloaded") === location.pathname) return; sessionStorage.setItem("p360-reloaded", location.pathname); } catch { /* sem armazenamento */ }
    location.reload();
  }, [stale]);
  if (stale) return (
    <div className="card mx-auto mt-10 flex max-w-[480px] flex-col items-center gap-3 text-center" role="status">
      <h1 className="text-xl font-semibold">A plataforma foi atualizada</h1>
      <p className="text-sm text-muted">A carregar a versão mais recente… Se não acontecer nada, recarrega a página.</p>
      <button onClick={() => location.reload()} className="btn">Recarregar</button>
    </div>
  );
  return (
    <div className="card mx-auto mt-10 flex max-w-[480px] flex-col items-center gap-3 text-center" role="alert">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-warn-soft text-xl text-warn">!</div>
      <h1 className="text-xl font-semibold">Algo correu mal</h1>
      <p className="text-sm text-muted">{error.message && !error.message.includes("Server Components") ? error.message : "Não foi possível concluir esta ação. Tenta novamente — se continuar, recarrega a página."}</p>
      <div className="flex gap-2"><button onClick={reset} className="btn">Tentar novamente</button><Link href="/" className="btn-ghost">Ir para Hoje</Link></div>
      {error.digest && <p className="text-[11px] text-muted">Referência: {error.digest}</p>}
    </div>
  );
}
