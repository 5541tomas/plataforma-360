import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const target = new URL(req.url).searchParams.get("u") ?? "";
  let dest: URL | null = null;
  try { dest = new URL(target); } catch { dest = null; }
  if (!dest || !["http:", "https:"].includes(dest.protocol)) return new Response("Link inválido", { status: 400 });
  if (/^[0-9a-f-]{36}$/.test(id)) {
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { db: { schema: "p360" }, auth: { persistSession: false } });
    await sb.rpc("track_email", { p_outbox: id, p_type: "click" });
  }
  return NextResponse.redirect(dest.toString(), 302);
}
