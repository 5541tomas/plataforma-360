"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { anonClient } from "@/lib/supabase/anon";
import { scoreQuiz, type QuizConfig } from "@/lib/magnets";

export async function submitMagnet(formData: FormData) {
  const org = String(formData.get("org")), slug = String(formData.get("slug"));
  const supabase = anonClient();
  const { data: m } = await supabase.rpc("public_magnet_peek", { p_org: org, p_slug: slug });
  if (!m) redirect(`/d/${org}/${slug}?erro=${encodeURIComponent("Página indisponível")}`);
  const mag = m as { kind: "quiz" | "ebook" | "guide"; config: QuizConfig };
  let answers: number[] | null = null, scores: Record<string, number> | null = null, total = 0, weakest: string | null = null;
  if (mag.kind === "quiz") {
    try { answers = (JSON.parse(String(formData.get("answers") ?? "[]")) as unknown[]).map((x) => Number(x)); } catch { answers = []; }
    if (answers.length !== mag.config.questions.length || answers.some((a) => !Number.isInteger(a) || a < 0 || a > 9)) redirect(`/d/${org}/${slug}?erro=${encodeURIComponent("Responde a todas as perguntas")}`);
    const r = scoreQuiz(mag.config, answers);
    scores = r.scores; total = r.total; weakest = r.weakest.name;
  }
  const h = await headers();
  const base = process.env.NEXT_PUBLIC_SITE_URL || `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
  const { data: rid, error } = await supabase.rpc("public_magnet_submit", {
    p_org: org, p_slug: slug, p_name: String(formData.get("name") ?? ""), p_email: String(formData.get("email") ?? ""), p_phone: String(formData.get("phone") ?? ""),
    p_answers: answers, p_scores: scores, p_total: total, p_weakest: weakest, p_consent: formData.get("consent") === "on", p_base: base,
    p_honeypot: String(formData.get("website") ?? ""), p_area: String(formData.get("area") ?? ""), p_utm: (() => { try { const u = JSON.parse(String(formData.get("utm") ?? "{}")); return u && (u.source || u.campaign) ? u : null; } catch { return null; } })(),
  });
  if (error) redirect(`/d/${org}/${slug}?erro=${encodeURIComponent(error.message)}${mag.kind === "quiz" ? "&passo=contacto&r=" + encodeURIComponent(String(formData.get("answers"))) : ""}`);
  if (!rid) redirect(`/d/${org}/${slug}`);
  redirect(mag.kind === "quiz" ? `/r/${rid}` : mag.kind === "guide" ? `/g/${rid}` : `/e/${rid}`);
}
