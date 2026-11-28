import { notFound } from "next/navigation";
import { anonClient } from "@/lib/supabase/anon";
import { BookingPicker } from "@/components/BookingPicker";
import { cfgOf, freeSlots, type BookingCfg } from "@/lib/booking";
import { book } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Marcar reunião" };
type Info = { org: string; author: string; booking: BookingCfg; busy: [string, string][] };

export default async function BookingPage({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ r?: string; erro?: string; h?: string }> }) {
  const { org } = await params;
  const sp = await searchParams;
  const sb = anonClient();
  const { data } = await sb.rpc("public_booking_info", { p_org: org });
  const info = data as Info | null;
  if (!info) notFound();
  const cfg = cfgOf(info.booking);
  const days = freeSlots(cfg, info.busy);
  let firstName: string | undefined;
  if (sp.r && /^[0-9a-f-]{36}$/.test(sp.r)) { const { data: r } = await sb.rpc("public_magnet_result", { p_rid: sp.r }); firstName = (r as { first_name?: string } | null)?.first_name ?? undefined; }
  const initials = info.author.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  return (
    <main className="min-h-screen bg-bg px-4 py-10">
      <div className="mx-auto flex w-full max-w-[600px] flex-col gap-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent text-xl font-bold text-white">{initials}</div>
          <p className="text-sm font-medium text-muted">{info.author}</p>
          <h1 className="text-[30px] font-bold leading-tight tracking-[-0.7px]">{cfg.title}</h1>
          <p className="max-w-[480px] text-[15px] leading-relaxed text-ink-2">{cfg.intro}</p>
          <div className="flex flex-wrap justify-center gap-2 text-xs text-ink-2"><span className="chip bg-white">⏱ {cfg.duration} min</span><span className="chip bg-white">📍 {cfg.location}</span><span className="chip bg-white">Gratuita</span></div>
        </div>
        <BookingPicker days={days} org={org} rid={sp.r} firstName={firstName} duration={cfg.duration} submit={book} error={sp.erro} initial={sp.h} />
        <p className="text-center text-xs text-muted">{info.org}</p>
      </div>
    </main>
  );
}
