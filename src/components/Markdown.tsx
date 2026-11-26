import { Fragment } from "react";
const inline = (t: string) => t.split(/(\*\*[^*]+\*\*)/g).map((p, i) => p.startsWith("**") && p.endsWith("**") ? <strong key={i} className="font-semibold text-ink">{p.slice(2, -2)}</strong> : <Fragment key={i}>{p}</Fragment>);
/** Markdown simples (## títulos, listas, citações, negrito) para ebooks. */
export function Markdown({ text }: { text: string }) {
  return (
    <>
      {text.split(/\n{2,}/).map((b, i) => {
        const lines = b.split("\n");
        if (b.startsWith("## ")) return <h2 key={i} className="mt-10 break-after-avoid text-[26px] font-bold leading-tight tracking-[-0.5px] text-ink first:mt-0">{b.slice(3)}</h2>;
        if (b.startsWith("> ")) return <blockquote key={i} className="rounded-2xl border-l-4 border-accent bg-accent-soft px-5 py-4 text-[17px] font-medium text-accent-ink">{inline(b.replace(/^> /gm, ""))}</blockquote>;
        if (lines.every((l) => l.startsWith("- "))) return <ul key={i} className="flex list-disc flex-col gap-2 pl-6">{lines.map((l, j) => <li key={j}>{inline(l.slice(2))}</li>)}</ul>;
        if (lines.every((l) => /^\d+\. /.test(l))) return <ol key={i} className="flex list-decimal flex-col gap-2 pl-6">{lines.map((l, j) => <li key={j}>{inline(l.replace(/^\d+\. /, ""))}</li>)}</ol>;
        return <p key={i}>{lines.map((l, j) => <Fragment key={j}>{j > 0 && <br />}{inline(l)}</Fragment>)}</p>;
      })}
    </>
  );
}
