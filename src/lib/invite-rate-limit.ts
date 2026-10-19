/** About ten invite-code checks per IP per minute. There was no shared limiter in the app. */
const WINDOW_MS = 60_000
const MAX_CHECKS = 10

const hits = new Map<string, number[]>()

export function inviteCheckClientIp(getHeader: (name: string) => string | null) {
  const forwarded = getHeader("x-forwarded-for")
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim() ?? ""
    if (first) return first
  }
  return getHeader("x-real-ip")?.trim() ?? ""
}

/**
 * True when this IP may check a code. A blank IP or a broken store fails closed.
 * The window is the last 60 seconds, not a calendar minute.
 */
export function allowInviteCodeCheck(ip: string, now = Date.now(), store: Map<string, number[]> = hits) {
  try {
    const key = ip.trim()
    if (!key) return false
    const recent = (store.get(key) ?? []).filter((at) => now - at < WINDOW_MS)
    if (recent.length >= MAX_CHECKS) {
      store.set(key, recent)
      return false
    }
    recent.push(now)
    store.set(key, recent)
    return true
  } catch {
    return false
  }
}
