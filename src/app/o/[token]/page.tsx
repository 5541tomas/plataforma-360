import { notFound } from "next/navigation";
import { anonClient } from "@/lib/supabase/anon";
import { NoirShell } from "@/components/noir/Noir";
import { submitTestimonial } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Como correu?", robots: { index: false } };
type T = { name: string | null; company: string | null; role: string | null; status: string; product: string | null; author: string; org: string };

export default async function TestimonialPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ ok?: string; erro?: string }> }) {
  const { token } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(token)) notFound();
  const { data } = await anonClient().rpc("public_testimonial", { p_token: token });
  const t = data as T | null;
  if (!t) notFound();
  const first = (t.name ?? "").split(" ")[0];
  const me = t.author.split(" ")[0];
  const done = sp.ok || t.status === "submitted" || t.status === "approved";
  return (
    <NoirShell l={{ brand: t.author.toUpperCase(), edition: "O TEU TESTEMUNHO" }}>
      <section className="nr-hero nr-pad"><div className="nr-wrap nr-hero-copy nophoto" style={{ paddingTop: 30 }}>
        <p className="nr-eyebrow nr-kicker">{done ? "OBRIGADO" : "1 MINUTO"}</p>
        {done ? (<>
          <h1 className="nr-h1">OBRIGADO,<br /><span className="nr-accent">{first.toLowerCase() || "a sério"}.</span></h1>
          <p className="nr-lead">Recebi o teu testemunho. Significa muito — é assim que outros freelancers chegam até mim. Um abraço, {me}.</p>
        </>) : (<>
          <h1 className="nr-h1">COMO<br /><span className="nr-accent">correu?</span></h1>
          <p className="nr-lead">{first ? `${first}, ` : ""}duas ou três frases chegam. Diz como estavas antes, o que mudou e o que dirias a quem está a pensar trabalhar comigo.</p>
          <form action={submitTestimonial} className="nr-card" style={{ display: "flex", flexDirection: "column", gap: 22 }}>
            {sp.erro && <p className="nr-err" role="alert">{sp.erro}</p>}
            <input type="hidden" name="token" value={token} />
            <div aria-hidden="true" style={{ position: "absolute", left: -9999 }}><label>Site <input name="website" tabIndex={-1} autoComplete="off" /></label></div>
            <fieldset style={{ border: 0, padding: 0, margin: 0 }}><legend className="nr-field" style={{ marginBottom: 10 }}>De 1 a 5, como avalias?</legend>
              <div style={{ display: "flex", gap: 8 }}>{[1, 2, 3, 4, 5].map((n) => <label key={n} style={{ flex: 1 }}><input type="radio" name="rating" value={n} defaultChecked={n === 5} className="sr-only peer" /><span className="nr-opt" style={{ justifyContent: "center", margin: 0 }}>{n} ★</span></label>)}</div>
            </fieldset>
            <label className="nr-field">O teu testemunho<textarea name="text" required minLength={15} rows={5} placeholder="Antes de trabalhar com o Thomas… Hoje…" style={{ background: "transparent", border: "1px solid #444", color: "#fff", fontSize: 16, fontFamily: "inherit", padding: 12, letterSpacing: 0, textTransform: "none", fontWeight: 400 }} /></label>
            <div className="nr-fields">
              <label className="nr-field">Nome<input name="name" defaultValue={t.name ?? ""} autoComplete="name" /></label>
              <label className="nr-field">Função<input name="role" defaultValue={t.role ?? ""} placeholder="Fundador, Designer…" /></label>
              <label className="nr-field">Empresa<input name="company" defaultValue={t.company ?? ""} autoComplete="organization" /></label>
            </div>
            <label className="nr-check" style={{ margin: 0 }}><input type="checkbox" name="permission" defaultChecked /><span>Autorizo que o {me} publique este testemunho com o meu nome, função e empresa (site, propostas e redes sociais).</span></label>
            <button className="nr-cta"><span>ENVIAR</span><span className="arw">→</span></button>
          </form>
        </>)}
      </div></section>
    </NoirShell>
  );
}
