/** Normaliza um número para o formato do wa.me (só dígitos, com indicativo; assume Portugal se tiver 9 dígitos) */
export function normalizePhone(raw?: string | null) {
  if (!raw) return null;
  let d = raw.replace(/[^\d+]/g, "");
  if (d.startsWith("+")) d = d.slice(1);
  else if (d.startsWith("00")) d = d.slice(2);
  else if (d.length === 9) d = `351${d}`;
  return d.length >= 11 ? d : null;
}

export function waLink(phone: string | null | undefined, text: string) {
  const n = normalizePhone(phone);
  const t = encodeURIComponent(text);
  return n ? `https://wa.me/${n}?text=${t}` : `https://wa.me/?text=${t}`;
}

const first = (name?: string | null) => (name ?? "").trim().split(/\s+/)[0] || "";

export type WaTemplate = { label: string; text: string };

/** Mensagens prontas para um negócio */
export function dealTemplates(o: { contact?: string | null; title: string; me: string; hasProposal: boolean }): WaTemplate[] {
  const hi = o.contact ? `Olá ${first(o.contact)}` : "Olá";
  const sign = first(o.me);
  const t: WaTemplate[] = [
    { label: "Follow-up", text: `${hi}, tudo bem? Queria saber se tiveram oportunidade de pensar sobre ${o.title}. Fico disponível para esclarecer qualquer dúvida. ${sign}` },
    { label: "Marcar reunião", text: `${hi}! Podemos marcar 30 minutos esta semana para avançarmos com ${o.title}? Diga-me que dia e hora lhe dá mais jeito. ${sign}` },
  ];
  if (o.hasProposal) {
    t.unshift({ label: "Proposta enviada", text: `${hi}, acabei de lhe enviar por email a proposta para ${o.title}. Se fizer sentido, podemos falar 15 minutos para rever em conjunto. ${sign}` });
    t.push({ label: "Lembrete de proposta", text: `${hi}, só para relembrar a proposta de ${o.title}. Alguma questão que eu possa ajudar a esclarecer? ${sign}` });
  }
  t.push({ label: "Lembrete de sessão", text: `${hi}! Só para confirmar a nossa sessão de amanhã. Até lá! ${sign}` });
  t.push({ label: "Obrigado", text: `${hi}, muito obrigado pela confiança! Vou enviar-lhe os próximos passos em breve. ${sign}` });
  return t;
}
