"use client";
import { useState } from "react";
import type { Day } from "@/lib/booking";

const time = (iso: string) => new Intl.DateTimeFormat("pt-PT", { timeZone: "Europe/Lisbon", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
const long = (iso: string) => new Intl.DateTimeFormat("pt-PT", { timeZone: "Europe/Lisbon", weekday: "long", day: "numeric", month: "long" }).format(new Date(iso));

export function BookingPicker({ days, org, rid, firstName, duration, submit, error, initial }: { days: Day[]; org: string; rid?: string; firstName?: string; duration: number; submit: (fd: FormData) => Promise<void>; error?: string; initial?: string }) {
  const pre = initial && days.some((x) => x.slots.includes(initial)) ? initial : null;
  const [day, setDay] = useState(pre ? days.find((x) => x.slots.includes(pre))!.date : days[0]?.date);
  const [slot, setSlot] = useState<string | null>(pre);
  const [sending, setSending] = useState(false);
  const d = days.find((x) => x.date === day);
  if (!days.length) return <div className="card text-center text-sm text-muted">De momento não há horários livres. Volta a tentar daqui a uns dias.</div>;

  if (slot) return (
    <form action={async (fd) => { setSending(true); await submit(fd); }} className="card flex flex-col gap-4">
      <div className="rounded-2xl bg-accent-soft px-4 py-3 text-accent-ink">
        <div className="text-[15px] font-semibold first-letter:uppercase">{long(slot)}</div>
        <div className="text-sm">{time(slot)} · {duration} minutos (hora de Lisboa)</div>
      </div>
      {error && <p role="alert" className="rounded-xl bg-warn-soft px-3 py-2 text-sm text-warn">{error}</p>}
      <input type="hidden" name="org" value={org} /><input type="hidden" name="start" value={slot} /><input type="hidden" name="rid" value={rid ?? ""} />
      <div aria-hidden="true" className="absolute -left-[9999px]"><label>Site <input name="website" tabIndex={-1} autoComplete="off" /></label></div>
      <label className="flex flex-col gap-1.5"><span className="label">Nome</span><input name="name" required defaultValue={firstName ?? ""} autoComplete="name" className="input" /></label>
      <label className="flex flex-col gap-1.5"><span className="label">Email</span><input name="email" type="email" required autoComplete="email" className="input" /></label>
      <label className="flex flex-col gap-1.5"><span className="label">Telemóvel (opcional)</span><input name="phone" type="tel" autoComplete="tel" className="input" /></label>
      <label className="flex flex-col gap-1.5"><span className="label">O que gostavas de resolver? (opcional)</span><textarea name="notes" rows={3} className="input py-2.5" /></label>
      <button disabled={sending} className="btn !min-h-12 text-base disabled:opacity-60">{sending ? "A marcar…" : "Confirmar marcação"}</button>
      <button type="button" onClick={() => setSlot(null)} className="text-sm text-muted hover:text-ink">‹ Escolher outro horário</button>
    </form>
  );

  return (
    <div className="card flex flex-col gap-5">
      {error && <p role="alert" className="rounded-xl bg-warn-soft px-3 py-2 text-sm text-warn">{error}</p>}
      <div className="flex flex-col gap-2">
        <span className="label">Escolhe o dia</span>
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="radiogroup" aria-label="Dia">
          {days.map((x) => (
            <button key={x.date} role="radio" aria-checked={x.date === day} onClick={() => setDay(x.date)}
              className={`flex min-w-[64px] shrink-0 flex-col items-center rounded-2xl border px-2 py-2.5 ${x.date === day ? "border-accent bg-accent text-white" : "border-line bg-card hover:border-accent/50"}`}>
              <span className={`text-[11px] font-medium uppercase ${x.date === day ? "text-white/80" : "text-muted"}`}>{x.weekday}</span>
              <span className="text-[17px] font-semibold">{x.label.split(/[ /]/)[0]}</span>
              <span className={`text-[11px] ${x.date === day ? "text-white/80" : "text-muted"}`}>{x.label.split(/[ /]/).slice(1).join(" ")}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <span className="label first-letter:uppercase">{d ? long(d.slots[0]) : ""} · hora de Lisboa</span>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {d?.slots.map((s) => <button key={s} onClick={() => setSlot(s)} className="min-h-12 rounded-xl border border-line bg-card text-[15px] font-medium text-accent-ink hover:border-accent hover:bg-accent-soft">{time(s)}</button>)}
        </div>
      </div>
    </div>
  );
}
