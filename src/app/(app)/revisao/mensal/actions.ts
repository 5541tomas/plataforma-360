"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getContext } from "@/lib/context";
import { AREAS } from "@/lib/areas";

export async function saveLifeReview(formData: FormData) {
  const ctx = await getContext();
  const supabase = await createClient();
  const scores: Record<string, number> = {};
  AREAS.forEach((a) => { const v = Number(formData.get(`s_${a}`)); if (v >= 1 && v <= 10) scores[a] = v; });
  const { error } = await supabase.from("life_reviews").upsert({
    org_id: ctx.org.id, user_id: ctx.userId, month: String(formData.get("month")), scores,
    wins: String(formData.get("wins") ?? "") || null, lessons: String(formData.get("lessons") ?? "") || null,
    focus_area: String(formData.get("focus_area") ?? "") || null, focus: String(formData.get("focus") ?? "") || null,
  });
  if (error) throw new Error(error.message);
  // O foco do mês vira tarefa para que não fique esquecido
  const focus = String(formData.get("focus") ?? "").trim();
  if (focus && formData.get("as_task") === "on") {
    const end = new Date(String(formData.get("month"))); end.setMonth(end.getMonth() + 2, 0);
    await supabase.from("tasks").insert({ org_id: ctx.org.id, title: `Foco do mês (${String(formData.get("focus_area") ?? "")}): ${focus}`, due_date: end.toISOString().slice(0, 10) });
  }
  revalidatePath("/revisao/mensal"); revalidatePath("/");
}
