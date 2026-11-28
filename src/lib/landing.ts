// Páginas de lead magnet no estilo da marca (tema "noir": preto, dourado, Poppins + Playfair Display)
import type { Offer, QuizConfig } from "./magnets";
import type { SeqT } from "./automation-templates";

/** Texto com marcação simples: **negrito** e *destaque dourado* */
export type Rich = string;
export type Landing = {
  theme: "noir";
  brand: string;            // "THOMAS FARIA"
  edition?: string;         // "GUIA GRATUITO · EDIÇÃO 2027"
  hero: { eyebrow: string; lines: string[]; accent: string; lead: Rich; photo?: string; cta?: string; note?: string };
  ticker?: string[];
  honest?: { eyebrow: string; pairs: [string, Rich][]; after?: string };
  list?: { title: string; accent: string; intro?: string; items: { t: string; d: string }[] };
  deliverables?: { eyebrow: string; title: string; accent: string; items: string[]; images?: { src: string; alt: string }[] };
  about?: { eyebrow: string; first: string; last: string; photo?: string; paragraphs: Rich[]; quote?: [string, string] };
  final?: { title: string; a_title: string; a_text: string; b_title: string; cta: string };
  areas?: string[];         // opções de "O que fazes"
  consent?: string;
  privacy?: { updated: string; controller: string; email: string };
};

export const AREAS = ["Marketing e redes sociais", "Design e fotografia", "Personal trainer", "Nutrição e terapias", "Seguros e crédito", "Imobiliário", "Coaching e consultoria", "Outra área"];

const ABOUT: Landing["about"] = {
  eyebrow: "E QUEM É ESTE TIPO?", first: "THOMAS", last: "Faria.", photo: "/brand/thomas-sobre.jpg",
  paragraphs: [
    "Comecei no fitness. Dirigi um clube, abri o meu próprio ginásio e vi uma coisa que nunca mais esqueci: quem tinha a agenda cheia não eram os melhores técnicos. Eram os que sabiam **vender o seu trabalho**.",
    "Depois vieram as vendas no setor automóvel e as equipas comerciais. Hoje ajudo freelancers e donos de PME a deixarem de depender da sorte, com dois métodos: **VENCER** e **Mind7**.",
  ],
  quote: ["“Vender é servir.", "Não vender é um risco.”"],
};
const TICKER = ["SEM MESES VAZIOS", "SEM “VOU PENSAR”", "SEM DESCONTOS À PRIMEIRA", "SEM VENDER HORAS", "SEM PREÇOS COPIADOS", "SEM DEPENDER DA SORTE"];
const SINS = [
  { t: "Rezar para que os clientes apareçam.", d: "Os meses vazios começam quando estás cheio de trabalho. Há uma razão, e 45 minutos por dia que a resolvem." },
  { t: "Ser “o designer que faz de tudo”.", d: "Quem fala para toda a gente compete pelo preço. A frase de 10 segundos que muda isso está na página 6." },
  { t: "Copiar o preço do vizinho.", d: "Os outros não pagam as tuas contas. Há uma conta que quase ninguém faz, e que explica porque o mês nunca fecha." },
  { t: "Responder “são 350€” ao “quanto custa?”.", d: "É o pecado que mais vendas mata. O script que o substitui leva o cliente para uma chamada." },
  { t: "Vender de improviso.", d: "Falas demais, apresentas cedo demais, não pedes a decisão. Há 6 fases que separam o “vou pensar” do “vamos avançar”." },
  { t: "Dar desconto porque pediram.", d: "Baixar o preço à primeira ensina o cliente que o teu preço era mentira. O que fazer em vez disso." },
  { t: "Gastar o dinheiro do Estado.", d: "Uma fatura de 1.000€ não são 1.000€ teus. O sistema das 3 contas acaba com os sustos." },
];

/** "Os 7 Erros do Freelancer" — guia entregue por WhatsApp (conteúdo da landing page original) */
export const GUIDE_7_ERROS: Landing = {
  theme: "noir", brand: "THOMAS FARIA", edition: "GUIA GRATUITO · EDIÇÃO 2027",
  hero: { eyebrow: "PARA FREELANCERS QUE ESTÃO FARTOS", lines: ["PARA DE", "TRABALHAR"], accent: "a mais.", photo: "/brand/thomas-hero.jpg",
    lead: "Talento não paga contas. **Método paga.** Descobre os 7 erros que te mantêm entre meses cheios e meses vazios, num guia de 13 páginas que lês num café.",
    cta: "MANDA-ME O GUIA", note: "Grátis. Chega ao teu email em segundos." },
  ticker: TICKER,
  honest: { eyebrow: "VAMOS SER HONESTOS", pairs: [["O teu talento não é o problema.", "O teu *preço* é."], ["A agenda vazia não é azar.", "É falta de *sistema.*"], ["O cliente não está a “pensar”.", "Está a *fugir.*"]],
    after: "Se alguma destas frases te incomodou, ótimo. É por aí que se começa a faturar mais sem trabalhar mais horas." },
  list: { title: "OS 7 PECADOS", accent: "do freelancer.", intro: "No guia chamamos-lhes erros. Sejamos honestos: são pecados. E quase todos os freelancers cometem pelo menos quatro.", items: SINS },
  deliverables: { eyebrow: "ZERO TEORIA", title: "Lês ao café.", accent: "Aplicas ao almoço.",
    items: ["Autodiagnóstico de 10 perguntas, com pontuação", "Calculadora do teu preço mínimo", "3 scripts para copiar e usar hoje", "Um desafio de 7 dias para não ficar na gaveta"],
    images: [{ src: "/brand/guia-autodiagnostico.jpg", alt: "Página do autodiagnóstico" }, { src: "/brand/guia-calculadora.jpg", alt: "Página da calculadora do preço mínimo" }, { src: "/brand/guia-scripts.jpg", alt: "Página dos scripts para o quanto custa" }] },
  about: ABOUT,
  final: { title: "E AGORA", a_title: "Continuar igual.", a_text: "Mais um ano de meses cheios, meses vazios e “vou pensar”. É grátis também, mas sai caro.", b_title: "Ler 13 páginas e corrigir o que está a falhar.", cta: "QUERO O GUIA" },
  areas: AREAS,
  consent: "Aceito receber o guia e mensagens do Thomas no WhatsApp. Sem spam, e paro quando me pedires.",
  privacy: { updated: "27 de novembro de 2026", controller: "Thomas Pinheiro, que trabalha sob a marca Thomas Faria | Estratégia & Crescimento", email: "geral@thomasfaria.pt" },
};

/** Teste "Quantos pecados cometes?" — uma pergunta por pecado */
const o = (...labels: string[]) => labels.map((label, points) => ({ label, points }));
export const SINS_QUIZ: QuizConfig & { landing: Landing; result_mode: "sins" } = {
  intro: "7 perguntas, 2 minutos. No fim sabes exatamente que pecados estás a cometer — e por onde começar a corrigir.",
  minutes: 2,
  result_mode: "sins",
  areas: [
    { key: "rezar", name: "Rezar para que os clientes apareçam", low: "Os clientes só aparecem quando paras de trabalhar neles — e é aí que nascem os meses vazios. Reserva 45 minutos por dia, todos os dias, para gerar oportunidades, mesmo (sobretudo) quando estás cheio.", mid: "Já fazes alguma coisa, mas sem ritmo. Transforma o que fazes num bloco fixo diário e mede quantas conversas novas abres por semana.", high: "Tens um ritmo de prospeção. Agora mede que canal te traz mais clientes e duplica-o." },
    { key: "tudo", name: "Ser “o que faz de tudo”", low: "Quem fala para toda a gente compete pelo preço. Escolhe para quem trabalhas e que problema resolves, e diz isso numa frase de 10 segundos.", mid: "Já dizes o que fazes, mas não o resultado que entregas. Troca a profissão pelo resultado na tua apresentação.", high: "Tens uma mensagem clara. O próximo passo é prova: casos com números e testemunhos." },
    { key: "preco", name: "Copiar o preço do vizinho", low: "O preço dos outros não paga as tuas contas. Calcula o teu preço mínimo: custos, impostos, férias e o salário que queres — e nunca vendas abaixo dele.", mid: "Fizeste contas às horas, mas falta o resto: impostos, meses fracos, férias. Refaz a conta com tudo lá dentro.", high: "Sabes o teu preço mínimo. Agora cobra pelo valor do resultado, não pelas horas." },
    { key: "350", name: "Responder “são 350€” ao “quanto custa?”", low: "É o pecado que mais vendas mata: o preço sem contexto é sempre caro. Responde com perguntas e leva a conversa para uma chamada antes de falares de valores.", mid: "Já explicas o que está incluído, mas ainda falas de preço cedo demais. Primeiro diagnóstico, depois valor.", high: "Não te deixas apanhar pelo «quanto custa?». Usa essa conversa para qualificar melhor o cliente." },
    { key: "improviso", name: "Vender de improviso", low: "Falas demais, apresentas cedo demais e não pedes a decisão. Uma conversa de vendas tem fases — segue-as sempre pela mesma ordem.", mid: "Tens bases, mas falta estrutura. Escreve o teu guião e treina o momento de pedir a decisão.", high: "Tens um método. Afina a parte das objeções e mede a tua taxa de fecho." },
    { key: "desconto", name: "Dar desconto porque pediram", low: "Baixar o preço à primeira ensina o cliente que o teu preço era mentira. Se o valor desce, o âmbito também desce.", mid: "Às vezes seguras o preço, às vezes não. Decide antes da conversa até onde podes ir e o que tiras em troca.", high: "Defendes o teu preço. Usa opções (base, recomendada, premium) para o cliente escolher sem negociar." },
    { key: "estado", name: "Gastar o dinheiro do Estado", low: "Uma fatura de 1.000€ não são 1.000€ teus. Separa logo três contas: impostos, despesas do negócio e o teu salário — e acabam-se os sustos.", mid: "Já guardas alguma coisa, mas sem regra. Define percentagens fixas e transfere no próprio dia em que recebes.", high: "Tens o dinheiro organizado. Próximo passo: uma reserva de 3 meses para dizeres não a maus clientes." },
  ],
  questions: [
    { area: "rezar", text: "Quando estás cheio de trabalho, o que fazes para arranjar os próximos clientes?", options: o("Nada — não tenho tempo", "Respondo a quem me aparece", "Publico qualquer coisa quando me lembro", "Tenho um bloco diário fixo para isso") },
    { area: "tudo", text: "Pedem-te para te apresentares em 10 segundos. Dizes…", options: o("Que faço um pouco de tudo", "A minha profissão", "A profissão e para quem trabalho", "Que problema resolvo, a quem e com que resultado") },
    { area: "preco", text: "Como chegaste ao teu preço?", options: o("Vi o que os outros cobram", "Pelo que acho que o cliente aceita", "Fiz contas às horas", "Calculei o meu preço mínimo com impostos, custos e férias") },
    { area: "350", text: "Perguntam-te «quanto custa?». Tu…", options: o("Digo logo o preço", "Mando a tabela de preços", "Digo que depende e explico", "Faço perguntas e proponho uma chamada antes de falar de valores") },
    { area: "improviso", text: "Como corre uma conversa de vendas tua?", options: o("Improviso, depende do dia", "Falo do meu trabalho e mostro o portfólio", "Faço algumas perguntas e apresento", "Sigo sempre as mesmas fases, até pedir a decisão") },
    { area: "desconto", text: "O cliente pede desconto. Tu…", options: o("Dou, para não o perder", "Dou um pouco e fico a pensar nisso", "Explico o valor e às vezes mantenho", "Mantenho o preço e, se fizer sentido, ajusto o âmbito") },
    { area: "estado", text: "Recebes uma fatura de 1.000€. O que fazes ao dinheiro?", options: o("Uso como se fosse tudo meu", "Guardo alguma coisa quando me lembro", "Separo uma parte para impostos", "Divido logo por 3 contas: impostos, despesas e eu") },
  ],
  levels: [
    { min: 0, name: "Pecador profissional", text: "Estás a cometer quase todos — e o teu talento está a pagar a fatura. A boa notícia: cada pecado tem uma correção simples, e as primeiras dão resultado em semanas." },
    { min: 45, name: "Pecador ocasional", text: "Já fazes muita coisa bem, mas há pecados que te mantêm entre meses cheios e meses vazios. Corrige primeiro o que mais te custa." },
    { min: 75, name: "Quase santo", text: "Vendes com método. Agora é afinar: subir o preço, escolher melhor os clientes e trabalhar menos horas." },
  ],
  landing: {
    theme: "noir", brand: "THOMAS FARIA", edition: "TESTE GRATUITO · 2 MINUTOS",
    hero: { eyebrow: "PARA FREELANCERS QUE QUEREM A VERDADE", lines: ["QUANTOS", "PECADOS"], accent: "cometes?", photo: "/brand/thomas-hero.jpg",
      lead: "7 perguntas. 2 minutos. **Resultado imediato.** Descobre que erros te mantêm entre meses cheios e meses vazios — e qual corrigir primeiro.", cta: "FAZER O TESTE", note: "Grátis. Sem registo para começar." },
    ticker: TICKER,
    list: { title: "OS 7 PECADOS", accent: "do freelancer.", intro: "Quase todos os freelancers cometem pelo menos quatro. Vamos ver quantos são os teus.", items: SINS },
    about: ABOUT,
    areas: AREAS,
    consent: "Aceito receber o resultado e mensagens do Thomas. Sem spam, e paro quando me pedires.",
    privacy: { updated: "27 de novembro de 2026", controller: "Thomas Pinheiro, que trabalha sob a marca Thomas Faria | Estratégia & Crescimento", email: "geral@thomasfaria.pt" },
  },
};

export const GUIDE_OFFER: Offer & { whatsapp: string; keyword: string; guide_url: string; whatsapp_body: string } = {
  whatsapp: "351930528669", keyword: "GUIA", guide_url: "",
  meeting_label: "MARCAR CONVERSA DE DIAGNÓSTICO",
  email_subject: "O teu guia: Os 7 Erros do Freelancer",
  email_body: "Olá {{primeiro_nome}},\n\nAqui está o teu guia «Os 7 Erros do Freelancer»:\n{{link_guia}}\n\nLê-o ao café e começa pelo autodiagnóstico — em 5 minutos sabes quantos pecados estás a cometer.\n\nSe quiseres ir mais rápido, marcamos 30 minutos de conversa de diagnóstico, sem custos:\n{{link_reuniao}}\n\nUm abraço,\n{{meu_nome}}",
  whatsapp_body: "Olá {{primeiro_nome}}! Aqui está o teu guia «Os 7 Erros do Freelancer» 👇 {{link_guia}}\n\nLê ao café e começa pelo autodiagnóstico — depois diz-me quantos pecados apanhaste 😉\n\n{{meu_nome}}",
};
export const QUIZ_SINS_OFFER: Offer & { whatsapp: string; keyword: string; whatsapp_body: string } = {
  whatsapp: "351930528669", keyword: "PECADOS",
  meeting_label: "MARCAR CONVERSA DE DIAGNÓSTICO",
  whatsapp_body: "Olá {{primeiro_nome}}! Vi o teu resultado no teste dos 7 pecados. O que mais te está a custar é «{{area_fraca}}» — e é dos mais fáceis de corrigir.\n\nQueres que te mande o guia «Os 7 Erros do Freelancer»? Tem o passo a passo.\n\n{{meu_nome}}",
  email_subject: "O teu resultado: {{pontuacao}}/100",
  email_body: "Olá {{primeiro_nome}},\n\nObrigado por fazeres o teste dos 7 pecados do freelancer. O pecado que mais te está a custar é: {{area_fraca}}.\n\nVê o resultado completo, com a correção para cada pecado:\n{{link_resultado}}\n\nSe quiseres ir mais rápido, marcamos uma conversa de diagnóstico de 30 minutos:\n{{link_reuniao}}\n\n{{meu_nome}}",
};

/** Sequência WhatsApp: 5 mensagens em 10 dias (como diz a política de privacidade), cada uma aprovada por ti */
export const WHATSAPP_SEQUENCE: SeqT = {
  key: "7erros", name: "7 Erros — WhatsApp", description: "Para quem pediu o guia ou fez o teste: 5 mensagens em 10 dias que levam à conversa de diagnóstico.", stop_on_stage_change: true,
  steps: [
    { delay: 1, channel: "whatsapp", body: "{{primeiro_nome}}, já conseguiste ver o guia? Começa pelo autodiagnóstico — em 5 minutos sabes quantos pecados estás a cometer. Depois conta-me o resultado 🙂" },
    { delay: 2, channel: "whatsapp", body: "Pergunta rápida, {{primeiro_nome}}: qual dos 7 pecados te custou mais dinheiro este ano? A maioria responde o 4 — o «são 350€» 😅" },
    { delay: 2, channel: "whatsapp", body: "Dica para esta semana: quando te perguntarem «quanto custa?», experimenta responder «Depende do que precisas. Posso fazer-te 3 perguntas rápidas para te dar um valor certo?». Depois diz-me como correu." },
    { delay: 2, channel: "whatsapp", body: "{{primeiro_nome}}, já fizeste a calculadora do preço mínimo? Se o número te assustou, é normal — é o primeiro passo para deixares de trabalhar a mais." },
    { delay: 3, channel: "whatsapp", body: "Última mensagem desta série 🙂 Se quiseres, marcamos 30 minutos de conversa de diagnóstico, sem custos: vemos onde estás a perder dinheiro em {{area}} e sais com 3 prioridades. Escolhe a hora aqui: {{link_reuniao}}" },
    { delay: 2, channel: "task", body: "Ligar a {{nome}} ({{area}}): recebeu o guia e a sequência, ainda sem conversa marcada" },
  ],
};
