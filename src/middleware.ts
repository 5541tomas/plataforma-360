import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Domínios próprios de lead magnets (ex.: 7erros.thomasfaria.pt): a raiz mostra a página do lead magnet
const APP_HOST = /(^localhost$|^127\.|\.netlify\.app$|^app\.)/;
const ON_DOMAIN = ["/d/", "/g/", "/r/", "/e/", "/b/", "/m/", "/u/", "/api/t/", "/api/ics/", "/manifest.webmanifest", "/brand/", "/icon", "/apple-icon"];
const cache = new Map<string, { route: string | null; at: number }>();

async function routeFor(host: string) {
  const hit = cache.get(host);
  if (hit && Date.now() - hit.at < 60_000) return hit.route;
  try {
    const r = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/public_domain_route`, {
      method: "POST", headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, "Content-Type": "application/json", "Content-Profile": "p360" },
      body: JSON.stringify({ p_host: host }),
    });
    const route = r.ok ? ((await r.json()) as string | null) : null;
    cache.set(host, { route, at: Date.now() });
    return route;
  } catch { return hit?.route ?? null; }
}

export async function middleware(request: NextRequest) {
  const host = (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "").split(":")[0].toLowerCase();
  const appHost = process.env.APP_HOST?.toLowerCase();
  if (host && !APP_HOST.test(host) && host !== appHost) {
    const route = await routeFor(host);
    if (route) {
      const path = request.nextUrl.pathname;
      if (path === "/") { const url = request.nextUrl.clone(); url.pathname = route; return NextResponse.rewrite(url); }
      if (ON_DOMAIN.some((p) => path.startsWith(p))) return NextResponse.next();
      const url = request.nextUrl.clone(); url.pathname = "/"; url.search = ""; return NextResponse.redirect(url);
    }
  }
  return updateSession(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
