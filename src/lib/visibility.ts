export type Visibility = "shared" | "private"

export const DEFAULT_VISIBILITY = {
  budget: "shared",
  bills: "shared",
  income: "shared",
  savings: "shared",
  debt: "shared",
  calendar: "shared",
  tasks: "shared",
  subscriptions: "shared",
  cards: "private",
  people: "private",
  notes: "private",
  documents: "private",
  assets: "shared",
} as const satisfies Record<string, Visibility>

export function visibilityLabel(visibility: Visibility) {
  return visibility === "private" ? "Just me" : "Shared"
}

const sharedDefaults = new Set(["bill", "event", "meal", "shopping", "budget"])
const privateDefaults = new Set(["note", "upload", "card", "person"])

/**
 * Household records open as Shared. Personal notes and uploads open as Just me.
 * A previous choice only applies to kinds without a product default, so saving
 * a private note does not make the next bill private.
 */
export function defaultVisibilityFor(kind: string, last: Visibility = "shared"): Visibility {
  if (privateDefaults.has(kind)) return "private"
  if (sharedDefaults.has(kind)) return "shared"
  return last
}
