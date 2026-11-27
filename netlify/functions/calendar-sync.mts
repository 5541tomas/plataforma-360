// Função agendada: de 10 em 10 minutos sincroniza a agenda de marcações com o Google Calendar
export default async () => {
  const base = process.env.URL ?? "", secret = process.env.APP_INTERNAL_SECRET ?? "";
  if (!base || !secret) return new Response("sem configuração");
  const r = await fetch(`${base}/api/cron/calendar`, { method: "POST", headers: { "x-internal-secret": secret } });
  return new Response(await r.text(), { status: r.status });
};
export const config = { schedule: "*/10 * * * *" };
