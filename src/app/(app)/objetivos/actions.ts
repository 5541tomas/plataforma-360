"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireModule, getContext } from "@/lib/context";
import { today } from "@/lib/format";

function refresh() { revalidatePath("/objetivos"); revalidatePath("/"); }

export async function createGoal(formData: FormData) {
  const ctx = await requireModule("goals", "write");
  const supabase = await createClient();
  const horizon = String(formData.get("horizon") || "year");
  const now = new Date();
  const start = horizon === "quarter"
    ? new Date(Date.UTC(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1))
    : horizon === "month" ? new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1))
    : new Date(Date.UTC(now.getFullYear(), 0, 1));
  const { error } = await supabase.from("goals").insert({
    org_id: ctx.org.id,
    title: String(formData.get("title")),
    area: String(formData.get("area")),
    horizon,
    period_start: start.toISOString().slice(0, 10),
    is_private: formData.get("shared") !== "on",
    parent_id: String(formData.get("parent_id") || "") || null,
  });
  if (error) throw new Error(error.message);
  refresh();
}

export async function createKeyResult(formData: FormData) {
  const ctx = await requireModule("goals", "write");
  const supabase = await createClient();
  const source = String(formData.get("source") || "manual");
  let source_config: Record<string, string> = {};
  if (source === "crm_product_units" || source === "finance_income" || source === "crm_won_value" || source === "crm_won_count") {
    // Período do KR = período do objetivo
    const { data: g } = await supabase.from("goals").select("horizon, period_start").eq("id", String(formData.get("goal_id"))).single();
    if (g && g.horizon !== "vision") {
      const end = new Date(g.period_start); end.setMonth(end.getMonth() + (g.horizon === "year" ? 12 : g.horizon === "quarter" ? 3 : 1));
      source_config = { from: g.period_start, to: end.toISOString().slice(0, 10) };
    }
    if (source === "crm_product_units") {
      const pid = String(formData.get("product_id") || "");
      if (!pid) throw new Error("Escolhe o produto para este Key Result.");
      source_config.product_id = pid;
    }
  }
  const { error } = await supabase.from("key_results").insert({
    org_id: ctx.org.id, source_config,
    goal_id: String(formData.get("goal_id")),
    label: String(formData.get("label")),
    source,
    start_value: Number(formData.get("start_value") || 0),
    target_value: Number(formData.get("target_value")),
    unit: String(formData.get("unit") || ""),
  });
  if (error) throw new Error(error.message);
  refresh();
}

export async function updateKeyResult(formData: FormData) {
  await requireModule("goals", "write");
  const supabase = await createClient();
  await supabase.from("key_results").update({ current_value: Number(formData.get("current_value")) }).eq("id", String(formData.get("id")));
  refresh();
}

export async function createHabit(formData: FormData) {
  const ctx = await getContext();
  const supabase = await createClient();
  const { error } = await supabase.from("habits").insert({
    org_id: ctx.org.id,
    name: String(formData.get("name")),
    target_per_week: Number(formData.get("target_per_week") || 7),
  });
  if (error) throw new Error(error.message);
  refresh();
}

export async function toggleHabit(formData: FormData) {
  await getContext();
  const supabase = await createClient();
  const id = String(formData.get("habit_id"));
  const day = String(formData.get("day") || today());
  const { data } = await supabase.from("habit_logs").select("habit_id").eq("habit_id", id).eq("day", day).maybeSingle();
  if (data) await supabase.from("habit_logs").delete().eq("habit_id", id).eq("day", day);
  else await supabase.from("habit_logs").insert({ habit_id: id, day });
  refresh();
}

export async function createTask(formData: FormData) {
  const ctx = await getContext();
  const supabase = await createClient();
  const { error } = await supabase.from("tasks").insert({
    org_id: ctx.org.id,
    title: String(formData.get("title")),
    due_date: String(formData.get("due_date") || "") || today(),
    key_result_id: String(formData.get("key_result_id") || "") || null,
  });
  if (error) throw new Error(error.message);
  refresh();
}

export async function toggleTask(formData: FormData) {
  await getContext();
  const supabase = await createClient();
  const done = formData.get("done") === "true";
  await supabase.from("tasks").update({ done: !done, done_at: !done ? new Date().toISOString() : null }).eq("id", String(formData.get("id")));
  refresh();
  revalidatePath("/crm");
}

export async function updateGoal(formData: FormData) {
  await requireModule("goals", "write");
  const supabase = await createClient();
  const { error } = await supabase.from("goals").update({
    title: String(formData.get("title")),
    area: String(formData.get("area")),
    status: String(formData.get("status")),
    is_private: formData.get("shared") !== "on",
  }).eq("id", String(formData.get("id")));
  if (error) throw new Error(error.message);
  refresh();
}

export async function deleteGoal(formData: FormData) {
  await requireModule("goals", "write");
  const supabase = await createClient();
  if (formData.get("confirm") !== "on") throw new Error("Confirma que queres apagar.");
  const { error } = await supabase.from("goals").delete().eq("id", String(formData.get("id")));
  if (error) throw new Error(error.message);
  refresh();
}

export async function deleteKeyResult(formData: FormData) {
  await requireModule("goals", "write");
  const supabase = await createClient();
  await supabase.from("key_results").delete().eq("id", String(formData.get("id")));
  refresh();
}

export async function archiveHabit(formData: FormData) {
  await getContext();
  const supabase = await createClient();
  await supabase.from("habits").update({ archived: true }).eq("id", String(formData.get("id")));
  refresh();
}

export async function deleteTask(formData: FormData) {
  await getContext();
  const supabase = await createClient();
  await supabase.from("tasks").delete().eq("id", String(formData.get("id")));
  refresh();
  revalidatePath("/crm");
}
