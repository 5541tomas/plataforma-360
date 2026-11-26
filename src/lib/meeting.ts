import { waLink } from "./whatsapp";
export type MeetingInfo = { booking_url?: string | null; meeting_url: string | null; meeting_label: string | null; phone: string | null; email: string; first_name: string | null; title: string };
/** Link para marcar a reunião: link de agendamento, senão WhatsApp, senão email. */
export function meetingHref(m: MeetingInfo, total?: number | null, weakest?: string | null) {
  if (m.meeting_url) return { href: m.meeting_url, external: true };
  if (m.booking_url) return { href: m.booking_url, external: false };
  const msg = `Olá! Sou ${m.first_name ?? ""} e fiz o ${m.title}${total != null ? ` (${total}/100${weakest ? `, área mais fraca: ${weakest}` : ""})` : ""}. Gostava de marcar a reunião 1:1 de 30 minutos.`;
  if (m.phone) return { href: waLink(m.phone, msg), external: true };
  return { href: `mailto:${m.email}?subject=${encodeURIComponent("Reunião 1:1")}&body=${encodeURIComponent(msg)}`, external: false };
}
