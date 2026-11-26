import { signIn, signUp } from "./actions";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ modo?: string; erro?: string; info?: string }> }) {
  const sp = await searchParams;
  const registo = sp.modo === "registo";
  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-[400px] flex flex-col gap-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent text-base font-bold text-white">360</div>
          <h1 className="text-[28px] font-bold tracking-[-0.6px]">{registo ? "Criar conta" : "Bem-vindo de volta"}</h1>
          <p className="text-sm text-muted">Objetivos, finanças e clientes. Tudo ligado.</p>
        </div>
        <form action={registo ? signUp : signIn} className="card flex flex-col gap-4">
          {registo && (
            <label className="flex flex-col gap-1.5"><span className="label">Nome</span><input name="name" className="input" required autoComplete="name" /></label>
          )}
          <label className="flex flex-col gap-1.5"><span className="label">Email</span><input name="email" type="email" className="input" required autoComplete="email" /></label>
          <label className="flex flex-col gap-1.5"><span className="label">Palavra-passe</span><input name="password" type="password" minLength={8} className="input" required autoComplete={registo ? "new-password" : "current-password"} /></label>
          {sp.erro && <p role="alert" className="text-sm text-warn">{sp.erro}</p>}
          {sp.info && <p className="text-sm text-good">{sp.info}</p>}
          <button className="btn w-full">{registo ? "Criar conta" : "Entrar"}</button>
        </form>
        <p className="text-center text-sm text-muted">
          {registo ? <>Já tens conta? <a className="text-accent-ink font-medium" href="/login">Entrar</a></> : <>Ainda não tens conta? <a className="text-accent-ink font-medium" href="/login?modo=registo">Criar conta</a></>}
        </p>
      </div>
    </main>
  );
}
