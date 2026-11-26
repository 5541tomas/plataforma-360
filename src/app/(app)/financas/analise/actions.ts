"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getContext } from "@/lib/context";

export async function markSubscription(formData: FormData) {
  const ctx = await getContext();
  const supabase = await createClient();
  await supabase.from("subscription_marks").upsert({ org_id: ctx.org.id, owner_id: ctx.userId, pattern: String(formData.get("pattern")), status: String(formData.get("status")), updated_at: new Date().toISOString() });
  revalidatePath("/financas/analise");
}
