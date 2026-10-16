// Paths reachable without a session (AUTH-3 AC2: every other route redirects to /login).
const PUBLIC_PATHS = ["/login", "/auth/"];

export function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some((p) => (p.endsWith("/") ? pathname.startsWith(p) : pathname === p));
}
