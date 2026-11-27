// Função agendada: todas as manhãs às 8h (hora de Lisboa) pede à plataforma o resumo do dia
export default async () => {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Lisbon", hour: "numeric", hour12: false }).format(new Date()));
  if (hour !== 8) return new Response("fora de horas");
  const base = process.env.URL ?? "";
  const secret = process.env.APP_INTERNAL_SECRET ?? "";
  if (!base || !secret) return new Response("sem configuração");
  const r = await fetch(`${base}/api/cron/digest`, { method: "POST", headers: { "x-internal-secret": secret } });
  return new Response(await r.text(), { status: r.status });
};
// 7h e 8h UTC cobrem a hora de verão e de inverno; a função só envia quando são 8h em Lisboa
export const config = { schedule: "0 7,8 * * *" };
