import { createClient } from "@supabase/supabase-js";
/** Cliente sem sessão para páginas públicas (só funções públicas do esquema p360). */
export const anonClient = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { db: { schema: "p360" }, auth: { persistSession: false } });
