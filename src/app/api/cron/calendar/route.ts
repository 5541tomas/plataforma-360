import { internalSecret } from "@/lib/stripe";
import { runCalendarSync } from "@/lib/calendar-sync";

/** Sincronização da agenda com o Google (chamada de 10 em 10 minutos pela função agendada) */
export async function POST(req: Request) {
  const secret = internalSecret();
  if (!secret || req.headers.get("x-internal-secret") !== secret) return new Response("sem permissão", { status: 401 });
  return Response.json(await runCalendarSync(secret));
}
