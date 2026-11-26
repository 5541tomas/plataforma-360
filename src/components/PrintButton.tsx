"use client";
export function PrintButton({ label = "Guardar em PDF" }: { label?: string }) {
  return <button onClick={() => window.print()} className="btn-ghost no-print">{label}</button>;
}
