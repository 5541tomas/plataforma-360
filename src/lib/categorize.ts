/** Normaliza uma descrição bancária para servir de "padrão" (remove números, datas, referências). */
export function normalizeDescription(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/\b(compra|pagamento|pag|trf|transf|transferencia|mb way|mbway|dd|deb|cred|cartao|c\.?deb|tpa|pos|ref|n\.?º?)\b/g, " ")
    .replace(/[0-9*#/\\.,:;_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

/** Regras base por palavra-chave (nome da categoria criada por defeito → expressões). */
export const DEFAULT_RULES: { category: string; scope: "personal" | "business"; re: RegExp }[] = [
  { category: "Supermercado", scope: "personal", re: /continente|pingo doce|lidl|mercadona|auchan|intermarche|minipreco|aldi|el corte ingles super|froiz/ },
  { category: "Restaurantes", scope: "personal", re: /restaura|cafe|pastelaria|uber ?eats|glovo|bolt food|mcdonald|burger|pizza|tasca|sushi|padaria/ },
  { category: "Transportes", scope: "personal", re: /galp|repsol|\bbp\b|prio|cepsa|via verde|uber|bolt|cp comboios|metro|carris|parque|estacionamento|brisa|ascendi/ },
  { category: "Casa", scope: "personal", re: /edp|endesa|goldenergy|epal|aguas|meo|nos comunica|vodafone|digi|renda|condominio|ikea|leroy/ },
  { category: "Saúde", scope: "personal", re: /farmacia|clinica|hospital|cuf|luz saude|lusiadas|medicare|dentist|optica|wells/ },
  { category: "Lazer", scope: "personal", re: /netflix|spotify|disney|hbo|prime video|cinema|nos lusomundo|ticketline|fnac|steam|playstation|ginasio|fitness/ },
  { category: "Software", scope: "business", re: /adobe|google workspace|google \*|microsoft|notion|canva|openai|anthropic|figma|slack|zoom|dropbox|github|hostinger|godaddy|netlify|vercel/ },
  { category: "Impostos e Segurança Social", scope: "business", re: /seguranca social|\bat\b autoridade|financas|iva|irc|irs|imposto/ },
  { category: "Contabilidade", scope: "business", re: /contabil|toc |occ /},
];
