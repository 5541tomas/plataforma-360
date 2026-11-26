"use server";
import { revalidatePath } from "next/cache";
import { anonClient } from "@/lib/supabase/anon";

export async function acceptProposal(token: string, name: string): Promise<{ ok: boolean; error?: string }> {
  if (!/^[0-9a-f-]{36}$/.test(token)) return { ok: false, error: "Link inválido" };
  const { error } = await anonClient().rpc("public_proposal_accept", { p_token: token, p_name: name });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/p/${token}`);
  return { ok: true };
}
