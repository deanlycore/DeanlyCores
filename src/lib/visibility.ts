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
  notes: "private",
  documents: "private",
  assets: "shared",
} as const satisfies Record<string, Visibility>

export function visibilityLabel(visibility: Visibility) {
  return visibility === "private" ? "Just me" : "Shared"
}
