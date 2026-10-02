export const DEFAULT_HOUSEHOLD_NAME = "My household"
export const INVALID_CODE_MESSAGE = "That code isn’t valid anymore. Ask for a new one."
export const ALREADY_IN_HOME_MESSAGE =
  "You’re already in a home. Leave it in Settings before starting another."

const CODE_PATTERN = /^DEAN-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/

export type InviteCodeRecord = {
  id: string
  code: string
  created_at: string
  expires_at: string | null
  max_uses: number
  uses: number
  revoked_at: string | null
  purpose: string
}

export type InviteCodeView = {
  id: string
  code: string
  createdAt: string
  expiresAt: string | null
  maxUses: number
  uses: number
}

/** Uppercase and drop spaces. Hyphens stay so DEAN- codes still match. */
export function normalizeInviteCode(value: string) {
  return value.toUpperCase().replace(/\s+/g, "")
}

export function validInviteCodeShape(value: string) {
  return CODE_PATTERN.test(normalizeInviteCode(value))
}

export function isActiveInvite(
  row: Pick<InviteCodeRecord, "purpose" | "revoked_at" | "expires_at" | "uses" | "max_uses">,
  now = new Date(),
) {
  if (row.purpose !== "create_household") return false
  if (row.revoked_at) return false
  if (row.uses >= row.max_uses) return false
  if (row.expires_at && new Date(row.expires_at).getTime() <= now.getTime()) return false
  return true
}

export function toActiveInvite(row: InviteCodeRecord, now = new Date()): InviteCodeView | null {
  if (!isActiveInvite(row, now)) return null
  return {
    id: row.id,
    code: row.code,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    maxUses: row.max_uses,
    uses: row.uses,
  }
}

export function formatInviteDate(iso: string, timeZone?: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    ...(timeZone ? { timeZone } : {}),
  }).format(new Date(iso))
}

export function inviteStatus(
  row: { maxUses: number; uses: number; expiresAt: string | null },
  timeZone?: string,
) {
  const left = Math.max(0, row.maxUses - row.uses)
  const when = row.expiresAt ? formatInviteDate(row.expiresAt, timeZone) : "Never"
  return `Uses left ${left} · ${when}`
}

/** "7" is seven days from now. "never" does not expire. Anything else is rejected. */
export function expiryFromChoice(choice: string, now = new Date()) {
  if (choice === "never") return null
  if (choice !== "7") return undefined
  return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
}

export function parseMaxUses(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return 1
  if (!/^\d+$/.test(trimmed)) return null
  const uses = Number(trimmed)
  if (uses < 1 || uses > 20) return null
  return uses
}

export function calmInviteError(message: string) {
  const lower = message.toLowerCase()
  if (lower.includes("already in a home") || lower.includes("already belong")) {
    return ALREADY_IN_HOME_MESSAGE
  }
  if (lower.includes("shorter household")) return "Please use a shorter household name."
  if (lower.includes("enter a household name")) return "Enter a household name."
  if (
    lower.includes("isn’t valid") ||
    lower.includes("isn't valid") ||
    lower.includes("not valid") ||
    lower.includes("expired") ||
    lower.includes("create-home code")
  ) {
    return INVALID_CODE_MESSAGE
  }
  if (lower.includes("between 1 and 20")) return "Choose between 1 and 20 uses."
  if (lower.includes("future expiry")) return "Choose 7 days or Never."
  if (lower.includes("sign in")) return "Sign in to continue."
  if (lower.includes("owner")) return "Only a household owner can do that."
  if (lower.includes("row-level") || lower.includes("permission") || lower.includes("not authorized")) {
    return "You don’t have access to change that."
  }
  return "Something got in the way. Please try again."
}

/** Release a hold only when this request created it and the login was not created. */
export function shouldReleaseInviteHold(newlyReserved: boolean) {
  return newlyReserved
}

export function calmAccountError(message: string) {
  const lower = message.toLowerCase()
  if (lower.includes("already") || lower.includes("registered") || lower.includes("exists")) {
    return "That email already has a login. Sign in instead."
  }
  if (lower.includes("password")) return "Use a password between 8 and 72 characters."
  return "Something got in the way. Please try again."
}
