"use server";
import { revalidatePath } from "next/cache";
import { saveSettings } from "@/app/(app)/meta/actions";

export async function saveTaxSettings(formData: FormData) {
  const n = (k: string, d: number) => { const v = Number(String(formData.get(k) ?? "").replace(",", ".")); return Number.isFinite(v) && v >= 0 ? v : d; };
  await saveSettings("tax", {
    regime: formData.get("regime") === "independente" ? "independente" : "empresa",
    iva: n("iva", 23), irc: n("irc", 20), irs: n("irs", 25), ss: n("ss", 21.4),
    reserva_meses: n("reserva_meses", 3), iva_despesas: formData.get("iva_despesas") === "on",
  });
  revalidatePath("/financas/impostos");
}
