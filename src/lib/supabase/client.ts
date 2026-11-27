"use client";
import { createBrowserClient } from "@supabase/ssr";
/** Cliente no browser (sessão do utilizador) — usado para carregar ficheiros diretamente para o armazenamento. */
export const browserClient = () => createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
