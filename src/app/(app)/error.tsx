"use client";
import Link from "next/link";
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
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
