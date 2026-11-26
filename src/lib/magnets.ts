// Conteúdo e cálculo dos lead magnets (diagnóstico de vendas para freelancers + ebook)
import type { SeqT } from "./automation-templates";

export type Area = { key: string; name: string; low: string; mid: string; high: string };
export type Question = { text: string; area: string; options: { label: string; points: number }[] };
export type Level = { min: number; name: string; text: string };
export type QuizConfig = { intro?: string; minutes?: number; areas: Area[]; questions: Question[]; levels: Level[] };
export type Offer = { meeting_url?: string; meeting_label?: string; email_subject?: string; email_body?: string };

const o = (...labels: string[]) => labels.map((label, points) => ({ label, points }));

export const SALES_QUIZ: QuizConfig = {
  intro: "13 perguntas rápidas para perceberes porque é que o teu trabalho ainda depende de sorte — e o que mudar primeiro para teres a agenda cheia ao preço certo.",
  minutes: 3,
  areas: [
    { key: "posicionamento", name: "Posicionamento",
      low: "Hoje és mais um no meio de muitos — e quando não há diferença, o cliente compara preços. Escolhe um tipo de cliente e um problema que resolves melhor do que ninguém e reescreve a tua apresentação numa frase: «Ajudo [quem] a [resultado] sem [dor]».",
      mid: "Já sabes com quem gostas de trabalhar, mas a tua mensagem ainda descreve o que fazes em vez do resultado que entregas. Troca a profissão pelo resultado na tua bio, no site e na forma como te apresentas.",
      high: "Tens um posicionamento claro. O próximo nível é prova: casos com números, testemunhos e uma oferta-assinatura com nome próprio." },
    { key: "atracao", name: "Atração de clientes",
      low: "Os clientes chegam quando calha — por isso vives entre meses cheios e meses vazios. Define um canal principal (LinkedIn, recomendações ou parcerias) e reserva 30 minutos por dia só para ele, mesmo quando estás cheio.",
      mid: "Tens alguma presença, mas sem ritmo. Cria um calendário simples: 2 publicações por semana, 5 mensagens a contactos antigos e 1 pedido de recomendação por cada projeto entregue.",
      high: "Tens canais a funcionar. Mede de onde vem cada cliente e duplica o canal com melhor retorno antes de abrires um novo." },
    { key: "conversao", name: "Conversão",
      low: "Estás a perder clientes entre a primeira conversa e a proposta. Na próxima reunião, fala menos de ti: pergunta qual é o problema, quanto custa não o resolver, para quando precisam e quem decide. Só depois apresentas a solução.",
      mid: "As conversas correm bem, mas há propostas que morrem em silêncio. Antes de enviares a proposta, marca logo a reunião para a rever em conjunto — e faz seguimento ao 3.º e ao 7.º dia.",
      high: "Convertes bem. Aproveita para subir a fasquia: menos propostas, mais qualificadas, e opções de valor (base, recomendada, premium)." },
    { key: "preco", name: "Preço e valor",
      low: "Estás a vender horas — e as horas têm teto. Passa a cobrar por projeto ou pacote com resultado definido, e nunca dês desconto sem retirar âmbito.",
      mid: "Já cobras por projeto, mas o preço ainda nasce das horas. Calcula o valor do resultado para o cliente e cria 3 opções; a do meio deve ser a que queres vender.",
      high: "Tens um preço baseado em valor. Revê-o a cada 6 meses e sobe sempre que a agenda esteja acima de 80%." },
    { key: "sistema", name: "Sistema comercial",
      low: "As vendas vivem na tua cabeça — e o que não está escrito esquece-se. Coloca todas as oportunidades num pipeline com próximo passo e data, e bloqueia 2 horas fixas por semana para vendas.",
      mid: "Tens algum controlo, mas sem números. Define a meta mensal, a tua taxa de fecho e quantas reuniões precisas por mês — e acompanha isso todas as semanas.",
      high: "Tens um sistema. Automatiza os seguimentos e revê o funil todos os meses para encontrar onde estás a perder mais." },
  ],
  questions: [
    { area: "posicionamento", text: "Quando te perguntam «o que fazes?», respondes…", options: o("Depende — faço um pouco de tudo", "Digo a minha profissão (designer, programador…)", "Digo a profissão e o tipo de cliente com quem trabalho", "Digo que problema resolvo, para quem e com que resultado") },
    { area: "posicionamento", text: "O teu cliente ideal é…", options: o("Qualquer pessoa que me pague", "Tenho uma ideia vaga", "Sei o setor e a dimensão", "Sei quem é, o que o preocupa e onde o encontrar") },
    { area: "atracao", text: "De onde vieram os teus últimos 5 clientes?", options: o("Apareceram por acaso", "Quase todos de 1 ou 2 contactos", "Recomendações e alguma presença online", "De pelo menos 2 canais que trazem pedidos todos os meses") },
    { area: "atracao", text: "Com que regularidade publicas conteúdo ou contactas potenciais clientes?", options: o("Quase nunca", "Só quando tenho pouco trabalho", "Algumas vezes por mês", "Todas as semanas, com um plano") },
    { area: "atracao", text: "Pedes recomendações aos clientes satisfeitos?", options: o("Nunca", "Raramente — fico sem jeito", "Às vezes, no fim do projeto", "Sempre, num momento e de uma forma definidos") },
    { area: "conversao", text: "Numa primeira reunião com um potencial cliente, tu…", options: o("Explico o que faço e digo o preço", "Respondo às perguntas que me fazem", "Faço perguntas sobre o projeto", "Conduzo um diagnóstico: problema, impacto, prazo, decisão e orçamento") },
    { area: "conversao", text: "De cada 10 propostas que envias, quantas fecham?", options: o("Menos de 2", "2 a 3", "4 a 5", "Mais de 5") },
    { area: "conversao", text: "Depois de enviares uma proposta…", options: o("Espero que me respondam", "Envio um email se passar muito tempo", "Faço 1 ou 2 seguimentos", "Já tenho a reunião de decisão marcada e um seguimento definido") },
    { area: "preco", text: "Como defines o teu preço?", options: o("Pelo que os outros cobram ou pelo que acho que aceitam", "Por hora", "Por projeto, a partir das horas estimadas", "Pelo valor do resultado para o cliente, com pacotes") },
    { area: "preco", text: "Quando um cliente diz «está caro»…", options: o("Baixo o preço", "Dou um desconto para não o perder", "Explico tudo o que está incluído", "Ajusto o âmbito — o valor não desce sem retirar trabalho") },
    { area: "sistema", text: "Como acompanhas as tuas oportunidades?", options: o("De cabeça", "No email e no WhatsApp", "Numa folha de cálculo", "Num pipeline com próximo passo e data em cada uma") },
    { area: "sistema", text: "Quanto tempo por semana dedicas a vendas quando estás cheio de trabalho?", options: o("Zero", "Menos de 1 hora", "1 a 2 horas", "Um bloco fixo todas as semanas, aconteça o que acontecer") },
    { area: "sistema", text: "Sabes quanto precisas de vender por mês e quantas reuniões isso exige?", options: o("Não", "Tenho uma ideia", "Sei quanto quero faturar", "Sei a meta, a taxa de fecho e as reuniões necessárias") },
  ],
  levels: [
    { min: 0, name: "Vendas por sorte", text: "O teu talento está a fazer o trabalho todo — as vendas acontecem quando calha. A boa notícia: com 2 ou 3 mudanças simples, o salto é enorme e rápido." },
    { min: 40, name: "Montanha-russa", text: "Tens bases, mas vives entre meses cheios e meses vazios. Falta-te ritmo e método para que os clientes cheguem de forma previsível." },
    { min: 70, name: "Máquina em construção", text: "Já vendes com intenção. Agora é afinar: subir o preço, escolher melhor os clientes e automatizar o que se repete." },
  ],
};

export type Result = { scores: Record<string, number>; total: number; weakest: Area; level: Level };

/** Calcula a pontuação (0–100) por área e total a partir dos índices das respostas. */
export function scoreQuiz(cfg: QuizConfig, answers: number[]): Result {
  const got: Record<string, number> = {}, max: Record<string, number> = {};
  cfg.questions.forEach((q, i) => {
    const top = Math.max(...q.options.map((x) => x.points));
    const pick = q.options[answers[i]];
    max[q.area] = (max[q.area] ?? 0) + top;
    got[q.area] = (got[q.area] ?? 0) + (pick ? pick.points : 0);
  });
  const scores: Record<string, number> = {};
  cfg.areas.forEach((a) => { scores[a.key] = max[a.key] ? Math.round((100 * (got[a.key] ?? 0)) / max[a.key]) : 0; });
  const allMax = Object.values(max).reduce((a, b) => a + b, 0), allGot = Object.values(got).reduce((a, b) => a + b, 0);
  const total = allMax ? Math.round((100 * allGot) / allMax) : 0;
  const weakest = [...cfg.areas].sort((a, b) => scores[a.key] - scores[b.key])[0];
  return { scores, total, weakest, level: levelOf(cfg, total) };
}
export const levelOf = (cfg: QuizConfig, total: number) => [...cfg.levels].sort((a, b) => b.min - a.min).find((l) => total >= l.min) ?? cfg.levels[0];
export const advice = (a: Area, pct: number) => (pct < 40 ? a.low : pct < 70 ? a.mid : a.high);

export const QUIZ_OFFER: Offer = {
  meeting_label: "Marcar a minha reunião 1:1 gratuita",
  email_subject: "O teu diagnóstico de vendas: {{pontuacao}}/100",
  email_body: "Olá {{primeiro_nome}},\n\nObrigado por fazeres o Diagnóstico de Vendas. O teu resultado foi {{pontuacao}}/100 e a área com mais margem para crescer é: {{area_fraca}}.\n\nPodes rever o resultado completo, com as recomendações para cada área, aqui:\n{{link_resultado}}\n\nE como prometido, aqui tens o ebook «Agenda cheia, preço justo»:\n{{link_ebook}}\n\nSe quiseres ir mais rápido, marcamos 30 minutos e eu digo-te os 3 passos que daria no teu lugar, começando por {{area_fraca}}:\n{{link_reuniao}}\n\nAté já,\n{{meu_nome}}",
};
export const EBOOK_OFFER: Offer = {
  meeting_label: "Marcar a minha reunião 1:1 gratuita",
  email_subject: "O teu ebook: Agenda cheia, preço justo",
  email_body: "Olá {{primeiro_nome}},\n\nAqui tens o ebook «Agenda cheia, preço justo — o guia de vendas para freelancers»:\n{{link_ebook}}\n\nUma sugestão: lê primeiro o capítulo 6 (o plano de 30 dias) e escolhe só uma coisa para fazer esta semana.\n\nSe quiseres saber exatamente onde estás a perder clientes, faz o diagnóstico de 3 minutos — ou marca 30 minutos comigo:\n{{link_reuniao}}\n\nUm abraço,\n{{meu_nome}}",
};

export const MAGNET_SEQUENCE: SeqT = {
  key: "diagnostico", name: "Diagnóstico de vendas", description: "Nutrição para quem fez o diagnóstico ou pediu o ebook — leva à reunião 1:1.", stop_on_stage_change: true,
  steps: [
    { delay: 2, channel: "email", subject: "O erro n.º 1 em {{area_fraca}}", body: "Olá {{primeiro_nome}},\n\nNo teu diagnóstico, a área com mais margem foi {{area_fraca}}. É também onde vejo freelancers talentosos a perder mais dinheiro — não por falta de qualidade, mas por falta de método.\n\nO erro mais comum? Tentar resolver tudo ao mesmo tempo. Escolhe uma única ação desta semana (está no teu resultado: {{link_resultado}}) e marca-a já na agenda.\n\nResponde a este email a dizer qual escolheste — eu leio todas as respostas.\n\n{{meu_nome}}" },
    { delay: 2, channel: "whatsapp", body: "Olá {{primeiro_nome}}! Aqui é o {{meu_nome}}. Vi que fizeste o diagnóstico de vendas ({{pontuacao}}/100). Se quiseres, numa conversa de 30 minutos digo-te os 3 passos que eu daria no teu lugar. Faz sentido? 🙂" },
    { delay: 3, channel: "email", subject: "Porque é que cobrar à hora te está a travar", body: "Olá {{primeiro_nome}},\n\nQuando cobras à hora, és castigado por seres rápido e o teu rendimento tem um teto: as horas do dia.\n\nOs freelancers que mais faturam vendem resultados — um pacote com âmbito claro, prazo e preço fechado. O cliente compra certeza; tu ganhas margem.\n\nUm exercício de 10 minutos: pega no teu serviço mais vendido e escreve-o como «Em [prazo], entrego [resultado] por [preço]». Está no capítulo 4 do ebook: {{link_ebook}}\n\n{{meu_nome}}" },
    { delay: 4, channel: "email", subject: "30 minutos para o teu plano de vendas", body: "Olá {{primeiro_nome}},\n\nProponho-te uma reunião 1:1 de 30 minutos, gratuita e sem compromisso:\n\n• revemos o teu diagnóstico ({{pontuacao}}/100);\n• definimos as 3 prioridades para os próximos 90 dias, começando por {{area_fraca}};\n• sais com um plano escrito, quer trabalhemos juntos quer não.\n\nEscolhe o dia que te dá mais jeito: {{link_reuniao}}\n\n{{meu_nome}}" },
    { delay: 3, channel: "task", body: "Ligar a {{nome}}: fez o diagnóstico ({{pontuacao}}/100, fraco em {{area_fraca}}) e ainda não marcou reunião" },
    { delay: 4, channel: "email", subject: "Fecho o assunto?", body: "Olá {{primeiro_nome}},\n\nNão quero encher-te a caixa de correio. Se ainda fizer sentido falarmos sobre as tuas vendas, responde só «sim» e eu trato do resto.\n\nSe não for o momento, está tudo bem — o diagnóstico e o ebook ficam contigo: {{link_resultado}}\n\nBoas vendas,\n{{meu_nome}}" },
  ],
};

export const EBOOK_TITLE = "Agenda cheia, preço justo";
export const EBOOK_SUBTITLE = "O guia de vendas para freelancers que estão cansados de depender da sorte";

export const EBOOK_CONTENT = `## Introdução: o talento não chega

Conheço dezenas de freelancers brilhantes que vivem numa montanha-russa: um mês com mais trabalho do que conseguem fazer, o seguinte a olhar para o email à espera de um pedido. Não é falta de qualidade. É falta de um **sistema de vendas**.

Este guia não é sobre técnicas agressivas nem sobre «vender a qualquer custo». É sobre cinco coisas simples que, feitas com consistência, transformam o teu negócio:

- **Posicionamento** — ser a escolha óbvia para um tipo de cliente.
- **Atração** — ter pedidos todos os meses, não só quando calha.
- **Conversão** — transformar conversas em clientes sem pressão.
- **Preço** — cobrar pelo valor que entregas, não pelas horas que gastas.
- **Sistema** — saber os teus números e ter um ritmo semanal.

No fim tens um plano de 30 dias. Lê tudo uma vez e depois escolhe **uma** ação por semana.

## 1. Posicionamento: deixa de ser «mais um»

Quando dizes «sou designer» ou «sou programador», o cliente coloca-te numa prateleira cheia de alternativas — e a única forma de comparar é o preço.

Quando dizes «ajudo clínicas dentárias a encher a agenda com marcações online», deixas de ter concorrência direta. O cliente certo pensa: «isto é para mim».

**A frase que muda tudo:**

> Ajudo [tipo de cliente] a [resultado concreto] sem [a dor que mais os incomoda].

Escolher um nicho assusta, porque parece que perdes oportunidades. Na prática acontece o contrário: ficas mais memorável, as recomendações tornam-se mais fáceis («conheço a pessoa certa para isso») e podes cobrar mais porque és especialista.

**Ação desta semana:** escreve a tua frase, usa-a na bio do LinkedIn, no site e na próxima vez que te apresentares.

## 2. Atração: pedidos todos os meses

O maior erro dos freelancers é parar de vender quando estão cheios de trabalho. Dois meses depois, o projeto termina e não há nada a seguir.

A solução é um **ritmo mínimo** que nunca falha, mesmo nas semanas mais cheias:

- **Recomendações:** no fim de cada projeto bem-sucedido, pergunta «Conheces mais alguém que esteja a passar pelo mesmo?». Faz disto um passo fixo da entrega.
- **Contactos antigos:** envia 5 mensagens por semana a clientes e contactos antigos. Não para vender — para saber como estão. Muitas oportunidades nascem daqui.
- **Conteúdo:** 2 publicações por semana num único canal. Mostra casos reais, erros comuns do teu cliente e o teu processo.
- **Parcerias:** identifica 3 profissionais que servem o mesmo cliente que tu, mas com serviços diferentes (ex.: um contabilista para um consultor financeiro). Combinem recomendar-se.

**Ação desta semana:** escolhe um canal principal e bloqueia 30 minutos por dia na agenda para ele.

## 3. Conversão: vender sem parecer vendedor

A primeira reunião não é para apresentares o teu portefólio. É para perceberes se consegues ajudar. Quem faz as melhores perguntas, ganha.

**As 5 perguntas do diagnóstico:**

1. Qual é o problema que te fez procurar ajuda agora?
2. O que acontece se não resolveres isto nos próximos 3 meses?
3. O que já tentaste e porque não resultou?
4. Para quando precisas de resultados?
5. Quem mais está envolvido na decisão e que orçamento tens em mente?

Fala 30% do tempo e ouve 70%. No fim, resume o que ouviste por palavras tuas — o cliente vai sentir que finalmente alguém percebeu o problema dele.

**Nunca envies uma proposta «para o ar».** Antes de desligar, marca logo a reunião para a rever em conjunto. As propostas apresentadas fecham muito mais do que as enviadas por email.

**Seguimento:** se não houver resposta, escreve ao 3.º dia e ao 7.º. Curto, útil e sem pressão: «Ficou alguma dúvida que eu possa esclarecer?».

## 4. Preço: cobra pelo valor, não pelas horas

Cobrar à hora tem três problemas: tens um teto de rendimento, és castigado por seres rápido e o cliente fica a contar minutos.

**Passa a vender pacotes com resultado:**

> Em [prazo], entrego [resultado] por [preço fechado].

**Usa sempre 3 opções:**

- **Essencial** — o mínimo que resolve o problema.
- **Recomendada** — a que queres vender, com o melhor equilíbrio.
- **Premium** — mais rapidez, mais acompanhamento ou mais resultados.

A maioria escolhe a do meio, e a opção premium faz a recomendada parecer razoável.

**Quando dizem «está caro»:** não baixes o preço — ajusta o âmbito. «Consigo fazer por esse valor se retirarmos X.» Assim proteges o teu valor e o cliente continua a decidir.

**Ação desta semana:** reescreve o teu serviço mais vendido como um pacote com 3 opções.

## 5. Sistema: os números que te dão paz

Vender com previsibilidade é matemática simples. Responde a estas três perguntas:

- Quanto quero faturar por mês?
- Qual é o valor médio de um projeto?
- De cada 10 reuniões, quantas se tornam clientes?

**Exemplo:** queres faturar 5 000 € por mês e o teu projeto médio é de 1 250 €. Precisas de 4 clientes. Se fechas 3 em cada 10 reuniões, precisas de cerca de 13 reuniões por mês — **3 por semana**.

De repente, «vender mais» deixa de ser uma preocupação vaga e passa a ser uma meta clara: 3 reuniões por semana.

**O teu ritmo semanal (2 horas):**

- Segunda: rever o pipeline — cada oportunidade tem próximo passo e data?
- Terça a quinta: 30 minutos por dia no canal principal.
- Sexta: seguimentos de propostas e 1 pedido de recomendação.

Usa um pipeline (CRM) com etapas simples: Contacto → Reunião → Proposta → Ganho/Perdido. O que não está escrito, esquece-se.

## 6. O plano de 30 dias

**Semana 1 — Posicionamento**
Escreve a tua frase de posicionamento e atualiza o LinkedIn e o site.

**Semana 2 — Atração**
Envia 5 mensagens a contactos antigos e pede 1 recomendação a um cliente satisfeito.

**Semana 3 — Conversão e preço**
Prepara o teu guião das 5 perguntas e transforma o teu serviço principal num pacote com 3 opções.

**Semana 4 — Sistema**
Calcula quantas reuniões precisas por mês, coloca todas as oportunidades num pipeline e bloqueia as tuas 2 horas semanais de vendas.

## Próximo passo

Ler sobre vendas é fácil. Aplicar sozinho, no meio do trabalho dos clientes, é que é difícil.

Se quiseres, marcamos uma **reunião 1:1 gratuita de 30 minutos**: revemos onde estás, escolhemos as 3 prioridades para os próximos 90 dias e sais com um plano escrito — quer trabalhemos juntos, quer não.`;
