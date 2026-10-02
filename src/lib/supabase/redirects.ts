const PUBLIC_PREFIXES = ["/auth", "/preview"]
const PUBLIC_PATHS = new Set(["/", "/login", "/forgot-password", "/join", "/sw.js", "/manifest.webmanifest"])

export function isPublic(pathname: string) {
  return PUBLIC_PATHS.has(pathname) || PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}

/**
 * Where this request should go, given one consistent auth answer.
 * Returns null when the current path is already stable.
 * `/` is public for rendering, but logged-out visitors should land on /login
 * via a real HTTP redirect instead of the root page's streamed meta refresh.
 */
export function authRedirectTarget(pathname: string, signedIn: boolean) {
  if (!signedIn && (pathname === "/" || !isPublic(pathname))) return "/login"
  if (signedIn && (pathname === "/" || pathname === "/login" || pathname === "/forgot-password")) {
    return "/home"
  }
  return null
}
