"use client";
export function PrintButton() {
  return <button onClick={() => window.print()} className="btn">Guardar PDF / Imprimir</button>;
}
