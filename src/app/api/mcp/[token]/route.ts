import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

/** Servidor MCP (Streamable HTTP, respostas JSON) da Plataforma 360. O token pessoal vai no URL. */
const TOOLS = [
  { name: "resumo_do_dia", description: "Resumo do dia na Plataforma 360: tarefas para hoje e em atraso, pipeline, negócios a arrefecer e liquidez.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "estado_da_meta", description: "Progresso da meta anual de faturação e dos Key Results do objetivo anual.", inputSchema: { type: "object", properties: { ano: { type: "integer", description: "Ano (opcional)" } }, additionalProperties: false } },
  { name: "procurar", description: "Procura negócios e contactos no CRM por nome, empresa ou email.", inputSchema: { type: "object", properties: { texto: { type: "string" } }, required: ["texto"], additionalProperties: false } },
  { name: "criar_negocio", description: "Cria uma oportunidade no CRM. Se indicares um produto do catálogo, o tipo e o preço vêm dele.", inputSchema: { type: "object", properties: { titulo: { type: "string" }, produto: { type: "string", description: "Nome (ou parte) de um produto do catálogo" }, valor: { type: "number", description: "Valor em euros sem IVA (mensal se for avença)" }, empresa: { type: "string" }, tipo: { type: "string", enum: ["one_off", "retainer"] }, fecho_previsto: { type: "string", description: "AAAA-MM-DD" }, origem: { type: "string" } }, required: ["titulo"], additionalProperties: false } },
  { name: "marcar_ganho", description: "Marca um negócio aberto como ganho (dispara receita recorrente, objetivos e onboarding).", inputSchema: { type: "object", properties: { negocio: { type: "string", description: "Nome (ou parte) do negócio" }, valor: { type: "number", description: "Valor final, se mudou" } }, required: ["negocio"], additionalProperties: false } },
  { name: "registar_nota", description: "Regista uma nota, chamada, email ou reunião no histórico de um negócio, com follow-up opcional.", inputSchema: { type: "object", properties: { negocio: { type: "string" }, texto: { type: "string" }, tipo: { type: "string", enum: ["note", "call", "email", "meeting"] }, follow_up: { type: "string", description: "Data do próximo follow-up AAAA-MM-DD" } }, required: ["negocio", "texto"], additionalProperties: false } },
  { name: "criar_tarefa", description: "Cria uma tarefa pessoal.", inputSchema: { type: "object", properties: { titulo: { type: "string" }, prazo: { type: "string", description: "AAAA-MM-DD (por omissão hoje)" } }, required: ["titulo"], additionalProperties: false } },
  { name: "registar_movimento", description: "Regista um movimento financeiro. Valor positivo = entrada, negativo = despesa.", inputSchema: { type: "object", properties: { descricao: { type: "string" }, valor: { type: "number" }, conta: { type: "string", description: "Nome ou banco da conta (opcional)" }, ambito: { type: "string", enum: ["business", "personal"] }, categoria: { type: "string" }, data: { type: "string", description: "AAAA-MM-DD" } }, required: ["descricao", "valor"], additionalProperties: false } },
];

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const rpcError = (id: unknown, code: number, message: string) => json({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let msg: { id?: unknown; method?: string; params?: { name?: string; arguments?: Record<string, unknown> } };
  try { msg = await req.json(); } catch { return rpcError(null, -32700, "JSON inválido"); }
  if (Array.isArray(msg)) return rpcError(null, -32600, "Pedidos em lote não suportados");
  const { id, method } = msg;

  if (method === "initialize") {
    return json({ jsonrpc: "2.0", id, result: { protocolVersion: "2025-06-18", capabilities: { tools: { listChanged: false } }, serverInfo: { name: "plataforma-360", version: "1.0.0" },
      instructions: "Plataforma 360 do utilizador: objetivos, finanças e CRM. Responde em português de Portugal. Antes de marcar negócios como ganhos ou registar movimentos, confirma os detalhes com o utilizador." } });
  }
  if (method?.startsWith("notifications/")) return new Response(null, { status: 202 });
  if (method === "ping") return json({ jsonrpc: "2.0", id, result: {} });
  if (method === "tools/list") return json({ jsonrpc: "2.0", id, result: { tools: TOOLS } });
  if (method === "tools/call") {
    const name = msg.params?.name ?? "";
    if (!TOOLS.some((t) => t.name === name)) return rpcError(id, -32602, `Ferramenta desconhecida: ${name}`);
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { db: { schema: "p360" }, auth: { persistSession: false } });
    const { data, error } = await supabase.rpc("mcp_call", { p_token: token, p_tool: name, p_args: msg.params?.arguments ?? {} });
    if (error) return json({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: `Erro: ${error.message}` }], isError: true } });
    return json({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: (data as { text: string }).text }] } });
  }
  return rpcError(id, -32601, `Método não suportado: ${method}`);
}

export async function GET() {
  return new Response("Plataforma 360 · servidor MCP. Usa POST (Streamable HTTP).", { status: 405, headers: { Allow: "POST" } });
}
