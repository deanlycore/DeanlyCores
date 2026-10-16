import type { ShoppingRow } from "@/lib/data/home"
import type { Visibility } from "@/lib/visibility"

import { mergeAmounts } from "@/lib/life/units"

export const LIST_JUST_ME_BLOCKED = "Some items on this list are shared. Make them Just me or remove them first."

export const LINKED_STAYS_SHARED = "This item is linked to a planned meal, so it stays Shared."

export const LIST_UNAVAILABLE = "That list is not available."

export const ITEM_UNAVAILABLE = "That item is not available."

export const STALE_SAVE = "This changed. Reload to see the latest."

export const STALE_CHANGED = "Changed by someone else."

export const STALE_USE_THEIRS = "Use theirs"

export const STALE_KEEP_MINE = "Keep mine"

export const KEEP_MINE_ATTEMPTS = 2

type DbError = { code?: string; message?: string; details?: string | null }

export function shoppingDbMessage(error: DbError | null, fallback: string): string {
  if (!error) return fallback
  const blob = `${error.message ?? ""} ${error.details ?? ""}`
  if (/that item is not available/i.test(blob)) return ITEM_UNAVAILABLE
  if (/that list is not available/i.test(blob)) return LIST_UNAVAILABLE
  if (/only the person who added this/i.test(blob)) {
    return "Only the person who added this can change who sees it."
  }
  if (/household cannot be reassigned/i.test(blob)) return "Household cannot be reassigned."
  if (/owner cannot be reassigned/i.test(blob)) return "Owner cannot be reassigned."
  if (/msn_meal_fk|msn_item_fk|linked to a planned meal/i.test(blob)) return LINKED_STAYS_SHARED
  const parentList = /shopping_lists/i.test(blob) && /update or delete/i.test(blob)
  if (error.code === "23503" && parentList) return LIST_JUST_ME_BLOCKED
  if (/shopping_items_list_fk/i.test(blob)) {
    if (parentList) return LIST_JUST_ME_BLOCKED
    return LIST_UNAVAILABLE
  }
  if (/row-level security|permission denied/i.test(blob)) return "You don’t have access to change that."
  return fallback
}

export function calmShoppingMessage(message: string): string {
  const mapped = shoppingDbMessage({ message }, message)
  if (mapped !== message) return mapped
  if (/violates |constraint "|duplicate key|syntax error|SQLSTATE|permission denied for|row-level security/i.test(message)) {
    return "Couldn’t save that."
  }
  return message
}

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

export type AmountFields = {
  manual_amount_raw?: string | null
  manual_unit_raw?: string | null
  manual_qty?: number | null
  manual_unit?: string | null
  auto_qty?: number | null
  auto_unit?: string | null
}

export type PantryRow = AmountFields & {
  id: string
  name: string
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
    unpricedCount: open.filter((item) => item.price_cents == null).length,
  }
}

export function unpricedLabel(count: number) {
  if (count < 1) return null
  return count === 1 ? "1 item has no price" : `${count} items have no price`
}

export function filterShoppingItems(
  items: ShoppingRow[],
  input: { query: string; category: ShoppingCategory | "all"; sort: ShoppingSort },
) {
  const query = input.query.trim().toLowerCase()
  const matched = items.filter((item) => {
    if (input.category !== "all" && shoppingCategory(item.category) !== input.category) return false
    if (!query) return true
    const haystack = `${item.name} ${item.notes ?? ""} ${item.manual_amount_raw ?? ""} ${item.manual_unit_raw ?? ""} ${item.for_meal ?? ""}`.toLowerCase()
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

export function displayUnit(unit: string) {
  const key = unit.trim().toLowerCase()
  if (key === "l" || key === "liter" || key === "liters" || key === "litre" || key === "litres") return "L"
  if (key === "ml" || key === "milliliter" || key === "milliliters" || key === "millilitre" || key === "millilitres") return "ml"
  return unit.trim()
}

export function formatQty(qty: number | null | undefined, unit: string | null | undefined) {
  const shown = unit?.trim() ? displayUnit(unit) : ""
  if (qty == null) return shown
  const amount = Number.isInteger(qty) ? String(qty) : String(qty)
  return shown ? `${amount} ${shown}` : amount
}

export function lineAmounts(items: AmountFields[]) {
  const lines = items.flatMap((item) => {
    const parts = []
    if (item.manual_qty != null && item.manual_unit) parts.push({ qty: Number(item.manual_qty), unit: item.manual_unit })
    if (item.auto_qty != null && item.auto_unit) parts.push({ qty: Number(item.auto_qty), unit: item.auto_unit })
    return parts
  })
  return mergeAmounts(lines)
}

function typedAmount(amount: string | null | undefined, unit: string | null | undefined) {
  const left = amount?.trim() ?? ""
  const right = unit?.trim() ?? ""
  if (left && right) return `${left} ${displayUnit(right)}`
  return left || right
}

/** Manual plus auto when they share a unit group. Otherwise both amounts stay visible. */
export function displayAmount(item: AmountFields) {
  const manualText = typedAmount(item.manual_amount_raw, item.manual_unit_raw)
  const autoText = item.auto_qty != null ? formatQty(Number(item.auto_qty), item.auto_unit) : ""
  const manual = item.manual_qty != null && item.manual_unit ? { qty: Number(item.manual_qty), unit: item.manual_unit } : null
  const auto = item.auto_qty != null && item.auto_unit ? { qty: Number(item.auto_qty), unit: item.auto_unit } : null
  if (manual && auto) {
    const merged = mergeAmounts([manual, auto])
    if (merged) return formatQty(merged.qty, merged.unit)
    return [manualText || formatQty(manual.qty, manual.unit), autoText].filter(Boolean).join(" + ")
  }
  if (manualText) return manualText
  if (manual) return formatQty(manual.qty, manual.unit)
  return autoText
}
