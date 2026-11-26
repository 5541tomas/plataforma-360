import Link from "next/link";
export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="card flex max-w-[420px] flex-col items-center gap-3 text-center">
        <div className="text-[44px] font-bold tracking-[-1px] text-accent">404</div>
        <h1 className="text-xl font-semibold">Página não encontrada</h1>
        <p className="text-sm text-muted">O link pode estar errado ou a página já não existe.</p>
        <Link href="/" className="btn">Voltar ao início</Link>
      </div>
    </main>
  );
}
