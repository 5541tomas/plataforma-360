"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getContext } from "@/lib/context";

export async function dismissSetup() {
  const ctx = await getContext();
  const supabase = await createClient();
  const { data } = await supabase.from("organizations").select("settings").eq("id", ctx.org.id).single();
  await supabase.from("organizations").update({ settings: { ...((data?.settings as object) ?? {}), setup_dismissed: true } }).eq("id", ctx.org.id);
  revalidatePath("/");
}
