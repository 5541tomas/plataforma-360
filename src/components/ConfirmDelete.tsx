"use client";
import { useState } from "react";

/** Botão de apagar em dois passos (a confirmação aparece no próprio lugar). */
export function ConfirmDelete({ action, id, label = "Apagar", warning }: { action: (fd: FormData) => Promise<void>; id: string; label?: string; warning: string }) {
  const [ask, setAsk] = useState(false);
  if (!ask) return <button type="button" onClick={() => setAsk(true)} className="text-sm font-medium text-muted hover:text-warn">{label}</button>;
  return (
    <form action={action} className="flex flex-wrap items-center gap-2 rounded-xl bg-warn-soft px-3 py-2 text-sm text-warn">
      <input type="hidden" name="id" value={id} />
      <span>{warning}</span>
      <button className="rounded-lg bg-warn px-3 py-1.5 font-semibold text-white">Sim, apagar</button>
      <button type="button" onClick={() => setAsk(false)} className="px-2 py-1.5 font-medium text-ink-2">Cancelar</button>
    </form>
  );
}
