import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "crypto";
import { getContext } from "@/lib/context";
import { GOOGLE_SCOPES, googleConfigured, redirectUri } from "@/lib/google";

export async function GET(request: Request) {
  await getContext();
  const origin = new URL(request.url).origin;
  if (!googleConfigured()) return NextResponse.redirect(`${origin}/definicoes?erro=${encodeURIComponent("A integração Google ainda não está configurada no servidor.")}`);
  const state = randomBytes(24).toString("hex");
  (await cookies()).set("g_state", state, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/" });
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!, redirect_uri: redirectUri(origin), response_type: "code",
    scope: GOOGLE_SCOPES.join(" "), access_type: "offline", prompt: "consent", include_granted_scopes: "true", state,
  }).toString();
  return NextResponse.redirect(url.toString());
}
