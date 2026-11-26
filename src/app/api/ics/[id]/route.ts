import { anonClient } from "@/lib/supabase/anon";
import { ics } from "@/lib/booking";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("Não encontrado", { status: 404 });
  const { data } = await anonClient().rpc("public_booking_get", { p_id: id });
  const b = data as { id: string; starts_at: string; ends_at: string; title: string; author: string; location: string | null; meet_url: string | null } | null;
  if (!b) return new Response("Não encontrado", { status: 404 });
  const body = ics({ id: b.id, start: b.starts_at, end: b.ends_at, title: `${b.title} · ${b.author}`, description: b.meet_url ? `Link: ${b.meet_url}` : `Reunião com ${b.author}`, location: b.meet_url || b.location });
  return new Response(body, { headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": 'attachment; filename="reuniao.ics"' } });
}
