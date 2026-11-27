// Origem das leads: canal (utm_source / origem) e campanha
export const CHANNELS: { key: string; label: string; hint: string }[] = [
  { key: "instagram", label: "Instagram", hint: "bio, stories, publicações" },
  { key: "linkedin", label: "LinkedIn", hint: "perfil, publicações" },
  { key: "facebook", label: "Facebook / anúncios Meta", hint: "" },
  { key: "google", label: "Google", hint: "anúncios ou pesquisa" },
  { key: "email", label: "Email / newsletter", hint: "" },
  { key: "whatsapp", label: "WhatsApp", hint: "estados, grupos" },
  { key: "evento", label: "Evento / QR code", hint: "palestras, workshops" },
  { key: "referencia", label: "Recomendação", hint: "parceiros, clientes" },
  { key: "youtube", label: "YouTube", hint: "" },
  { key: "tiktok", label: "TikTok", hint: "" },
];
const ALIAS: Record<string, string> = { ig: "instagram", insta: "instagram", li: "linkedin", fb: "facebook", meta: "facebook", gads: "google", newsletter: "email", wa: "whatsapp", qr: "evento", yt: "youtube", recomendacao: "referencia", parceiro: "referencia" };
export const channelLabel = (k?: string | null) => CHANNELS.find((c) => c.key === k)?.label ?? (k === "direto" || !k ? "Direto / sem origem" : k.charAt(0).toUpperCase() + k.slice(1));

export type Utm = { source?: string; medium?: string; campaign?: string };
/** Lê a origem dos parâmetros do link (aceita ?origem=, ?utm_source=, ?utm_campaign=) */
export function utmFrom(sp: Record<string, string | string[] | undefined>): Utm | null {
  const v = (k: string) => { const x = sp[k]; return (Array.isArray(x) ? x[0] : x)?.trim().slice(0, 80) || undefined; };
  let source = (v("utm_source") ?? v("origem") ?? v("src"))?.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9_-]/g, "");
  if (source) source = ALIAS[source] ?? source;
  const u: Utm = { source, medium: v("utm_medium"), campaign: v("utm_campaign") ?? v("campanha") };
  return u.source || u.campaign ? u : null;
}
