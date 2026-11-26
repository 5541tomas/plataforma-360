"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { generateCoach } from "@/app/(app)/revisao/actions";

export function CoachButton({ offset, label }: { offset: number; label: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  return (
    <div className="flex flex-col gap-2">
      <button disabled={pending} onClick={() => start(async () => { setError(null); const r = await generateCoach(offset); if (r.ok) router.refresh(); else setError(r.error ?? "Erro"); })} className="btn self-start disabled:opacity-50">
        {pending ? "O coach está a analisar…" : label}
      </button>
      {error && <p role="alert" className="text-sm text-warn">{error}</p>}
    </div>
  );
}
