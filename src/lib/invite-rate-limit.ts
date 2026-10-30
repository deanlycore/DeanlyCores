import { isIP } from "node:net"

/** About ten invite-code checks per IP per minute. There was no shared limiter in the app. */
const WINDOW_MS = 60_000
const MAX_CHECKS = 10
const MAX_ENTRIES = 10_000

const hits = new Map<string, number[]>()

function firstValue(header: string | null) {
  if (!header) return ""
  return header.split(",")[0]?.trim() ?? ""
}

/** Vercel’s client IP, then the first forwarded address. Invalid values are blank. */
export function inviteCheckClientIp(getHeader: (name: string) => string | null) {
  const vercel = firstValue(getHeader("x-vercel-forwarded-for"))
  if (vercel) return isIP(vercel) ? vercel : ""
  const forwarded = firstValue(getHeader("x-forwarded-for"))
  return isIP(forwarded) ? forwarded : ""
}

function shrink(store: Map<string, number[]>, now: number, incoming: string) {
  for (const [key, stamps] of store) {
    const recent = stamps.filter((at) => now - at < WINDOW_MS)
    if (recent.length === 0) store.delete(key)
    else if (recent.length !== stamps.length) store.set(key, recent)
  }
  while (!store.has(incoming) && store.size >= MAX_ENTRIES) {
    let oldestKey: string | null = null
    let oldestAt = Infinity
    for (const [key, stamps] of store) {
      const first = stamps[0] ?? Infinity
      if (first < oldestAt) {
        oldestAt = first
        oldestKey = key
      }
    }
    if (!oldestKey) break
    store.delete(oldestKey)
  }
}

/**
 * True when this IP may check a code. A missing or invalid IP, or a broken store, fails closed.
 * The window is the last 60 seconds, not a calendar minute.
 */
export function allowInviteCodeCheck(ip: string, now = Date.now(), store: Map<string, number[]> = hits) {
  try {
    const key = ip.trim()
    if (!isIP(key)) return false
    shrink(store, now, key)
    const recent = store.get(key) ?? []
    if (recent.length >= MAX_CHECKS) return false
    recent.push(now)
    store.set(key, recent)
    return true
  } catch {
    return false
  }
}
