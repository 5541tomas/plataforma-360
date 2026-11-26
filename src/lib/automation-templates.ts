export type StepT = { delay: number; channel: "email" | "whatsapp" | "task"; subject?: string; body: string };
export type SeqT = { key: string; name: string; description: string; for_closed_deals?: boolean; stop_on_stage_change?: boolean; steps: StepT[] };

/** Sequências iniciais (editáveis). Variáveis: {{nome}} {{primeiro_nome}} {{empresa}} {{produto}} {{negocio}} {{meu_nome}} */
export const SEQUENCES: SeqT[] = [
  {
    key: "lead", name: "Lead novo", description: "Para quem preenche o formulário ou pede informação.", stop_on_stage_change: true,
    steps: [
      { delay: 0, channel: "email", subject: "Recebi o teu pedido, {{primeiro_nome}}", body: "Olá {{primeiro_nome}},\n\nObrigado pelo teu contacto — recebi o teu pedido e vou olhar para ele com atenção.\n\nPara a nossa conversa ser útil desde o primeiro minuto, conta-me em duas linhas:\n1. Qual é hoje o maior desafio na tua empresa (ou no teu negócio)?\n2. O que tem de mudar nos próximos 3 meses para dizeres que valeu a pena?\n\nBasta responderes a este email.\n\nAté já,\n{{meu_nome}}" },
      { delay: 0, channel: "whatsapp", body: "Olá {{primeiro_nome}}! Aqui é o {{meu_nome}}. Recebi o teu pedido e enviei-te um email com duas perguntas rápidas. Se preferires, podemos falar por aqui 🙂" },
      { delay: 2, channel: "email", subject: "Como costumo ajudar em casos como o teu", body: "Olá {{primeiro_nome}},\n\nA maior parte das pessoas que me procura está numa de três situações: cresceu e perdeu o controlo do dia a dia, tem a equipa desalinhada, ou sabe o que quer mas não consegue pôr em prática.\n\nO meu trabalho é sempre o mesmo: clarificar prioridades, transformar isso num plano simples e acompanhar a execução até os resultados aparecerem.\n\nSe te revês em alguma destas situações, responde a este email com a que se aplica — digo-te por onde eu começaria.\n\n{{meu_nome}}" },
      { delay: 3, channel: "email", subject: "20 minutos esta semana?", body: "Olá {{primeiro_nome}},\n\nProponho uma conversa de 20 minutos, sem compromisso, para perceber o teu ponto de partida e dizer-te honestamente se te consigo ajudar.\n\nQue dia e hora te dão mais jeito esta semana ou na próxima?\n\n{{meu_nome}}" },
      { delay: 4, channel: "task", body: "Ligar a {{nome}} — não respondeu à sequência de lead novo" },
      { delay: 3, channel: "email", subject: "Fecho o assunto?", body: "Olá {{primeiro_nome}},\n\nNão quero insistir demasiado — imagino que estejas com muita coisa.\n\nSe ainda fizer sentido falarmos, responde só “sim” e eu trato do resto. Se não for o momento, também está tudo bem: fico por aqui e não volto a escrever sobre isto.\n\nUm abraço,\n{{meu_nome}}" },
    ],
  },
  {
    key: "proposta", name: "Depois da proposta", description: "Acompanhamento depois de a proposta ser enviada.", stop_on_stage_change: true,
    steps: [
      { delay: 3, channel: "email", subject: "Alguma dúvida sobre a proposta?", body: "Olá {{primeiro_nome}},\n\nQueria saber se tiveste oportunidade de ler a proposta para {{empresa}} e se ficou alguma dúvida.\n\nSe for útil, posso explicar em 15 minutos por telefone ou videochamada — às vezes é mais rápido do que por escrito.\n\n{{meu_nome}}" },
      { delay: 3, channel: "whatsapp", body: "Olá {{primeiro_nome}}, tudo bem? Só para saber se a proposta chegou bem e se posso ajudar com alguma questão. {{meu_nome}}" },
      { delay: 4, channel: "email", subject: "Uma ideia para começar", body: "Olá {{primeiro_nome}},\n\nSe o investimento ou o momento forem a dúvida, há forma de começar mais pequeno e crescer a partir dos primeiros resultados. Diz-me o que te faria avançar com confiança e eu adapto a proposta.\n\n{{meu_nome}}" },
    ],
  },
  {
    key: "reativacao", name: "Reativação", description: "Para leads perdidas há algum tempo.", for_closed_deals: true, stop_on_stage_change: false,
    steps: [
      { delay: 0, channel: "email", subject: "Ainda faz sentido, {{primeiro_nome}}?", body: "Olá {{primeiro_nome}},\n\nHá uns tempos falámos sobre {{produto}}. Na altura não era o momento — e está tudo bem.\n\nComo estão as coisas agora? Se os desafios de que falámos continuam (ou mudaram), gostava de ouvir. Se quiseres, marcamos 20 minutos para eu te dar a minha leitura, sem compromisso.\n\n{{meu_nome}}" },
      { delay: 7, channel: "whatsapp", body: "Olá {{primeiro_nome}}! Enviei-te um email há uns dias. Se fizer sentido retomarmos a conversa, diz-me 🙂 {{meu_nome}}" },
      { delay: 7, channel: "task", body: "Decidir próximo passo com {{nome}} (reativação sem resposta)" },
    ],
  },
  {
    key: "checkin", name: "Acompanhamento de clientes", description: "Contacto periódico com clientes: resultados, testemunho e recomendações.", for_closed_deals: true, stop_on_stage_change: false,
    steps: [
      { delay: 0, channel: "email", subject: "Como estão as coisas, {{primeiro_nome}}?", body: "Olá {{primeiro_nome}},\n\nPassou algum tempo desde que trabalhámos juntos e lembrei-me de ti. Como estão os resultados — o que se manteve e o que voltou a ser difícil?\n\nSe houver alguma coisa em que possa ajudar, responde a este email. E se conheceres alguém que esteja a passar pelo que tu passaste, uma apresentação vale-me muito.\n\nUm abraço,\n{{meu_nome}}" },
      { delay: 3, channel: "task", body: "Ligar a {{nome}}: acompanhamento de cliente (resultados, continuidade, recomendações)" },
    ],
  },
];

export type RuleT = { name: string; trigger: string; trigger_config: Record<string, unknown>; action: string; action_config: Record<string, unknown> | ((seq: Record<string, string>) => Record<string, unknown>); active?: boolean };
export const RULES: RuleT[] = [
  { name: "Lead do formulário → sequência Lead novo", trigger: "form_lead", trigger_config: {}, action: "enroll", action_config: (s) => ({ sequence_id: s.lead }) },
  { name: "Entrou em Proposta → sequência Depois da proposta", trigger: "stage_enter", trigger_config: { stage: "Proposta" }, action: "enroll", action_config: (s) => ({ sequence_id: s.proposta }) },
  { name: "Perdido há 60 dias → Reativação", trigger: "lost_after_days", trigger_config: { days: 60 }, action: "enroll", action_config: (s) => ({ sequence_id: s.reativacao }) },
  { name: "Cliente a cada 90 dias → Acompanhamento", trigger: "client_every_days", trigger_config: { days: 90 }, action: "enroll", action_config: (s) => ({ sequence_id: s.checkin }) },
  { name: "Negócio parado 14 dias → tarefa", trigger: "inactive_days", trigger_config: { days: 14 }, action: "task", action_config: { title: "Retomar contacto: {{negocio}}", days: 0 } },
];
