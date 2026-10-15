import type { ShoppingRow } from "@/lib/data/home"
import type { Visibility } from "@/lib/visibility"

import { mergeAmounts } from "@/lib/life/units"

export const LIST_JUST_ME_BLOCKED = "Some items on this list are shared. Make them Just me or remove them first."

export const STALE_SAVE = "This changed. Reload to see the latest."

export const SHOPPING_CATEGORIES = [
  { id: "produce", label: "Produce" },
  { id: "meat", label: "Meat and Seafood" },
  { id: "dairy", label: "Dairy and Eggs" },
  { id: "bakery", label: "Bakery" },
  { id: "pantry", label: "Pantry" },
  { id: "frozen", label: "Frozen" },
  { id: "beverages", label: "Beverages" },
  { id: "household", label: "Household" },
  { id: "other", label: "Other" },
] as const

export type ShoppingCategory = (typeof SHOPPING_CATEGORIES)[number]["id"]

const CATEGORY_IDS = new Set<string>(SHOPPING_CATEGORIES.map((category) => category.id))

export function shoppingCategory(value: string | null | undefined): ShoppingCategory {
  return value && CATEGORY_IDS.has(value) ? (value as ShoppingCategory) : "other"
}

export function shoppingCategoryLabel(value: string | null | undefined) {
  return SHOPPING_CATEGORIES.find((category) => category.id === shoppingCategory(value))?.label ?? "Other"
}

export type ShoppingListRow = {
  id: string
  name: string
  visibility: Visibility
  is_default: boolean
  created_by: string
  updated_at: string
}

export type PantryRow = {
  id: string
  name: string
  qty: number | null
  unit: string | null
  category: string | null
  notes: string | null
  visibility: Visibility
  shopping_item_id: string | null
  updated_at: string
}

export type ShoppingSort = "category" | "name" | "price" | "recent"

export function shoppingTiles(items: ShoppingRow[]) {
  const open = items.filter((item) => !item.checked_at)
  const bought = items.length - open.length
  const priced = open.filter((item) => item.price_cents != null && item.price_cents >= 0)
  return {
    progressBought: bought,
    progressTotal: items.length,
    needToBuy: open.length,
    estimatedCents: priced.reduce((sum, item) => sum + (item.price_cents ?? 0), 0),
    pricedCount: priced.length,
  }
}

export function filterShoppingItems(
  items: ShoppingRow[],
  input: { query: string; category: ShoppingCategory | "all"; sort: ShoppingSort },
) {
  const query = input.query.trim().toLowerCase()
  const matched = items.filter((item) => {
    if (input.category !== "all" && shoppingCategory(item.category) !== input.category) return false
    if (!query) return true
    const haystack = `${item.name} ${item.notes ?? ""} ${item.unit ?? ""}`.toLowerCase()
    return haystack.includes(query)
  })
  return [...matched].sort((a, b) => compareShopping(a, b, input.sort))
}

function compareShopping(a: ShoppingRow, b: ShoppingRow, sort: ShoppingSort) {
  if (sort === "name") return a.name.localeCompare(b.name)
  if (sort === "price") return (a.price_cents ?? Number.MAX_SAFE_INTEGER) - (b.price_cents ?? Number.MAX_SAFE_INTEGER) || a.name.localeCompare(b.name)
  if (sort === "recent") return (b.updated_at ?? "").localeCompare(a.updated_at ?? "") || a.name.localeCompare(b.name)
  const category = categoryRank(a.category) - categoryRank(b.category)
  if (category !== 0) return category
  return a.name.localeCompare(b.name)
}

function categoryRank(value: string | null | undefined) {
  const index = SHOPPING_CATEGORIES.findIndex((category) => category.id === shoppingCategory(value))
  return index === -1 ? SHOPPING_CATEGORIES.length : index
}

export function groupShopping(items: ShoppingRow[]) {
  const open = items.filter((item) => !item.checked_at)
  const bought = items.filter((item) => item.checked_at).sort((a, b) => a.name.localeCompare(b.name))
  const groups = SHOPPING_CATEGORIES.map((category) => ({
    ...category,
    items: open.filter((item) => shoppingCategory(item.category) === category.id).sort((a, b) => a.name.localeCompare(b.name)),
  })).filter((group) => group.items.length > 0)
  return { groups, bought }
}

export function formatQty(qty: number | null | undefined, unit: string | null | undefined) {
  if (qty == null) return unit?.trim() || ""
  const amount = Number.isInteger(qty) ? String(qty) : String(qty)
  return unit?.trim() ? `${amount} ${unit.trim()}` : amount
}

export function lineAmounts(items: { qty: number | null | undefined; unit: string | null | undefined }[]) {
  const lines = items.flatMap((item) => (item.qty != null && item.unit ? [{ qty: item.qty, unit: item.unit }] : []))
  return mergeAmounts(lines)
}
