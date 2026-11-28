import { anonClient } from "@/lib/supabase/anon";
import { ics } from "@/lib/booking";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("Não encontrado", { status: 404 });
  const { data } = await anonClient().rpc("public_event_registration", { p_id: id });
  const r = data as { id: string; title: string; starts_at: string; ends_at: string; location: string | null; online_url: string | null; author: string } | null;
  if (!r) return new Response("Não encontrado", { status: 404 });
  const body = ics({ id: r.id, start: r.starts_at, end: r.ends_at, title: r.title, description: r.online_url ? `Link: ${r.online_url}` : `Com ${r.author}`, location: r.online_url || r.location });
  return new Response(body, { headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": 'attachment; filename="evento.ics"' } });
}
