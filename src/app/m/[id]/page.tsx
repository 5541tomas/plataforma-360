import Link from "next/link";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { anonClient } from "@/lib/supabase/anon";
import { lisbonLong, lisbonTime } from "@/lib/booking";

export const dynamic = "force-dynamic";
export const metadata = { title: "A tua reunião", robots: { index: false } };
type B = { id: string; starts_at: string; ends_at: string; name: string; status: string; org: string; author: string; slug: string; location: string | null; meet_url: string | null; title: string };

async function cancel(formData: FormData) {
  "use server";
  const id = String(formData.get("id"));
  if (!/^[0-9a-f-]{36}$/.test(id)) return;
  await anonClient().rpc("public_booking_cancel", { p_id: id });
  revalidatePath(`/m/${id}`);
}

export default async function MeetingPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ nova?: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const sp = await searchParams;
  const { data } = await anonClient().rpc("public_booking_get", { p_id: id });
  const b = data as B | null;
  if (!b) notFound();
  const start = new Date(b.starts_at), past = start.getTime() < Date.now(), cancelled = b.status === "cancelled";
  const g = new URL("https://calendar.google.com/calendar/render");
  g.searchParams.set("action", "TEMPLATE"); g.searchParams.set("text", `${b.title} · ${b.author}`);
  g.searchParams.set("dates", `${start.toISOString().replace(/[-:]|\.\d{3}/g, "")}/${new Date(b.ends_at).toISOString().replace(/[-:]|\.\d{3}/g, "")}`);
  g.searchParams.set("details", b.meet_url ? `Link: ${b.meet_url}` : `Com ${b.author}`); if (b.location) g.searchParams.set("location", b.location);

  return (
    <main className="min-h-screen bg-bg px-4 py-10">
      <div className="mx-auto flex w-full max-w-[520px] flex-col gap-5">
        <div className="card flex flex-col items-center gap-3 text-center">
          <div className={`flex h-14 w-14 items-center justify-center rounded-full text-2xl ${cancelled ? "bg-warn-soft text-warn" : "bg-good-soft text-good"}`}>{cancelled ? "×" : "✓"}</div>
          <h1 className="text-[26px] font-bold tracking-[-0.5px]">{cancelled ? "Reunião cancelada" : sp.nova ? `Está marcado, ${b.name.split(" ")[0]}!` : b.title}</h1>
          <div className={`flex flex-col gap-0.5 ${cancelled ? "line-through opacity-60" : ""}`}>
            <span className="text-[17px] font-semibold first-letter:uppercase">{lisbonLong(start)}</span>
            <span className="text-ink-2">{lisbonTime(start)}–{lisbonTime(new Date(b.ends_at))} · hora de Lisboa</span>
            <span className="text-sm text-muted">Com {b.author}{b.location ? ` · ${b.location}` : ""}</span>
          </div>
          {!cancelled && b.meet_url && <a href={b.meet_url} target="_blank" rel="noopener noreferrer" className="btn">Entrar na videochamada</a>}
        </div>
        {!cancelled && !past && (
          <div className="card flex flex-col gap-3">
            <h2 className="h2">Adicionar ao calendário</h2>
            <div className="flex flex-wrap gap-2">
              <a href={g.toString()} target="_blank" rel="noopener noreferrer" className="btn-ghost">Google Calendar</a>
              <a href={`/api/ics/${b.id}`} className="btn-ghost">Apple / Outlook (.ics)</a>
            </div>
            <p className="text-sm text-muted">Para aproveitarmos bem os minutos: pensa no que te fez marcar esta conversa e no que tem de mudar nos próximos 90 dias.</p>
          </div>
        )}
        {!cancelled && !past && (
          <form action={cancel} className="flex flex-col items-center gap-2 text-center">
            <input type="hidden" name="id" value={b.id} />
            <p className="text-sm text-muted">Não vais conseguir?</p>
            <div className="flex gap-3"><button className="text-sm font-medium text-warn">Cancelar reunião</button>{b.slug && <Link href={`/b/${b.slug}`} className="text-sm font-medium text-accent-ink">Marcar outro horário</Link>}</div>
          </form>
        )}
        {cancelled && b.slug && <Link href={`/b/${b.slug}`} className="btn self-center">Marcar novo horário</Link>}
        <p className="text-center text-xs text-muted">{b.org}</p>
      </div>
    </main>
  );
}
