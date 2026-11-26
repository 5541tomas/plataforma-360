import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getContext } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import { emailFromIdToken, exchangeCode } from "@/lib/google";

export async function GET(request: Request) {
  const ctx = await getContext();
  const url = new URL(request.url);
  const back = (q: string) => NextResponse.redirect(`${url.origin}/definicoes?${q}`);
  const jar = await cookies();
  const expected = jar.get("g_state")?.value;
  jar.delete("g_state");
  if (url.searchParams.get("error")) return back(`erro=${encodeURIComponent("Ligação ao Google cancelada.")}`);
  const code = url.searchParams.get("code");
  if (!code || !expected || url.searchParams.get("state") !== expected) return back(`erro=${encodeURIComponent("Pedido inválido. Tenta novamente.")}`);
  try {
    const t = await exchangeCode(code, url.origin);
    if (!t.refresh_token) return back(`erro=${encodeURIComponent("O Google não devolveu acesso permanente. Remove a app em myaccount.google.com/permissions e liga de novo.")}`);
    const supabase = await createClient();
    const { error } = await supabase.from("integrations").upsert({
      user_id: ctx.userId, org_id: ctx.org.id, provider: "google", account_email: emailFromIdToken(t.id_token),
      refresh_token: t.refresh_token, access_token: t.access_token, expires_at: new Date(Date.now() + t.expires_in * 1000).toISOString(),
    });
    if (error) return back(`erro=${encodeURIComponent(error.message)}`);
    return back(`ok=${encodeURIComponent("Conta Google ligada. Carrega em “Sincronizar agora”.")}`);
  } catch (e) {
    return back(`erro=${encodeURIComponent(e instanceof Error ? e.message : "Erro ao ligar ao Google.")}`);
  }
}
