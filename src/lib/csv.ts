/** Parser de CSV tolerante a extratos bancários portugueses. Corre no browser e no servidor. */

export function detectDelimiter(text: string) {
  const sample = text.split(/\r?\n/).slice(0, 15).join("\n");
  const counts = [";", ",", "\t", "|"].map((d) => [d, (sample.match(new RegExp(d === "|" ? "\\|" : d, "g")) ?? []).length] as const);
  return counts.sort((a, b) => b[1] - a[1])[0][0];
}

export function parseCsv(text: string, delimiter = detectDelimiter(text)): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === delimiter) { row.push(field.trim()); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field.trim()); field = "";
      if (row.some((f) => f !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field.trim());
  if (row.some((f) => f !== "")) rows.push(row);
  return rows;
}

/** "1.234,56" | "-1234.56" | "1 234,56 €" | "(12,00)" -> número */
export function parseAmount(raw: string | undefined): number | null {
  if (!raw) return null;
  let s = raw.replace(/[€\s ]/g, "").replace(/EUR/i, "");
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (s.endsWith("-")) { neg = true; s = s.slice(0, -1); }
  if (s.startsWith("-")) { neg = !neg; s = s.slice(1); } else if (s.startsWith("+")) s = s.slice(1);
  if (!/\d/.test(s)) return null;
  const lastComma = s.lastIndexOf(","), lastDot = s.lastIndexOf(".");
  if (lastComma > lastDot) s = s.replace(/\./g, "").replace(",", ".");
  else if (lastDot > lastComma && lastComma >= 0) s = s.replace(/,/g, "");
  else if (lastComma === -1 && (s.match(/\./g) ?? []).length > 1) s = s.replace(/\./g, "");
  const n = Number(s);
  if (Number.isNaN(n)) return null;
  return neg ? -n : n;
}

/** dd-mm-aaaa, dd/mm/aaaa, dd.mm.aaaa, aaaa-mm-dd, dd-mm-aa -> aaaa-mm-dd */
export function parseDate(raw: string | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim().slice(0, 10);
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = raw.trim().match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    const d = Number(m[1]), mo = Number(m[2]);
    if (mo > 12 || d > 31) return null;
    return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  return null;
}

export type Mapping = { header: number; date: number; description: number; amount: number; debit: number; credit: number };

/** Tenta adivinhar a linha de cabeçalho e as colunas a partir dos nomes usuais dos bancos PT */
export function guessMapping(rows: string[][]): Mapping {
  const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  let header = rows.findIndex((r) => r.some((c) => /data|date/.test(norm(c))) && r.some((c) => /descri|movimento|designa|narrativa/.test(norm(c))));
  if (header < 0) header = 0;
  const h = (rows[header] ?? []).map(norm);
  const find = (re: RegExp, exclude?: RegExp) => h.findIndex((c) => re.test(c) && !(exclude && exclude.test(c)));
  return {
    header,
    date: find(/data (mov|oper|lanc)|^data$|data$|date/, /valor/) >= 0 ? find(/data (mov|oper|lanc)|^data$|data$|date/, /valor/) : find(/data/),
    description: find(/descri|movimento|designa|narrativa|detalhe/),
    amount: find(/^montante|^valor$|^importancia|amount|montante/, /saldo/),
    debit: find(/debito|debit/),
    credit: find(/credito|credit/),
  };
}

export type ParsedTx = { date: string; description: string; amount: number };

export function applyMapping(rows: string[][], m: Mapping): { ok: ParsedTx[]; skipped: number } {
  const ok: ParsedTx[] = [];
  let skipped = 0;
  for (const r of rows.slice(m.header + 1)) {
    const date = parseDate(r[m.date]);
    const description = (r[m.description] ?? "").replace(/\s+/g, " ").trim();
    let amount: number | null = null;
    if (m.amount >= 0) amount = parseAmount(r[m.amount]);
    else {
      const d = parseAmount(r[m.debit]), c = parseAmount(r[m.credit]);
      if (d !== null && d !== 0) amount = -Math.abs(d);
      else if (c !== null && c !== 0) amount = Math.abs(c);
    }
    if (!date || !description || amount === null || amount === 0) { skipped++; continue; }
    ok.push({ date, description, amount });
  }
  return { ok, skipped };
}
