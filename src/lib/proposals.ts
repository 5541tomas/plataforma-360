export type Item = { descricao: string; qtd: number; preco: number };
export type Phase = { nome: string; duracao: string; descricao: string };
export const MAX_ITEMS = 10;
export const MAX_PHASES = 6;

/** Estrutura sugerida (fases e objetivos) conforme o produto do negócio */
export function templateFor(productName: string | null, kind: "retainer" | "one_off") {
  const n = (productName ?? "").toLowerCase();
  if (n.includes("8 sess")) return {
    objectives: ["Clarificar a situação atual e as prioridades", "Definir um plano de ação concreto e mensurável", "Implementar as mudanças com acompanhamento próximo", "Garantir autonomia e resultados sustentáveis no fim do programa"],
    phases: [
      { nome: "Diagnóstico", duracao: "Sessão 1", descricao: "Levantamento da situação atual, objetivos e obstáculos. Definição de indicadores de sucesso." },
      { nome: "Plano de ação", duracao: "Sessões 2–3", descricao: "Desenho das prioridades, do plano e dos primeiros passos, com metas para cada etapa." },
      { nome: "Implementação acompanhada", duracao: "Sessões 4–7", descricao: "Execução com acompanhamento, ajustes semanais e resolução de bloqueios." },
      { nome: "Consolidação", duracao: "Sessão 8", descricao: "Revisão de resultados, plano de continuidade e autonomia." },
    ],
  };
  if (n.includes("tarde") || n.includes("forma")) return {
    objectives: ["Dar à equipa ferramentas práticas aplicáveis no dia seguinte", "Alinhar a equipa numa linguagem e método comuns", "Sair com compromissos de ação concretos"],
    phases: [
      { nome: "Preparação", duracao: "1 semana antes", descricao: "Conversa com a liderança e questionário rápido à equipa para adaptar os conteúdos." },
      { nome: "Formação", duracao: "1 tarde (4 horas)", descricao: "Sessão presencial prática, com exercícios aplicados à realidade da empresa." },
      { nome: "Follow-up", duracao: "2 semanas depois", descricao: "Resumo, materiais e verificação dos compromissos assumidos." },
    ],
  };
  if (n.includes("imers")) return {
    objectives: ["Estruturar a oferta e o posicionamento", "Criar um sistema simples de angariação de clientes", "Sair com um plano para os próximos 90 dias"],
    phases: [
      { nome: "Fundações", duracao: "Semanas 1–2", descricao: "Posicionamento, oferta e preço." },
      { nome: "Angariação", duracao: "Semanas 3–5", descricao: "Canais, mensagens e rotina comercial." },
      { nome: "Entrega e escala", duracao: "Semanas 6–8", descricao: "Processos, finanças e plano de 90 dias." },
    ],
  };
  if (kind === "retainer") return {
    objectives: ["Dar continuidade aos resultados alcançados", "Ter apoio regular na tomada de decisão", "Rever indicadores e prioridades todos os meses"],
    phases: [
      { nome: "Arranque", duracao: "Mês 1", descricao: "Alinhamento de prioridades e indicadores para o período." },
      { nome: "Acompanhamento mensal", duracao: "Todos os meses", descricao: "Sessões regulares, apoio entre sessões e acompanhamento de indicadores." },
      { nome: "Revisão", duracao: "Trimestral", descricao: "Balanço de resultados e ajuste do plano." },
    ],
  };
  return {
    objectives: ["Clarificar o ponto de partida", "Definir e executar as prioridades", "Medir os resultados"],
    phases: [
      { nome: "Diagnóstico", duracao: "", descricao: "Levantamento da situação atual e objetivos." },
      { nome: "Implementação", duracao: "", descricao: "Execução do plano com acompanhamento." },
      { nome: "Revisão", duracao: "", descricao: "Balanço e próximos passos." },
    ],
  };
}
