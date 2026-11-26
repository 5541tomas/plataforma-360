"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getContext } from "@/lib/context";

/** Junta chaves a organizations.settings[section] */
export async function saveSettings(section: string, values: Record<string, unknown>) {
  const ctx = await getContext();
  const supabase = await createClient();
  const { data } = await supabase.from("organizations").select("settings").eq("id", ctx.org.id).single();
  const settings = { ...(data?.settings ?? {}), [section]: { ...((data?.settings ?? {})[section] ?? {}), ...values } };
  const { error } = await supabase.from("organizations").update({ settings }).eq("id", ctx.org.id);
  if (error) throw new Error(error.message);
}

export async function saveGoalSettings(formData: FormData) {
  const n = (k: string) => { const v = Number(formData.get(k)); return Number.isFinite(v) && v > 0 ? v : undefined; };
  await saveSettings("goal", { win_rate: n("win_rate"), lead_to_proposal: n("lead_to_proposal"), capacity_hours_week: n("capacity_hours_week"), weeks_off: Number(formData.get("weeks_off") ?? 6) });
  revalidatePath("/meta"); revalidatePath("/");
}
