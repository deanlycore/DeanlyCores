import type { Visibility } from "@/lib/visibility"

/** Shared household creates that should reach the other member. Notes are never included. */
export const SHARED_PUSH_KINDS = ["bill", "task", "event", "meal", "shopping"] as const

export type SharedPushKind = (typeof SHARED_PUSH_KINDS)[number]

const SECTION_PATH: Record<SharedPushKind, string> = {
  bill: "/money/bills",
  task: "/life/tasks",
  event: "/life/calendar",
  meal: "/life/meals",
  shopping: "/life/shopping",
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isSharedPushKind(kind: string): kind is SharedPushKind {
  return (SHARED_PUSH_KINDS as readonly string[]).includes(kind)
}

/** Just me rows and private notes never notify. */
export function shouldNotifySharedCreate(kind: string, visibility: Visibility) {
  return visibility === "shared" && isSharedPushKind(kind)
}

export type PushClientFacts = {
  detected: boolean
  userAgent: string
  platform: string
  maxTouchPoints: number
  standalone: boolean
  pushSupported: boolean
  vapidReady: boolean
  notificationPermission: NotificationPermission | "unknown"
}

export type PushGuidance = {
  canSubscribe: boolean
  showIosHomeScreen: boolean
  showIosTooOld: boolean
  showUnsupported: boolean
  showNotConfigured: boolean
}

export function isIosDevice(userAgent: string, platform: string, maxTouchPoints: number) {
  if (/iPad|iPhone|iPod/i.test(userAgent)) return true
  // iPadOS 13+ reports a desktop Macintosh UA, with touch points set.
  return platform === "MacIntel" && maxTouchPoints > 1
}

export function iosVersion(userAgent: string): { major: number; minor: number } | null {
  const match = userAgent.match(/(?:CPU iPhone OS|CPU OS|iPhone OS) (\d+)[_.](\d+)/i)
  if (!match) return null
  return { major: Number(match[1]), minor: Number(match[2]) }
}

export function iosAtLeast164(version: { major: number; minor: number }) {
  return version.major > 16 || (version.major === 16 && version.minor >= 4)
}

/**
 * iOS Safari tabs cannot subscribe. There is no beforeinstallprompt on iOS;
 * the person adds Deanly Tracking from the Share sheet, then turns notifications on
 * inside the Home Screen app.
 */
export function pushGuidance(facts: PushClientFacts): PushGuidance {
  if (!facts.detected) {
    return {
      canSubscribe: false,
      showIosHomeScreen: false,
      showIosTooOld: false,
      showUnsupported: false,
      showNotConfigured: false,
    }
  }
  const ios = isIosDevice(facts.userAgent, facts.platform, facts.maxTouchPoints)
  const version = ios ? iosVersion(facts.userAgent) : null
  const tooOld = Boolean(ios && version && !iosAtLeast164(version))
  const homeScreen = ios && !tooOld && !facts.standalone
  const canSubscribe = facts.vapidReady && facts.pushSupported && !tooOld && !homeScreen
  return {
    canSubscribe,
    showIosHomeScreen: homeScreen,
    showIosTooOld: tooOld,
    showUnsupported: !ios && !facts.pushSupported,
    showNotConfigured: !facts.vapidReady && !tooOld,
  }
}

function person(name: string) {
  const first = name.trim().split(/\s+/)[0]?.replace(/[^\p{L}\p{N}'’.-]/gu, "")
  if (!first) return "Someone"
  return first.slice(0, 40)
}

function labelOf(label: string) {
  const clean = label.replace(/\s+/g, " ").replace(/[\u0000-\u001f]/g, "").trim()
  if (!clean) return "something new"
  if (clean.length <= 80) return clean
  return `${clean.slice(0, 79)}…`
}

/** Same-origin path only. The service worker rejects anything else before opening it. */
export function safeNotificationPath(path: string) {
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) return "/home"
  if (/[\u0000-\u001f]/.test(path)) return "/home"
  return path
}

export function sharedPushMessage(input: {
  kind: SharedPushKind
  actorName: string
  label: string
  entityId: string
}) {
  const who = person(input.actorName)
  const label = labelOf(input.label)
  const section = SECTION_PATH[input.kind]
  const item = UUID.test(input.entityId) ? `#item-${input.entityId}` : ""
  const url = safeNotificationPath(`${section}${item}`)
  const body = {
    bill: `${who} added a shared bill, ${label}.`,
    task: `${who} added “${label}” to shared tasks.`,
    event: `${who} added ${label} on the calendar.`,
    meal: `${who} planned ${label}.`,
    shopping: `${who} added ${label} to the shopping list.`,
  }[input.kind]
  return {
    title: "Deanly Tracking",
    body,
    url,
    tag: `${input.kind}:${input.entityId}`.slice(0, 120),
  }
}

export type StoredPushSubscription = {
  endpoint: string
  p256dh: string
  auth: string
}

export function parsePushSubscription(input: unknown): StoredPushSubscription | null {
  if (!input || typeof input !== "object") return null
  const record = input as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } }
  const endpoint = record.endpoint
  const p256dh = record.keys?.p256dh
  const auth = record.keys?.auth
  if (typeof endpoint !== "string" || typeof p256dh !== "string" || typeof auth !== "string") return null
  if (!endpoint.startsWith("https://") || endpoint.length > 2000) return null
  if (p256dh.length < 16 || p256dh.length > 200) return null
  if (auth.length < 8 || auth.length > 100) return null
  return { endpoint, p256dh, auth }
}
