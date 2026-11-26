"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getContext } from "@/lib/context";
import { DEFAULT_RULES, normalizeDescription } from "@/lib/categorize";
import type { ParsedTx } from "@/lib/csv";

export type ImportResult = { inserted: number; duplicates: number; categorized: number; error?: string };

export async function importTransactions(accountId: string, rows: ParsedTx[]): Promise<ImportResult> {
  const ctx = await getContext();
  const supabase = await createClient();
  if (!Array.isArray(rows) || rows.length === 0) return { inserted: 0, duplicates: 0, categorized: 0, error: "Sem movimentos para importar." };
  if (rows.length > 5000) return { inserted: 0, duplicates: 0, categorized: 0, error: "Máximo de 5000 movimentos por importação." };

  const { data: account } = await supabase.from("accounts").select("id, scope").eq("id", accountId).maybeSingle();
  if (!account) return { inserted: 0, duplicates: 0, categorized: 0, error: "Conta não encontrada ou sem permissão." };

  const [{ data: rules }, { data: cats }] = await Promise.all([
    supabase.from("category_rules").select("pattern, category_id").eq("org_id", ctx.org.id),
    supabase.from("categories").select("id, name, scope").eq("org_id", ctx.org.id).eq("scope", account.scope),
  ]);
  const learned = new Map((rules ?? []).map((r) => [r.pattern, r.category_id]));
  const validCat = new Set((cats ?? []).map((c) => c.id));
  const byName = new Map((cats ?? []).map((c) => [c.name, c.id]));

  // id externo determinístico: data|valor|descrição|nº da ocorrência (permite reimportar sem duplicar)
  const seen = new Map<string, number>();
  let categorized = 0;
  const payload = rows.map((r) => {
    const base = `${r.date}|${Number(r.amount).toFixed(2)}|${r.description.toLowerCase()}`;
    const n = (seen.get(base) ?? 0) + 1; seen.set(base, n);
    const pattern = normalizeDescription(r.description);
    let category_id: string | null = learned.get(pattern) ?? null;
    if (category_id && !validCat.has(category_id)) category_id = null;
    if (!category_id && r.amount < 0) {
      const rule = DEFAULT_RULES.find((x) => x.scope === account.scope && x.re.test(pattern));
      if (rule) category_id = byName.get(rule.category) ?? null;
    }
    if (category_id) categorized++;
    return {
      org_id: ctx.org.id, account_id: account.id,
      date: r.date, description: r.description.slice(0, 300), amount: Math.round(Number(r.amount) * 100) / 100,
      category_id, external_id: `${base}|${n}`.slice(0, 400),
      ai_categorized: false,
    };
  });

  let inserted = 0;
  for (let i = 0; i < payload.length; i += 500) {
    const chunk = payload.slice(i, i + 500);
    const { data, error } = await supabase.from("transactions")
      .upsert(chunk, { onConflict: "account_id,external_id", ignoreDuplicates: true }).select("id");
    if (error) return { inserted, duplicates: 0, categorized, error: error.message };
    inserted += data?.length ?? 0;
  }
  revalidatePath("/financas"); revalidatePath("/"); revalidatePath("/objetivos");
  return { inserted, duplicates: payload.length - inserted, categorized };
}
