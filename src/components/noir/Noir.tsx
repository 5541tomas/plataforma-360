import { Fragment } from "react";
import { Playfair_Display, Poppins } from "next/font/google";
import type { Landing, Rich } from "@/lib/landing";

const sans = Poppins({ subsets: ["latin"], weight: ["300", "400", "500", "600", "700", "800", "900"], variable: "--nr-sans", display: "swap" });
const serif = Playfair_Display({ subsets: ["latin"], weight: ["700", "800"], style: ["normal", "italic"], variable: "--nr-serif", display: "swap" });

/** **negrito** e *destaque dourado* */
export function R({ t }: { t: Rich }) {
  return <>{t.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).map((p, i) => p.startsWith("**") ? <b key={i} className="nr-b">{p.slice(2, -2)}</b> : p.startsWith("*") && p.endsWith("*") && p.length > 2 ? <em key={i} className="nr-em">{p.slice(1, -1)}</em> : <Fragment key={i}>{p}</Fragment>)}</>;
}

const CSS = `
.nr{--bg:#080808;--panel:#0E0E0E;--line:#262626;--gold:#C9A55C;--gold2:#E6C47E;--txt:#E8E8E8;--soft:#CFCFCF;--muted:#8A8A8A;--dim:#6B6B6B;
  font-family:var(--nr-sans),Poppins,"Helvetica Neue",Arial,sans-serif;color:var(--txt);background:var(--bg);min-height:100vh;overflow-x:clip;font-variant-numeric:lining-nums;-webkit-font-smoothing:antialiased}
.nr *{box-sizing:border-box}
.nr a{color:var(--gold)} .nr a:hover{color:var(--gold2)}
.nr-serif{font-family:var(--nr-serif),"Playfair Display",Georgia,serif}
.nr-b{color:#fff;font-weight:600} .nr-em{color:var(--gold);font-style:italic}
.nr-wrap{max-width:1320px;margin:0 auto}
.nr-pad{padding-left:max(28px,env(safe-area-inset-left,0px));padding-right:max(28px,env(safe-area-inset-right,0px))}
.nr-eyebrow{margin:0;font-size:12px;font-weight:600;letter-spacing:4px;color:var(--gold);text-transform:uppercase}
.nr-head{padding-top:24px;padding-bottom:24px;position:relative;z-index:5}
.nr-head .nr-wrap{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px}
.nr-logo{font-weight:800;font-size:15px;letter-spacing:4px;color:#fff}
.nr-ed{font-size:11px;letter-spacing:3px;color:var(--muted);font-weight:500}
.nr-hero{position:relative;padding-top:24px}
.nr-hero-img{position:absolute;top:-90px;right:0;width:min(54%,720px);height:980px;object-fit:cover;object-position:50% 8%;opacity:.92}
.nr-hero-shade{position:absolute;top:-90px;right:0;width:min(54%,720px);height:980px;background:linear-gradient(to right,#080808 0%,rgba(8,8,8,.55) 30%,rgba(8,8,8,0) 60%),linear-gradient(to top,#080808 0%,rgba(8,8,8,0) 45%)}
.nr-hero-copy{position:relative;z-index:2;padding:40px 0 110px}
.nr-kicker{display:inline-flex;gap:14px;align-items:center;margin-bottom:30px}
.nr-kicker:before{content:"";width:48px;height:1px;background:var(--gold)}
.nr-h1{margin:0;font-weight:900;font-size:clamp(3.4rem,10.5vw,9.4rem);line-height:.86;letter-spacing:-.04em;color:#fff;max-width:980px;text-wrap:balance}
.nr-h1 .nr-accent{font-family:var(--nr-serif),Georgia,serif;font-style:italic;font-weight:800;letter-spacing:-.02em;color:var(--gold)}
.nr-lead{margin:34px 0 0;font-size:clamp(1.1rem,1.8vw,1.4rem);line-height:1.55;color:var(--soft);max-width:560px}
.nr-card{margin-top:48px;max-width:620px;background:rgba(14,14,14,.86);border:1px solid var(--line);padding:30px 30px 26px;backdrop-filter:blur(6px)}
.nr-fields{display:flex;flex-wrap:wrap;gap:22px 26px}
.nr-field{flex:1 1 220px;min-width:0;display:flex;flex-direction:column;gap:6px;font-size:10.5px;font-weight:600;letter-spacing:2.5px;color:var(--muted);text-transform:uppercase}
.nr-field input,.nr-field select{height:48px;padding:0;background:transparent;border:none;border-bottom:1px solid #444;color:#fff;font-size:18px;font-weight:500;letter-spacing:0;font-family:inherit;width:100%;border-radius:0;outline:none}
.nr-field input:focus,.nr-field select:focus{border-bottom-color:var(--gold)}
.nr-field input::placeholder{color:#5E5E5E}
.nr-field option{color:#111}
.nr-check{display:flex;gap:12px;align-items:flex-start;margin:22px 0 20px;font-size:12.5px;line-height:1.55;color:#9A9A9A;cursor:pointer}
.nr-check input{width:20px;height:20px;margin:1px 0 0;accent-color:var(--gold);flex:none}
.nr-cta{display:flex;width:100%;align-items:center;justify-content:space-between;min-height:64px;padding:0 26px;background:var(--gold);color:#080808 !important;font-weight:800;font-size:14px;letter-spacing:2px;text-decoration:none;border:0;cursor:pointer;font-family:inherit;transition:background .2s ease,letter-spacing .25s ease}
.nr-cta:hover{background:#fff;letter-spacing:3px}
.nr-cta[aria-disabled=true],.nr-cta:disabled{background:#1E1E1E;color:#707070 !important;cursor:not-allowed;letter-spacing:2px}
.nr-cta .arw{font-size:22px}
.nr-hint{margin:12px 0 0;font-size:12px;color:var(--gold)}
.nr-note{margin:14px 0 0;font-size:12px;color:#7A7A7A}
.nr-err{margin:0 0 16px;font-size:13px;color:#FF9C8A}
.nr-ticker{background:var(--gold);padding:18px 0;overflow:hidden}
.nr-ticker-row{display:flex;width:max-content;font-weight:800;font-size:clamp(1rem,1.8vw,1.35rem);letter-spacing:1px;color:#080808;white-space:nowrap;animation:nrtick 38s linear infinite}
.nr-ticker-row span{padding-right:40px}
@keyframes nrtick{from{transform:translateX(0)}to{transform:translateX(-50%)}}
.nr-honest{padding-top:140px;padding-bottom:120px}
.nr-honest .lines{display:flex;flex-direction:column;gap:10px;font-family:var(--nr-serif),Georgia,serif;font-weight:800;font-size:clamp(2.1rem,5.6vw,4.8rem);line-height:1.05;letter-spacing:-.01em;margin-top:40px}
.nr-honest .lines p{margin:0} .nr-honest .g{color:var(--dim)} .nr-honest .w{color:#fff} .nr-honest .lines p.sp{margin-top:34px}
.nr-after{margin:56px 0 0;font-size:1.15rem;line-height:1.7;color:#A6A6A6;max-width:620px}
.nr-list{padding-bottom:130px}
.nr-list-head{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:flex-end;gap:24px;padding-bottom:36px;border-bottom:1px solid var(--line)}
.nr-h2{margin:0;font-weight:900;font-size:clamp(2.4rem,6vw,5.2rem);line-height:.92;letter-spacing:-.03em;color:#fff}
.nr-h2 .nr-accent{font-family:var(--nr-serif),Georgia,serif;font-style:italic;font-weight:800;letter-spacing:-.01em;color:var(--gold)}
.nr-list-intro{margin:0;max-width:360px;font-size:.98rem;line-height:1.65;color:var(--muted)}
.nr-sin{display:flex;flex-wrap:wrap;align-items:center;gap:16px 40px;padding:30px 12px;border-bottom:1px solid var(--line);transition:background .25s ease}
.nr-sin:hover{background:#121212}
.nr-sin .num{font-weight:900;font-size:clamp(3rem,6vw,4.6rem);line-height:1;color:transparent;-webkit-text-stroke:1.5px var(--gold);min-width:120px}
.nr-sin:hover .num{color:var(--gold);-webkit-text-stroke:0}
.nr-sin .t{flex:1 1 320px;font-family:var(--nr-serif),Georgia,serif;font-weight:700;font-size:clamp(1.4rem,2.6vw,2.1rem);line-height:1.2;color:#fff}
.nr-sin .d{flex:1 1 260px;font-size:.98rem;line-height:1.6;color:#9A9A9A}
.nr-sin.ok .num{-webkit-text-stroke-color:#3A3A3A} .nr-sin.ok .t{color:#5A5A5A;text-decoration:line-through;text-decoration-thickness:2px}
.nr-deliv{padding-top:120px;padding-bottom:140px;background:var(--panel);border-top:1px solid #1C1C1C;border-bottom:1px solid #1C1C1C}
.nr-deliv .nr-wrap{display:flex;flex-wrap:wrap;gap:64px;align-items:center}
.nr-deliv h2{margin:22px 0 24px;font-family:var(--nr-serif),Georgia,serif;font-weight:800;font-size:clamp(2.4rem,4.8vw,4rem);line-height:1.02;color:#fff}
.nr-deliv ul{list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:14px;font-size:1.02rem;color:var(--soft)}
.nr-deliv li{display:flex;gap:14px} .nr-deliv li:before{content:"—";color:var(--gold);font-weight:800}
.nr-pages{flex:999 1 520px;min-width:0;display:flex;justify-content:center;padding:30px 0}
.nr-pages img{width:34%;box-shadow:0 30px 60px rgba(0,0,0,.75);position:relative;transition:transform .35s ease}
.nr-pages img:nth-child(1){transform:rotate(-9deg) translateX(30px);z-index:1}
.nr-pages img:nth-child(2){transform:rotate(-2deg) translateY(-24px);z-index:3}
.nr-pages img:nth-child(3){transform:rotate(7deg) translateX(-30px);z-index:2}
.nr-pages img:hover{transform:rotate(0) translateY(-10px) scale(1.03);z-index:5}
.nr-about .nr-wrap{display:flex;flex-wrap:wrap;align-items:stretch}
.nr-about-photo{flex:1 1 420px;min-width:0;position:relative;min-height:640px}
.nr-about-photo img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:50% 20%;filter:grayscale(1) contrast(1.05)}
.nr-about-photo:after{content:"";position:absolute;inset:0;background:linear-gradient(to right,rgba(8,8,8,0) 60%,#080808 100%),linear-gradient(to top,#080808 0%,rgba(8,8,8,0) 30%)}
.nr-about-copy{flex:1 1 480px;min-width:0;padding:110px 28px 110px 56px;display:flex;flex-direction:column;justify-content:center}
.nr-about h2{margin:22px 0 30px;font-weight:900;font-size:clamp(2.6rem,6vw,5rem);line-height:.92;letter-spacing:-.03em;color:#fff}
.nr-about p{margin:0 0 18px;font-size:1.05rem;line-height:1.75;color:#BDBDBD;max-width:560px}
.nr-quote{margin-top:22px;font-family:var(--nr-serif),Georgia,serif;font-style:italic;font-weight:700;font-size:clamp(1.6rem,3vw,2.4rem);line-height:1.2;color:#fff}
.nr-quote span{color:var(--gold);display:block}
.nr-final{padding-top:140px;padding-bottom:140px}
.nr-final h2{margin:0 0 56px;font-weight:900;font-size:clamp(3rem,9vw,7.5rem);line-height:.9;letter-spacing:-.04em;color:#fff;text-align:center}
.nr-final h2 span{font-family:var(--nr-serif),Georgia,serif;font-style:italic;color:var(--gold)}
.nr-ab{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px;max-width:980px;margin:0 auto}
.nr-a{border:1px solid var(--line);padding:34px}
.nr-a h3{margin:14px 0 12px;font-family:var(--nr-serif),Georgia,serif;font-size:1.6rem;color:#5A5A5A;text-decoration:line-through}
.nr-a p{margin:0;color:#6E6E6E;line-height:1.6}
.nr-b-opt{background:var(--gold);padding:34px;display:flex;flex-direction:column;justify-content:space-between;gap:26px;color:#080808 !important;text-decoration:none;transition:transform .25s ease}
.nr-b-opt:hover{transform:translateY(-4px)}
.nr-b-opt h3{margin:14px 0 0;font-family:var(--nr-serif),Georgia,serif;font-style:italic;font-size:clamp(1.5rem,2.4vw,2rem);line-height:1.15;color:#080808}
.nr-b-opt .nr-eyebrow{color:#080808}
.nr-b-opt .go{display:flex;justify-content:space-between;font-weight:800;letter-spacing:2px;font-size:13px}
.nr-foot{border-top:1px solid #1C1C1C;padding-top:28px;padding-bottom:calc(28px + env(safe-area-inset-bottom,0px));font-size:12px;color:#5E5E5E}
.nr-foot .nr-wrap{display:flex;flex-wrap:wrap;justify-content:space-between;gap:12px}
.nr-priv{display:none;position:fixed;inset:0;z-index:100;background:#080808;overflow-y:auto;padding:28px 24px 80px}
.nr-priv:target{display:block}
.nr-priv-in{max-width:760px;margin:0 auto;color:#BDBDBD;line-height:1.75}
.nr-priv h2{font-weight:900;font-size:clamp(2.2rem,6vw,4rem);line-height:.95;letter-spacing:-.03em;color:#fff;margin:24px 0}
.nr-priv h3{color:#fff;font-size:1.05rem;margin:28px 0 8px}
.nr-priv ul{padding-left:20px}
/* Teste e resultados */
.nr-q-meta{display:flex;justify-content:space-between;font-size:11px;font-weight:600;letter-spacing:2.5px;color:var(--muted);text-transform:uppercase}
.nr-q-bar{height:2px;background:#262626;margin:12px 0 24px}
.nr-q-bar i{display:block;height:100%;background:var(--gold);transition:width .3s ease}
.nr-q-title{margin:0 0 22px;font-family:var(--nr-serif),Georgia,serif;font-weight:700;font-size:clamp(1.5rem,3vw,2.1rem);line-height:1.2;color:#fff;text-wrap:balance}
.nr-opt{display:flex;width:100%;gap:16px;align-items:center;text-align:left;padding:16px 18px;margin-bottom:10px;background:transparent;border:1px solid #333;color:var(--soft);font-family:inherit;font-size:15.5px;line-height:1.4;cursor:pointer;transition:border-color .2s,background .2s}
.nr-opt:hover{border-color:var(--gold);background:#121212}
.peer:checked+.nr-opt{border-color:var(--gold);background:rgba(201,165,92,.12);color:#fff}
.peer:focus-visible+.nr-opt{outline:2px solid var(--gold);outline-offset:2px}
.nr-opt[aria-checked=true]{border-color:var(--gold);background:rgba(201,165,92,.12);color:#fff}
.nr-opt .k{font-weight:800;color:var(--gold);min-width:18px}
.nr-back{background:none;border:0;color:var(--muted);font-family:inherit;font-size:13px;cursor:pointer;padding:8px 0}
.nr-back:hover{color:#fff}
.nr-stats{display:flex;gap:34px;margin:6px 0 24px}
.nr-stats b{display:block;font-size:2.2rem;font-weight:900;color:#fff;line-height:1}
.nr-stats span{font-size:11px;letter-spacing:2px;color:var(--muted);text-transform:uppercase}
.nr-score{font-weight:900;font-size:clamp(6rem,22vw,16rem);line-height:.8;letter-spacing:-.06em;color:#fff}
.nr-score small{font-size:.28em;color:var(--gold);letter-spacing:-.02em;font-family:var(--nr-serif),Georgia,serif;font-style:italic}
.nr-chip{display:inline-block;padding:7px 14px;border:1px solid var(--gold);color:var(--gold);font-size:11px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase}
.nr-ghost{display:flex;width:100%;align-items:center;justify-content:space-between;min-height:58px;padding:0 24px;border:1px solid #444;color:#fff !important;font-weight:700;font-size:13px;letter-spacing:2px;text-decoration:none;transition:border-color .2s}
.nr-ghost:hover{border-color:var(--gold)}
@media (max-width:760px){
  .nr-hero-img{position:relative;top:auto;right:auto;display:block;width:calc(100% + 56px);height:440px;margin:-24px 0 0 -28px;object-position:50% 12%}
  .nr-hero-shade{top:0;left:0;width:100%;height:440px;background:linear-gradient(to top,#080808 0%,rgba(8,8,8,.55) 38%,rgba(8,8,8,0) 70%)}
  .nr-hero-copy{margin-top:-150px;padding-top:0;padding-bottom:80px}
  .nr-hero-copy.nophoto{margin-top:0;padding-top:24px !important}
  .nr-card{padding:24px 20px 22px;margin-top:36px}
  .nr-honest{padding-top:90px;padding-bottom:80px}
  .nr-deliv{padding-top:80px;padding-bottom:90px}
  .nr-pages img{width:40%}
  .nr-about-photo{min-height:420px;flex-basis:100%}
  .nr-about-copy{padding:40px 28px 80px}
  .nr-final{padding-top:90px;padding-bottom:90px}
  .nr-ab{grid-template-columns:minmax(0,1fr)}
  .nr-sin{padding:24px 4px}
  .nr-sin .num{min-width:0}
}
.nr [hidden]{display:none !important}
/* Capa 3D do guia */
.nr-hero-grid{display:flex;flex-wrap:wrap;align-items:flex-end;gap:40px}
.nr-hero-grid>.nr-card{flex:1 1 420px}
.nr-book-wrap{flex:0 0 auto;perspective:1400px;padding:10px 20px 0}
.nr-book{position:relative;width:200px;height:278px;transform-style:preserve-3d;transform:rotateY(-28deg) rotateX(6deg);transition:transform .6s cubic-bezier(.2,.7,.2,1);animation:nrfloat 6s ease-in-out infinite}
.nr-book-wrap:hover .nr-book{transform:rotateY(-8deg) rotateX(2deg)}
.nr-book .fr{position:absolute;inset:0;background:linear-gradient(160deg,#151515 0%,#0A0A0A 60%,#1A1407 100%);border:1px solid #3A3022;padding:22px 18px;display:flex;flex-direction:column;justify-content:space-between;transform:translateZ(14px);box-shadow:inset 4px 0 0 rgba(255,255,255,.04)}
.nr-book .fr:before{content:"";position:absolute;inset:10px;border:1px solid rgba(201,165,92,.35);pointer-events:none}
.nr-book .sp{position:absolute;top:0;left:0;width:28px;height:100%;background:linear-gradient(90deg,#8A6F38,#C9A55C 55%,#6E5629);transform:rotateY(-90deg) translateZ(0) translateX(-14px);transform-origin:left}
.nr-book .pg{position:absolute;top:4px;right:0;width:26px;height:calc(100% - 8px);background:repeating-linear-gradient(90deg,#EDE8DD 0 1px,#D8D2C4 1px 2px);transform:rotateY(90deg) translateZ(186px) translateX(13px)}
.nr-book .sh{position:absolute;left:10%;right:-10%;bottom:-36px;height:30px;background:radial-gradient(ellipse at center,rgba(0,0,0,.7),rgba(0,0,0,0) 70%);transform:translateZ(-30px) rotateX(90deg)}
.nr-book .k{font-size:9px;letter-spacing:3px;color:var(--gold);font-weight:700}
.nr-book .t{font-weight:900;font-size:27px;line-height:.95;color:#fff;letter-spacing:-.02em}
.nr-book .t em{display:block;font-family:var(--nr-serif),Georgia,serif;font-style:italic;color:var(--gold);font-weight:800}
.nr-book .a{font-size:9px;letter-spacing:2.5px;color:#9A9A9A;font-weight:600}
@keyframes nrfloat{0%,100%{translate:0 0}50%{translate:0 -8px}}
/* Prova social */
.nr-proof{margin-top:34px;max-width:980px;display:flex;flex-direction:column;gap:18px}
.nr-proof-count{font-size:12px;letter-spacing:2.5px;color:var(--muted);text-transform:uppercase;font-weight:600}
.nr-proof-count b{color:var(--gold);font-size:15px}
.nr-proof-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px}
.nr-t{border-left:2px solid var(--gold);padding:4px 0 4px 18px}
.nr-t p{margin:0 0 10px;font-family:var(--nr-serif),Georgia,serif;font-style:italic;font-size:1.02rem;line-height:1.45;color:#E8E8E8}
.nr-t span{font-size:11px;letter-spacing:1.5px;color:var(--muted);text-transform:uppercase;font-weight:600}
/* Barra fixa no telemóvel */
.nr-sticky{position:fixed;left:0;right:0;bottom:0;z-index:60;padding:10px 14px calc(10px + env(safe-area-inset-bottom,0px));background:rgba(8,8,8,.92);backdrop-filter:blur(10px);border-top:1px solid var(--line);transform:translateY(110%);transition:transform .3s ease;display:none}
.nr-sticky.on{transform:none}
.nr-sticky .nr-cta{min-height:54px}
@media (max-width:760px){
  .nr-sticky{display:block}
  .nr-hero-grid{flex-direction:column-reverse;align-items:stretch;gap:0}
  .nr-book-wrap{align-self:center;padding:34px 0 0}
  .nr-book{width:150px;height:208px}
  .nr-book .pg{transform:rotateY(90deg) translateZ(136px) translateX(13px)}
  .nr-book .t{font-size:20px}
}
@media (prefers-reduced-motion:reduce){.nr-book{animation:none}.nr-sticky{transition:none}}
@media (prefers-reduced-motion:reduce){.nr-ticker-row{animation:none}.nr-cta,.nr-pages img,.nr-b-opt{transition:none}}
`;

export function NoirShell({ l, children }: { l: Pick<Landing, "brand" | "edition" | "privacy">; children: React.ReactNode }) {
  const year = new Date().getFullYear();
  return (
    <div className={`nr ${sans.variable} ${serif.variable}`}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <header className="nr-head nr-pad"><div className="nr-wrap"><span className="nr-logo">{l.brand}<span style={{ color: "var(--gold)" }}>.</span></span>{l.edition && <span className="nr-ed">{l.edition}</span>}</div></header>
      {children}
      <footer className="nr-foot nr-pad"><div className="nr-wrap"><span>© {year} {l.brand.replace(/\b(\w)(\w*)/g, (_m, a: string, b: string) => a + b.toLowerCase())} · Estratégia &amp; Crescimento</span><span>Os teus dados servem só para te enviar o que pediste e conteúdos relacionados. · <a href="#privacidade">Política de privacidade</a></span></div></footer>
      {l.privacy && <Privacy p={l.privacy} />}
    </div>
  );
}

export function NoirHero({ h, children }: { h: Landing["hero"]; children?: React.ReactNode }) {
  return (
    <section className="nr-hero nr-pad">
      {h.photo && <><img className="nr-hero-img" src={h.photo} alt="" /><div className="nr-hero-shade" /></>}
      <div className="nr-wrap nr-hero-copy">
        <p className="nr-eyebrow nr-kicker">{h.eyebrow}</p>
        <h1 className="nr-h1">{h.lines.map((x, i) => <Fragment key={i}>{x}<br /></Fragment>)}<span className="nr-accent">{h.accent}</span></h1>
        <p className="nr-lead"><R t={h.lead} /></p>
        {children}
      </div>
    </section>
  );
}

export function NoirTicker({ items }: { items: string[] }) {
  const row = items.join(" ✦ ") + " ✦";
  return <div className="nr-ticker" aria-hidden="true"><div className="nr-ticker-row"><span>{row}</span><span>{row}</span></div></div>;
}

export function NoirHonest({ h }: { h: NonNullable<Landing["honest"]> }) {
  return (
    <section className="nr-honest nr-pad"><div className="nr-wrap" style={{ maxWidth: 1200 }}>
      <p className="nr-eyebrow">{h.eyebrow}</p>
      <div className="lines">{h.pairs.map(([g, w], i) => <Fragment key={i}><p className={`g ${i ? "sp" : ""}`}>{g}</p><p className="w"><R t={w} /></p></Fragment>)}</div>
      {h.after && <p className="nr-after">{h.after}</p>}
    </div></section>
  );
}

export function NoirList({ l, ok }: { l: NonNullable<Landing["list"]>; ok?: boolean[] }) {
  return (
    <section className="nr-list nr-pad"><div className="nr-wrap">
      <div className="nr-list-head"><h2 className="nr-h2">{l.title}<br /><span className="nr-accent">{l.accent}</span></h2>{l.intro && <p className="nr-list-intro">{l.intro}</p>}</div>
      {l.items.map((it, i) => (
        <div key={i} className={`nr-sin ${ok?.[i] ? "ok" : ""}`}><span className="num">{String(i + 1).padStart(2, "0")}</span><span className="t">{it.t}</span><span className="d">{it.d}</span></div>
      ))}
    </div></section>
  );
}

export function NoirDeliverables({ d }: { d: NonNullable<Landing["deliverables"]> }) {
  return (
    <section className="nr-deliv nr-pad"><div className="nr-wrap">
      <div style={{ flex: "1 1 360px", minWidth: 0 }}>
        <p className="nr-eyebrow">{d.eyebrow}</p>
        <h2>{d.title}<br /><em className="nr-em">{d.accent}</em></h2>
        <ul>{d.items.map((x) => <li key={x}>{x}</li>)}</ul>
      </div>
      {d.images && d.images.length > 0 && <div className="nr-pages">{d.images.map((im) => <img key={im.src} src={im.src} alt={im.alt} />)}</div>}
    </div></section>
  );
}

export function NoirAbout({ a }: { a: NonNullable<Landing["about"]> }) {
  return (
    <section className="nr-about"><div className="nr-wrap">
      {a.photo && <div className="nr-about-photo"><img src={a.photo} alt={`${a.first} ${a.last}`} /></div>}
      <div className="nr-about-copy">
        <p className="nr-eyebrow">{a.eyebrow}</p>
        <h2>{a.first}<br /><span className="nr-serif" style={{ fontStyle: "italic", color: "var(--gold)", fontWeight: 800 }}>{a.last}</span></h2>
        {a.paragraphs.map((p, i) => <p key={i}><R t={p} /></p>)}
        {a.quote && <div className="nr-quote">{a.quote[0]}<span>{a.quote[1]}</span></div>}
      </div>
    </div></section>
  );
}

export function NoirFinal({ f, href }: { f: NonNullable<Landing["final"]>; href: string }) {
  return (
    <section className="nr-final nr-pad"><div className="nr-wrap">
      <h2>{f.title}<span>?</span></h2>
      <div className="nr-ab">
        <div className="nr-a"><p className="nr-eyebrow" style={{ color: "#5A5A5A" }}>OPÇÃO A</p><h3>{f.a_title}</h3><p>{f.a_text}</p></div>
        <a className="nr-b-opt" href={href}><div><p className="nr-eyebrow">OPÇÃO B</p><h3>{f.b_title}</h3></div><span className="go"><span>{f.cta}</span><span>→</span></span></a>
      </div>
    </div></section>
  );
}

function Privacy({ p }: { p: NonNullable<Landing["privacy"]> }) {
  return (
    <div id="privacidade" className="nr-priv" role="dialog" aria-label="Política de privacidade"><div className="nr-priv-in">
      <a href="#" style={{ fontWeight: 700, letterSpacing: 2, fontSize: 12, textDecoration: "none" }}>← VOLTAR</a>
      <p className="nr-eyebrow" style={{ marginTop: 30 }}>RGPD</p>
      <h2>POLÍTICA DE<br /><span className="nr-serif" style={{ fontStyle: "italic", color: "var(--gold)" }}>privacidade.</span></h2>
      <p>Última atualização: {p.updated}</p>
      <h3>Quem trata os teus dados</h3>
      <p>O responsável pelo tratamento é {p.controller}. Para qualquer questão sobre os teus dados: <a href={`mailto:${p.email}`}>{p.email}</a>.</p>
      <h3>Que dados recolhemos</h3>
      <ul><li>O nome, o email, o número de WhatsApp e a área de atividade que escreves no formulário.</li><li>As respostas ao teste, quando o fazes, e a pontuação calculada.</li><li>O conteúdo das mensagens que trocamos.</li></ul>
      <p>Estes dados ficam guardados na nossa ferramenta de gestão de clientes, alojada na União Europeia.</p>
      <h3>Para que os usamos</h3>
      <ul><li>Enviar-te o que pediste (o guia ou o resultado do teste).</li><li>Enviar-te, nos 10 dias seguintes, até 5 mensagens com conteúdos relacionados e o convite para uma conversa de diagnóstico.</li><li>Responder aos teus pedidos e marcar a conversa, se a pedires.</li></ul>
      <p>A base legal é o teu consentimento (artigo 6.º, n.º 1, alínea a) do RGPD) e, quando pedes uma conversa ou proposta, as diligências pré-contratuais que solicitas (alínea b).</p>
      <h3>Durante quanto tempo</h3>
      <p>Guardamos os teus dados enquanto mantiveres o consentimento. Se não houver qualquer interação durante 24 meses, são apagados. Se pedires para parar, deixamos de te enviar mensagens de imediato.</p>
      <h3>Com quem partilhamos</h3>
      <p>Não vendemos nem cedemos os teus dados. Recorremos apenas a fornecedores necessários para comunicar contigo e guardar a informação: o WhatsApp (Meta), o fornecedor de alojamento da plataforma e, se usado, o serviço de envio de email. Alguns destes fornecedores podem tratar dados fora do Espaço Económico Europeu, sempre com as garantias previstas no RGPD, como as cláusulas contratuais-tipo da Comissão Europeia.</p>
      <h3>Os teus direitos</h3>
      <p>Podes, a qualquer momento, pedir acesso, retificação, apagamento, limitação ou portabilidade dos teus dados, opor-te ao tratamento e retirar o consentimento, sem afetar o que foi feito antes. Basta responderes “PARAR” no WhatsApp ou escreveres para <a href={`mailto:${p.email}`}>{p.email}</a>. Se considerares que os teus direitos não foram respeitados, podes apresentar queixa à Comissão Nacional de Proteção de Dados (www.cnpd.pt).</p>
      <h3>Cookies</h3>
      <p>Esta página não usa cookies de publicidade nem ferramentas de rastreamento de terceiros.</p>
    </div></div>
  );
}

/** Capa do guia em 3D (só CSS) */
export function NoirBook({ title, author, kicker = "GUIA GRATUITO" }: { title: string; author: string; kicker?: string }) {
  const words = title.replace(/^os\s+/i, "").split(" ");
  const head = words.slice(0, Math.ceil(words.length / 2)).join(" "), tail = words.slice(Math.ceil(words.length / 2)).join(" ");
  return (
    <div className="nr-book-wrap" aria-hidden="true">
      <div className="nr-book"><div className="sp" /><div className="pg" /><div className="sh" />
        <div className="fr"><span className="k">{kicker}</span><span className="t">{head}<em>{tail}</em></span><span className="a">{author.toUpperCase()}</span></div>
      </div>
    </div>
  );
}

/** Testemunhos ("texto — autor", um por parágrafo) e contador real de pedidos */
export function NoirProof({ testimonials, count, label = "freelancers já pediram o guia", min = 25 }: { testimonials?: string | null; count?: number; label?: string; min?: number }) {
  const items = (testimonials ?? "").split(/\n\s*\n/).map((t) => t.trim()).filter(Boolean).slice(0, 3).map((t) => {
    const i = t.lastIndexOf(" — "); return i > 0 ? { q: t.slice(0, i).replace(/^["“]|["”]$/g, ""), a: t.slice(i + 3) } : { q: t, a: "" };
  });
  if (!items.length && (count ?? 0) < min) return null;
  return (
    <div className="nr-proof">
      {(count ?? 0) >= min && <p className="nr-proof-count"><b>{count}</b> {label}</p>}
      {items.length > 0 && <div className="nr-proof-list">{items.map((t, i) => <figure key={i} className="nr-t" style={{ margin: 0 }}><p>“{t.q}”</p>{t.a && <span>{t.a}</span>}</figure>)}</div>}
    </div>
  );
}
