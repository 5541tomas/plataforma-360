import { waLink, type WaTemplate } from "@/lib/whatsapp";

export function WaIcon({ size = 16 }: { size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2a10 10 0 00-8.6 15.1L2 22l5-1.3A10 10 0 1012 2zm0 18.2a8.2 8.2 0 01-4.2-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1112 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 01-3.3-2.9c-.3-.4.2-.4.7-1.4.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 00-.7.3 3 3 0 00-.9 2.2 5.2 5.2 0 001.1 2.7 11.8 11.8 0 004.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 001.8-1.2 2.2 2.2 0 00.1-1.3c0-.1-.2-.2-.5-.3z" />
    </svg>
  );
}

/** Lista de mensagens prontas: cada uma abre o WhatsApp com o texto escrito */
export function WhatsAppMenu({ phone, templates, label = "WhatsApp" }: { phone?: string | null; templates: WaTemplate[]; label?: string }) {
  return (
    <details className="relative">
      <summary className="list-none cursor-pointer [&::-webkit-details-marker]:hidden inline-flex items-center gap-2 rounded-xl min-h-11 px-4 text-sm font-semibold text-white bg-[#128C4A] hover:brightness-110">
        <WaIcon /> {label}
      </summary>
      <div className="absolute right-0 z-20 mt-2 w-[min(92vw,340px)] card !p-2 shadow-xl border border-line">
        {!phone && <p className="px-3 py-2 text-xs text-warn">Este contacto não tem telemóvel: vais escolher o destinatário no WhatsApp.</p>}
        {templates.map((t) => (
          <a key={t.label} href={waLink(phone, t.text)} target="_blank" rel="noopener noreferrer" className="flex flex-col gap-0.5 rounded-xl px-3 py-2.5 hover:bg-soft">
            <span className="text-sm font-medium">{t.label}</span>
            <span className="line-clamp-2 text-xs text-muted">{t.text}</span>
          </a>
        ))}
      </div>
    </details>
  );
}
