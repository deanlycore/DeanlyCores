import type { NoteRow } from "@/lib/data/home"

export function previewNotes(now = Date.now()): NoteRow[] {
  const at = (msAgo: number) => new Date(now - msAgo).toISOString()
  const hour = 60 * 60 * 1000
  return [
    {
      id: "daycare",
      title: "Daycare pickup codes",
      body: "Gate code is 1942. Ask for Ms. Alvarez at the side door.",
      visibility: "shared",
      updated_at: at(2 * hour),
    },
    {
      id: "pack",
      title: "Pack soccer bag checklist",
      body: "Cleats, water, snack, and the orange pinnie.",
      visibility: "shared",
      updated_at: at(26 * hour),
    },
    {
      id: "truck",
      title: "Truck registration reminder",
      body: "Renew before the glove-box card expires.",
      visibility: "private",
      updated_at: at(5 * 24 * hour),
    },
    {
      id: "allergy",
      title: "Wife allergy — no zucchini",
      body: "Skip zucchini in the pasta. Dairy is fine.",
      visibility: "shared",
      updated_at: at(3 * hour),
    },
    {
      id: "license",
      title: "License renewal",
      body: "",
      visibility: "private",
      updated_at: at(30 * 60 * 1000),
    },
  ]
}
