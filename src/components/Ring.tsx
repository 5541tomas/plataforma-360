/** Anel de progresso em SVG (servidor). `marker` desenha um segundo arco claro (ex.: onde devias estar). */
export function Ring({ value, size = 56, stroke = 6, color = "#0071E3", track = "#EDEDF0", marker, label, children }: {
  value: number; size?: number; stroke?: number; color?: string; track?: string; marker?: number; label?: string; children?: React.ReactNode;
}) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, f = Math.max(0, Math.min(1, value));
  return (
    <svg role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true} width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
      {marker !== undefined && <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#C7D9F5" strokeWidth={stroke} strokeDasharray={`${c * Math.max(0, Math.min(1, marker))} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />}
      {f > 0 && <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${c * f} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />}
      {children}
    </svg>
  );
}
