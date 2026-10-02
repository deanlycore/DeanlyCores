import type { EventRow, MealRow, ShoppingRow, TaskRow } from "@/lib/data/home"

export const previewToday = "2026-10-02"
export const previewZone = "America/Denver"

export const previewEvents: EventRow[] = [
  {
    id: "daycare",
    title: "Daycare rhythm",
    starts_at: "2026-09-28T06:00:00.000Z",
    ends_at: "2026-09-29T05:59:00.000Z",
    location: null,
    visibility: "shared",
  },
  {
    id: "dentist",
    title: "Dentist checkup",
    starts_at: "2026-10-02T15:00:00.000Z",
    ends_at: null,
    location: "Downtown clinic",
    visibility: "shared",
  },
  {
    id: "soccer",
    title: "Soccer practice",
    starts_at: "2026-10-03T21:30:00.000Z",
    ends_at: null,
    location: null,
    visibility: "shared",
  },
  {
    id: "work",
    title: "Work block",
    starts_at: "2026-10-02T16:00:00.000Z",
    ends_at: null,
    location: null,
    visibility: "private",
  },
]

export const previewTasks: TaskRow[] = [
  { id: "books", title: "Return books", due_on: "2026-10-01", completed_at: null, visibility: "shared" },
  { id: "call", title: "Call insurance", due_on: "2026-10-02", completed_at: null, visibility: "shared" },
  { id: "bag", title: "Pack soccer bag", due_on: "2026-10-03", completed_at: null, visibility: "shared" },
  { id: "license", title: "Renew license", due_on: "2026-10-16", completed_at: null, visibility: "private" },
  { id: "plants", title: "Water plants", due_on: "2026-09-30", completed_at: "2026-10-01T18:00:00.000Z", visibility: "shared" },
]

export const previewMeals: MealRow[] = [
  { id: "mon", title: "Grill chicken", meal_on: "2026-09-28", slot: "dinner", notes: null, visibility: "shared" },
  { id: "tue", title: "Leftover", meal_on: "2026-09-29", slot: "dinner", notes: "From Monday", visibility: "shared" },
  { id: "wed", title: "Creamy pasta", meal_on: "2026-09-30", slot: "dinner", notes: "Leftovers for Thu", visibility: "shared" },
  { id: "thu", title: "Leftover", meal_on: "2026-10-01", slot: "dinner", notes: null, visibility: "shared" },
  { id: "fri", title: "Tacos", meal_on: "2026-10-02", slot: "dinner", notes: null, visibility: "shared" },
]

export const previewShopping: ShoppingRow[] = [
  { id: "milk", name: "Milk", checked_at: null, visibility: "shared", store: "Costco", need_soon: true },
  { id: "towels", name: "Paper towels", checked_at: null, visibility: "shared", store: "Costco", need_soon: false },
  { id: "tortillas", name: "Tortillas", checked_at: null, visibility: "shared", store: "Smith's", need_soon: false },
  { id: "case", name: "Headphones case", checked_at: null, visibility: "private", store: null, need_soon: false },
  { id: "bananas", name: "Bananas", checked_at: "2026-10-02T15:00:00.000Z", visibility: "shared", store: "Costco", need_soon: false },
]
