import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isPublicPath } from "@/lib/auth/paths";
import type { Database } from "@/lib/database.types";
import { env } from "@/lib/env";

/**
 * Refreshes the Supabase session cookie and guards routes. Returns the response that carries the
 * refreshed cookies and the no-cache headers; any other response must copy both, or the browser
 * loses the new session and a CDN could cache one user's cookie for another.
 * Source: supabase.com/docs/guides/auth/server-side/nextjs (Proxy), @supabase/ssr SetAllCookies docs.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<Database>(env.supabaseUrl, env.supabasePublishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options));
        Object.entries(headers).forEach(([key, value]) => supabaseResponse.headers.set(key, value));
      },
    },
  });

  // getClaims verifies the token; never trust getSession() here.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims);
  const { pathname } = request.nextUrl;

  if (!signedIn && !isPublicPath(pathname)) return redirectKeepingSession(request, "/login", supabaseResponse);
  if (signedIn && (pathname === "/" || pathname === "/login")) {
    return redirectKeepingSession(request, "/today", supabaseResponse);
  }
  return supabaseResponse;
}

function redirectKeepingSession(request: NextRequest, to: string, supabaseResponse: NextResponse) {
  const response = NextResponse.redirect(new URL(to, request.url));
  supabaseResponse.cookies.getAll().forEach((cookie) => response.cookies.set(cookie));
  for (const header of ["cache-control", "expires", "pragma"]) {
    const value = supabaseResponse.headers.get(header);
    if (value) response.headers.set(header, value);
  }
  return response;
}
