import { getContext } from "@/lib/context";
import { PageHeader } from "@/components/ui";
import { Chat } from "./Chat";

export default async function AssistentePage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await getContext();
  const { q } = await searchParams;
  const configured = !!process.env.ANTHROPIC_API_KEY;
  return (
    <>
      <PageHeader eyebrow="Inteligência artificial" title="Assistente" />
      <p className="text-sm text-muted -mt-3">Responde com base nos teus dados (só os módulos a que tens acesso). As conversas não ficam guardadas.</p>
      {configured ? <Chat initial={q} /> : (
        <div className="card text-sm">O assistente está pronto, mas falta configurar a chave da API da Anthropic (<code>ANTHROPIC_API_KEY</code>) no servidor.</div>
      )}
    </>
  );
}
