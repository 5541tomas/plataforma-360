"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireModule } from "@/lib/context";
import { BOOKING_DEFAULTS } from "@/lib/booking";

const hhmm = (v: FormDataEntryValue | null, d: string) => (/^\d{2}:\d{2}$/.test(String(v)) ? String(v) : d);
const int = (v: FormDataEntryValue | null, d: number, min: number, max: number) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : d; };

export async function saveBooking(formData: FormData) {
  const ctx = await requireModule("crm", "write");
  const supabase = await createClient();
  const url = String(formData.get("meet_url") ?? "").trim();
  const days = [1, 2, 3, 4, 5, 6, 7].filter((d) => formData.get(`d${d}`) === "on");
  const booking = {
    enabled: formData.get("enabled") === "on",
    duration: int(formData.get("duration"), 30, 10, 180), buffer: int(formData.get("buffer"), 15, 0, 120),
    days: days.length ? days : BOOKING_DEFAULTS.days, start: hhmm(formData.get("start"), "09:30"), end: hhmm(formData.get("end"), "18:00"),
    notice_hours: int(formData.get("notice_hours"), 12, 0, 168), horizon_days: int(formData.get("horizon_days"), 21, 1, 90),
    title: String(formData.get("title") ?? "").trim() || BOOKING_DEFAULTS.title, intro: String(formData.get("intro") ?? "").trim() || BOOKING_DEFAULTS.intro,
    location: String(formData.get("location") ?? "").trim() || BOOKING_DEFAULTS.location, meet_url: /^https?:\/\//.test(url) ? url : "",
  };
  await supabase.from("organizations").update({ booking }).eq("id", ctx.org.id);
  revalidatePath("/crm/agenda");
}

export async function setBookingStatus(formData: FormData) {
  await requireModule("crm", "write");
  const supabase = await createClient();
  const status = String(formData.get("status"));
  if (!["confirmed", "cancelled", "done", "no_show"].includes(status)) return;
  await supabase.from("bookings").update({ status }).eq("id", String(formData.get("id")));
  revalidatePath("/crm/agenda"); revalidatePath("/");
}

/** Sincroniza já com o Google Calendar (normalmente acontece sozinho de 10 em 10 minutos) */
export async function syncCalendarNow() {
  await requireModule("crm", "write");
  const { runCalendarSync } = await import("@/lib/calendar-sync");
  const { internalSecret } = await import("@/lib/stripe");
  await runCalendarSync(internalSecret());
  revalidatePath("/crm/agenda");
}
