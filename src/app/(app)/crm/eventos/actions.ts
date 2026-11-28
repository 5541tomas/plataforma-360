"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireModule } from "@/lib/context";
import { lisbonToUtc } from "@/lib/booking";

const P = "/crm/eventos";
const slugify = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

export async function saveEvent(formData: FormData) {
  const ctx = await requireModule("crm", "write");
  const supabase = await createClient();
  const id = String(formData.get("id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const date = String(formData.get("date") ?? ""), time = String(formData.get("time") ?? "");
  const dur = Math.max(15, Number(formData.get("duration") ?? 120) || 120);
  if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) redirect(`${P}?erro=${encodeURIComponent("Indica o título, a data e a hora.")}`);
  const start = lisbonToUtc(date, time);
  const online = String(formData.get("online_url") ?? "").trim();
  const row = {
    title, slug: slugify(String(formData.get("slug") || "") || title) || "evento", subtitle: String(formData.get("subtitle") ?? "").trim() || null, description: String(formData.get("description") ?? "").trim() || null,
    starts_at: start.toISOString(), ends_at: new Date(start.getTime() + dur * 60000).toISOString(), location: String(formData.get("location") ?? "").trim() || null,
    online_url: /^https?:\/\//.test(online) ? online : null, capacity: Number(formData.get("capacity")) || null, price_label: String(formData.get("price_label") ?? "").trim() || null,
    active: id ? formData.get("active") === "on" : true,
  };
  const { error } = id ? await supabase.from("events").update(row).eq("id", id).eq("org_id", ctx.org.id) : await supabase.from("events").insert({ ...row, org_id: ctx.org.id });
  if (error) redirect(`${P}?erro=${encodeURIComponent(error.message.includes("duplicate") ? "Já existe um evento com esse endereço. Muda o título ou o endereço." : error.message)}`);
  revalidatePath(P);
}

export async function deleteEvent(formData: FormData) {
  const ctx = await requireModule("crm", "write");
  const supabase = await createClient();
  await supabase.from("events").delete().eq("id", String(formData.get("id"))).eq("org_id", ctx.org.id);
  revalidatePath(P);
}

export async function setAttendance(formData: FormData) {
  const ctx = await requireModule("crm", "write");
  const supabase = await createClient();
  const status = String(formData.get("status"));
  if (!["registered", "attended", "no_show", "cancelled"].includes(status)) return;
  const id = String(formData.get("id"));
  const { data: r } = await supabase.from("event_registrations").update({ status }).eq("id", id).eq("org_id", ctx.org.id).select("contact_id, deal_id, events(title)").single();
  if (r && status === "attended") await supabase.from("activities").insert({ org_id: ctx.org.id, contact_id: r.contact_id, deal_id: r.deal_id, type: "meeting", summary: `Esteve em «${(r.events as unknown as { title: string } | null)?.title ?? "evento"}»` });
  revalidatePath(P);
}
