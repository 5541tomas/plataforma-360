"use client";
import { useState } from "react";

export function ScoreRange({ name, label, initial }: { name: string; label: string; initial: number }) {
  const [v, setV] = useState(initial);
  return (
    <>
      <input type="range" name={name} min={1} max={10} value={v} onChange={(e) => setV(Number(e.target.value))} className="w-full accent-[#0071E3]" aria-label={label} />
      <output className="text-right text-sm font-semibold">{v}</output>
    </>
  );
}
