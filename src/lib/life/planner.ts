import { addDays, weekBounds } from "@/lib/home/metrics"
import { canonicalIngredient, isStapleIngredient, type IngredientAlias } from "@/lib/life/normalize"
import { ingredientNamesMatch } from "@/lib/life/normalize"
import { planIngredients } from "@/lib/life/recipes"
import { resolveUnit } from "@/lib/life/units"

export const UPDATE_LIST_CONFIRM = "Update your list for this week?"

export const SLOTS = ["breakfast", "lunch", "dinner", "snack"] as const

export type MealSlot = (typeof SLOTS)[number]

export type SyncLine = {
  recipe_ingredient_id?: string
  catalog_ingredient_id?: string
  name: string
  category: string | null
  match_key: string
  amount_raw: string | null
  qty_base: number | null
  unit_group: string | null
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

export function weekOf(today: string, offset = 0) {
  const anchor = addDays(today, offset * 7)
  const { start, end } = weekBounds(anchor)
  return { start, end, days: Array.from({ length: 7 }, (_, index) => addDays(start, index)) }
}

export function weekdayLabel(date: string) {
  const [year, month, day] = date.split("-").map(Number)
  const utc = new Date(Date.UTC(year, month - 1, day))
  const index = utc.getUTCDay()
  return WEEKDAYS[index === 0 ? 6 : index - 1]
}

export function formatWeekLabel(start: string) {
  const end = addDays(start, 6)
  const startDate = new Date(`${start}T00:00:00Z`)
  const endDate = new Date(`${end}T00:00:00Z`)
  const month = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" })
  const day = new Intl.DateTimeFormat("en-US", { day: "numeric", timeZone: "UTC" })
  if (start.slice(0, 7) === end.slice(0, 7)) return `${month.format(startDate)} ${day.format(startDate)}–${day.format(endDate)}`
  return `${month.format(startDate)} ${day.format(startDate)}–${month.format(endDate)} ${day.format(endDate)}`
}

export function slotLabel(slot: string) {
  if (slot === "breakfast") return "Breakfast"
  if (slot === "lunch") return "Lunch"
  if (slot === "dinner") return "Dinner"
  if (slot === "snack") return "Snacks"
  return slot
}

export function mealStatusLine(servings: number, needed: number, hasRecipe: boolean) {
  if (!hasRecipe) return null
  if (needed <= 0) return `${servings} serving${servings === 1 ? "" : "s"} · Ready`
  return `${servings} serving${servings === 1 ? "" : "s"} · ${needed} needed`
}

/** About $48, or the missing-price line when any needed item has no price. */
export function estimateLabel(totalCents: number, missingPrice: boolean) {
  if (missingPrice) return "Some prices not set"
  return `About $${Math.round(totalCents / 100)}`
}

/** Schema test 25. One needed item with no price replaces the dollar estimate. */
export function neededEstimate(items: { price_cents?: number | null }[]) {
  const missing = items.some((item) => item.price_cents == null)
  const cents = items.reduce((sum, item) => sum + (item.price_cents ?? 0), 0)
  return estimateLabel(cents, missing && items.length > 0)
}

export function updateListButton(meal: { recipeId: string | null }, canWrite: boolean) {
  if (!meal.recipeId) return "hidden" as const
  if (!canWrite) return "disabled" as const
  return "ready" as const
}

/** Not now leaves the write log untouched. */
export function confirmListChoice(choice: "update" | "not-now", writes: string[]) {
  if (choice === "not-now") return writes
  return [...writes, "sync"]
}

export function syncCountsUnchanged(result: { added?: number; updated?: number; removed?: number } | null) {
  return (result?.added ?? 0) === 0 && (result?.updated ?? 0) === 0 && (result?.removed ?? 0) === 0
}

type LineInput = {
  id: string
  name: string
  quantity: string | null
  unit: string | null
  category: string | null
  catalog?: boolean
}

/** Pantry coverage and staples are left off the payload, so sync creates no link for them. */
export function buildShoppingLines(input: {
  ingredients: LineInput[]
  recipeServings: number
  mealServings: number
  shopping?: { name: string; checked_at?: string | null }[]
  pantry?: { name: string }[]
  aliases?: IngredientAlias[]
  includeOnList?: boolean
}): SyncLine[] {
  const planned = planIngredients(
    input.ingredients.map((item, index) => ({ ...item, sort_order: index, category: null })),
    input.shopping ?? [],
    input.pantry ?? [],
  )
  const source = new Map(input.ingredients.map((item) => [item.id, item]))
  const catalogIds = new Set(input.ingredients.filter((item) => item.catalog).map((item) => item.id))
  const scale = input.recipeServings > 0 ? input.mealServings / input.recipeServings : 1
  const lines: SyncLine[] = []
  for (const item of planned) {
    if (isStapleIngredient(item.name, input.aliases)) continue
    if (item.plan === "home") continue
    if (item.plan === "list" && !input.includeOnList) continue
    const unit = item.unit ? resolveUnit(item.unit) : null
    const qty = parseQty(item.quantity)
    const base = qty != null && unit ? roundQty(qty * unit.toBase * scale) : null
    const canonical = canonicalIngredient(item.name, input.aliases)
    const group = unit?.group ?? null
    const idKey = catalogIds.has(item.id) ? "catalog_ingredient_id" : "recipe_ingredient_id"
    lines.push({
      [idKey]: item.id,
      name: item.name,
      category: source.get(item.id)?.category ?? null,
      match_key: `${canonical}|${group ?? "raw"}`,
      amount_raw: qty != null ? String(roundQty(qty * scale)) : item.quantity,
      qty_base: base,
      unit_group: group,
    })
  }
  return lines
}

export function coveredByPantry(name: string, pantry: { name: string }[], aliases: IngredientAlias[] = []) {
  return pantry.some((item) => ingredientNamesMatch(name, item.name, aliases)) || isStapleIngredient(name, aliases)
}

function parseQty(raw: string | null) {
  const text = raw?.trim() ?? ""
  if (!text) return null
  const amount = Number(text)
  if (!Number.isFinite(amount) || amount <= 0) return null
  return amount
}

function roundQty(value: number) {
  return Math.round(value * 100) / 100
}
