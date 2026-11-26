"use client";
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="pt-PT"><body style={{ fontFamily: "-apple-system, Helvetica, Arial, sans-serif", background: "#F5F5F7", display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#fff", borderRadius: 20, padding: 32, textAlign: "center", maxWidth: 420 }}>
        <h1 style={{ fontSize: 20 }}>Algo correu mal</h1>
        <p style={{ color: "#6E6E73", fontSize: 14 }}>Recarrega a página. Se o problema continuar, tenta daqui a uns minutos.</p>
        <button onClick={reset} style={{ background: "#0071E3", color: "#fff", border: 0, borderRadius: 12, padding: "12px 18px", fontWeight: 600 }}>Tentar novamente</button>
      </div>
    </body></html>
  );
}
