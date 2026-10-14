export const FAMILY_COLORS = [
  { id: "teal", label: "Teal", swatch: "var(--brand)" },
  { id: "deep", label: "Deep", swatch: "var(--brand-deep)" },
  { id: "sand", label: "Sand", swatch: "var(--warm)" },
  { id: "success", label: "Green", swatch: "var(--success)" },
  { id: "warn", label: "Warm", swatch: "var(--warn)" },
  { id: "ink", label: "Stone", swatch: "var(--ink-muted)" },
] as const

export type FamilyColor = (typeof FAMILY_COLORS)[number]["id"]

export const FAMILY_COPY = {
  title: "Family",
  add: "Add member",
  emptyOwner: "Add your family.",
  emptyMember: "No family members yet.",
  addTitle: "Add member",
  editTitle: "Edit member",
  nameLabel: "Name",
  nameError: "Add a name.",
  roleLabel: "Role",
  rolePlaceholder: "Son, Partner, Grandma",
  birthdayLabel: "Birthday",
  colorLabel: "Color",
  notesLabel: "Notes",
  save: "Save",
  cancel: "Cancel",
  remove: "Remove member",
  saved: "Saved.",
  removeBody: "Their chores and notes stay. Anything assigned to them becomes Unassigned.",
  unassigned: "Unassigned",
} as const

export type FamilyProfile = {
  id: string
  name: string
  role: string | null
  birthday: string | null
  color: FamilyColor
  notes: string | null
  createdAt: string
  archivedAt: string | null
}

export type FamilyField = "name" | "role" | "birthday" | "notes" | "color"

export type FamilyInput = {
  name: string
  role: string | null
  birthday: string | null
  color: FamilyColor
  notes: string | null
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

export function isFamilyColor(value: string | null | undefined): value is FamilyColor {
  return FAMILY_COLORS.some((color) => color.id === value)
}

export function familySwatch(color: FamilyColor) {
  return FAMILY_COLORS.find((entry) => entry.id === color)?.swatch ?? "var(--brand)"
}

/** Ink initials sit on a soft tint of a palette color. No new hues. */
export function familyAvatarTint(color: FamilyColor) {
  return `color-mix(in srgb, ${familySwatch(color)} 32%, var(--surface))`
}

export function familyInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  const first = parts[0]?.[0] ?? ""
  const second = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : ""
  return `${first}${second}`.toUpperCase()
}

/** Month and day only. No year and no age. */
export function formatBirthday(iso: string | null | undefined) {
  if (!iso) return null
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!match) return null
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const probe = new Date(Date.UTC(2000, month - 1, day))
  if (probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) return null
  return `${MONTHS[month - 1]} ${day}`
}

export function visibleProfiles<T extends { archivedAt: string | null }>(rows: T[]) {
  return rows.filter((row) => row.archivedAt == null)
}

/** Archived and missing profiles read as Unassigned. The row itself stays. */
export function assigneeLabel(
  profiles: { id: string; name: string; archivedAt: string | null }[],
  assigneeId: string | null | undefined,
) {
  if (!assigneeId) return FAMILY_COPY.unassigned
  const profile = profiles.find((row) => row.id === assigneeId)
  if (!profile || profile.archivedAt) return FAMILY_COPY.unassigned
  return profile.name
}

export function removeTitle(name: string) {
  return `Remove ${name}?`
}

export function removedToast(name: string) {
  return `${name} removed.`
}

function blankToNull(value: string, max: number) {
  const text = value.trim()
  if (!text) return { ok: true as const, value: null }
  if (text.length > max) return { ok: false as const }
  return { ok: true as const, value: text }
}

export function parseFamilyForm(input: {
  name: string
  role: string
  birthday: string
  color: string
  notes: string
}): { ok: true; value: FamilyInput } | { ok: false; field: FamilyField; message: string } {
  const name = input.name.trim()
  if (!name) return { ok: false, field: "name", message: FAMILY_COPY.nameError }
  if (name.length > 80) return { ok: false, field: "name", message: "Use a shorter name." }

  const role = blankToNull(input.role, 80)
  if (!role.ok) return { ok: false, field: "role", message: "Use a shorter role." }

  const notes = blankToNull(input.notes, 2000)
  if (!notes.ok) return { ok: false, field: "notes", message: "Use a shorter note." }

  const birthdayRaw = input.birthday.trim()
  let birthday: string | null = null
  if (birthdayRaw) {
    if (!formatBirthday(birthdayRaw)) {
      return { ok: false, field: "birthday", message: "Enter a birthday, or leave it blank." }
    }
    birthday = birthdayRaw
  }

  if (!isFamilyColor(input.color)) return { ok: false, field: "color", message: "Pick a color." }

  return {
    ok: true,
    value: { name, role: role.value, birthday, color: input.color, notes: notes.value },
  }
}
