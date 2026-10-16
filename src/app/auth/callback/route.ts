import { NextResponse, type NextRequest } from "next/server";
import { loginErrorFor } from "@/lib/auth/login-errors";
import { createClient } from "@/lib/supabase/server";

// OAuth return (PKCE): exchange the code for a session cookie, then go to Today (AUTH-1 AC1).
// A rejected sign-in (the allowlist hook, AUTH-2) arrives as error parameters instead of a code.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}/today`);
    return NextResponse.redirect(`${origin}/login?error=${loginErrorFor(error.message)}`);
  }
  return NextResponse.redirect(`${origin}/login?error=${loginErrorFor(searchParams.get("error_description"))}`);
}
