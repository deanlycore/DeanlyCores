const PLACEHOLDER_MARKERS = ["your-vapid", "your-service", "example.com", "changeme", "placeholder"]

function clean(value: string | undefined) {
  const trimmed = value?.trim()
  if (!trimmed) return null
  const lower = trimmed.toLowerCase()
  if (PLACEHOLDER_MARKERS.some((marker) => lower.includes(marker))) return null
  return trimmed
}

function decodeKey(value: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null
  const padded = value + "=".repeat((4 - (value.length % 4)) % 4)
  const bytes = Buffer.from(padded, "base64url")
  return bytes.length ? bytes : null
}

/** Browser-safe VAPID public key. Null when it is missing, a placeholder, or the wrong length. */
export function getVapidPublicKey() {
  const key = clean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY)
  if (!key) return null
  const bytes = decodeKey(key)
  if (!bytes || bytes.length !== 65) return null
  return key
}

export function getVapidPrivateKey() {
  const key = clean(process.env.VAPID_PRIVATE_KEY)
  if (!key) return null
  const bytes = decodeKey(key)
  if (!bytes || bytes.length !== 32) return null
  return key
}

export function getVapidSubject() {
  const subject = clean(process.env.VAPID_SUBJECT)
  if (!subject) return null
  if (!subject.startsWith("mailto:") && !subject.startsWith("https://")) return null
  return subject
}

export function getVapidConfig() {
  const publicKey = getVapidPublicKey()
  const privateKey = getVapidPrivateKey()
  const subject = getVapidSubject()
  if (!publicKey || !privateKey || !subject) return null
  return { publicKey, privateKey, subject }
}

/** Server-only. Never prefix this with NEXT_PUBLIC_. */
export function getServiceRoleKey() {
  return clean(process.env.SUPABASE_SERVICE_ROLE_KEY)
}
