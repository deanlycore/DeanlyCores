import type { EventRow, MealRow, ShoppingRow, TaskRow } from "@/lib/data/home"
import type { PantryRow, ShoppingListRow } from "@/lib/life/shopping"

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

export const previewShoppingLists: ShoppingListRow[] = [
  { id: "groceries", name: "Groceries", visibility: "shared", is_default: true, created_by: "preview", updated_at: "2026-10-02T12:00:00.000Z" },
  { id: "personal", name: "Personal", visibility: "private", is_default: true, created_by: "preview", updated_at: "2026-10-02T12:00:00.000Z" },
]

export const previewShopping: ShoppingRow[] = [
  { id: "milk", name: "Milk", checked_at: null, visibility: "shared", store: "Costco", need_soon: true, list_id: "groceries", manual_amount_raw: "1", manual_unit_raw: "gal", price_cents: 349, notes: null, category: "dairy", updated_at: "2026-10-02T12:00:00.000Z" },
  { id: "chicken", name: "Chicken thighs", checked_at: null, visibility: "shared", store: null, need_soon: false, list_id: "groceries", manual_amount_raw: "500", manual_unit_raw: "g", manual_qty: 500, manual_unit: "g", auto_qty: 1, auto_unit: "kg", price_cents: 899, notes: null, category: "meat", updated_at: "2026-10-02T12:05:00.000Z" },
  { id: "tomatoes", name: "Tomatoes", checked_at: null, visibility: "shared", store: null, need_soon: false, list_id: "groceries", manual_amount_raw: "4", price_cents: 250, notes: "Roma", category: "produce", updated_at: "2026-10-02T12:06:00.000Z" },
  { id: "broth", name: "Chicken broth", checked_at: null, visibility: "shared", store: null, need_soon: false, list_id: "groceries", manual_amount_raw: "1", manual_unit_raw: "l", manual_qty: 1, manual_unit: "l", price_cents: null, notes: null, category: "pantry", updated_at: "2026-10-02T12:07:00.000Z" },
  { id: "bread", name: "Sourdough", checked_at: null, visibility: "shared", store: null, need_soon: false, list_id: "groceries", manual_amount_raw: "1", manual_unit_raw: "each", manual_qty: 1, manual_unit: "each", price_cents: 425, notes: null, category: "bakery", updated_at: "2026-10-02T12:08:00.000Z" },
  { id: "juice", name: "Orange juice", checked_at: null, visibility: "shared", store: null, need_soon: false, list_id: "groceries", manual_amount_raw: "1", manual_unit_raw: "l", manual_qty: 1, manual_unit: "l", price_cents: 399, notes: null, category: "beverages", updated_at: "2026-10-02T12:09:00.000Z" },
  { id: "peas", name: "Peas", checked_at: null, visibility: "shared", store: null, need_soon: false, list_id: "groceries", manual_amount_raw: "1", manual_unit_raw: "pack", manual_qty: 1, manual_unit: "pack", price_cents: 199, notes: null, category: "frozen", updated_at: "2026-10-02T12:10:00.000Z" },
  { id: "towels", name: "Paper towels", checked_at: null, visibility: "shared", store: "Costco", need_soon: false, list_id: "groceries", manual_amount_raw: "1", manual_unit_raw: "pack", manual_qty: 1, manual_unit: "pack", price_cents: 1299, notes: null, category: "household", updated_at: "2026-10-02T12:11:00.000Z" },
  { id: "tortillas", name: "Tortillas", checked_at: null, visibility: "shared", store: "Smith's", need_soon: false, list_id: "groceries", manual_amount_raw: "1", manual_unit_raw: "pack", manual_qty: 1, manual_unit: "pack", price_cents: 275, notes: null, category: "bakery", for_meal: "Tacos", updated_at: "2026-10-02T12:12:00.000Z" },
  { id: "case", name: "Headphones case", checked_at: null, visibility: "private", store: null, need_soon: false, list_id: "personal", manual_amount_raw: "1", manual_unit_raw: "each", manual_qty: 1, manual_unit: "each", price_cents: 1200, notes: null, category: "other", updated_at: "2026-10-02T12:13:00.000Z" },
  { id: "bananas", name: "Bananas", checked_at: "2026-10-02T15:00:00.000Z", visibility: "shared", store: "Costco", need_soon: false, list_id: "groceries", manual_amount_raw: "1", manual_unit_raw: "each", manual_qty: 1, manual_unit: "each", price_cents: 149, notes: null, category: "produce", updated_at: "2026-10-02T15:00:00.000Z" },
]

export const previewPantry: PantryRow[] = [
  { id: "oil", name: "Olive oil", manual_amount_raw: "1", manual_unit_raw: "l", manual_qty: 1, manual_unit: "l", category: "pantry", notes: null, visibility: "shared", shopping_item_id: null, updated_at: "2026-10-01T12:00:00.000Z" },
  { id: "salt", name: "Salt", manual_amount_raw: null, manual_unit_raw: null, manual_qty: null, manual_unit: null, category: "pantry", notes: null, visibility: "shared", shopping_item_id: null, updated_at: "2026-10-01T12:00:00.000Z" },
]
