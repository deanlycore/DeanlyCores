import { ingredientNamesMatch } from "@/lib/life/normalize"
import { displayUnit, shoppingCategoryLabel, shoppingDbMessage, type ShoppingCategory } from "@/lib/life/shopping"
import type { Visibility } from "@/lib/visibility"

export const RECIPE_UNAVAILABLE = "That recipe is not available."

export const RECIPE_VIEW_ONLY = "You don’t have access to change that."

export const SHOPPING_CATEGORY_IDS = [
  "produce",
  "meat",
  "dairy",
  "bakery",
  "pantry",
  "frozen",
  "beverages",
  "household",
  "other",
] as const

const CATEGORY_IDS = new Set<string>(SHOPPING_CATEGORY_IDS)

export type RecipeIngredient = {
  id: string
  name: string
  quantity: string | null
  unit: string | null
  category: ShoppingCategory | null
  sort_order: number
}

export type RecipeRow = {
  id: string
  name: string
  category: string | null
  servings: number
  steps: string[]
  notes: string | null
  visibility: Visibility
  catalog_recipe_id: string | null
  created_by: string
  updated_at: string
  ingredients: RecipeIngredient[]
}

export type StarterRecipe = {
  id: string
  name: string
  category: string | null
  servings: number
  steps: string[]
  notes: string | null
  ingredients: RecipeIngredient[]
  copiedId: string | null
}

export type IngredientPlan = "add" | "list" | "home"

export type PlannedIngredient = RecipeIngredient & { plan: IngredientPlan }

type DbError = { code?: string; message?: string; details?: string | null } | null

export function recipeDbMessage(error: DbError, fallback: string) {
  const blob = `${error?.message ?? ""} ${error?.details ?? ""}`
  if (/that recipe is not available/i.test(blob)) return RECIPE_UNAVAILABLE
  return shoppingDbMessage(error, fallback)
}

export function recipeSteps(value: unknown) {
  if (!Array.isArray(value)) return []
  return value
    .filter((step): step is string => typeof step === "string" && step.trim().length > 0)
    .map((step) => step.trim())
    .slice(0, 30)
}

export function optionalShoppingCategory(value: string | null | undefined): ShoppingCategory | null {
  const text = value?.trim() ?? ""
  if (!text || !CATEGORY_IDS.has(text)) return null
  return text as ShoppingCategory
}

export function servingsLabel(servings: number) {
  return `${servings} serving${servings === 1 ? "" : "s"}`
}

export function ingredientLine(item: { name: string; quantity: string | null; unit: string | null }) {
  const quantity = item.quantity?.trim() ?? ""
  const unit = item.unit?.trim() ? displayUnit(item.unit) : ""
  return [quantity, unit, item.name.trim()].filter(Boolean).join(" ")
}

export function ingredientCategoryLabel(category: string | null | undefined) {
  if (!category) return null
  return shoppingCategoryLabel(category)
}

export function planIngredients(
  ingredients: RecipeIngredient[],
  shopping: { name: string; checked_at?: string | null }[],
  pantry: { name: string }[],
): PlannedIngredient[] {
  const atHome = pantry.map((item) => item.name)
  const onList = shopping.filter((item) => !item.checked_at).map((item) => item.name)
  const planned: PlannedIngredient[] = []
  for (const item of ingredients) {
    if (!item.name.trim()) continue
    const plan: IngredientPlan = atHome.some((name) => ingredientNamesMatch(item.name, name))
      ? "home"
      : onList.some((name) => ingredientNamesMatch(item.name, name))
        ? "list"
        : "add"
    planned.push({ ...item, plan })
  }
  return planned
}

export function planLabel(plan: IngredientPlan) {
  if (plan === "home") return "At home"
  if (plan === "list") return "Already on the list"
  return "Add"
}

export type RecipeDraft = {
  id: string | null
  name: string
  category: string | null
  servings: number
  steps: string[]
  notes: string | null
  visibility: Visibility
  catalogRecipeId: string | null
  ingredients: { name: string; quantity: string | null; unit: string | null; category: ShoppingCategory | null }[]
}

function textOf(value: FormDataEntryValue | null, max: number) {
  const text = String(value ?? "").trim()
  if (!text || text.length > max) return null
  return text
}

export function parseRecipeForm(formData: FormData): { ok: true; draft: RecipeDraft } | { ok: false; message: string } {
  const name = textOf(formData.get("name"), 140)
  if (!name) return { ok: false, message: "Add a name." }
  const category = textOf(formData.get("category"), 40)
  const servings = Number(String(formData.get("servings") ?? "").trim())
  if (!Number.isInteger(servings) || servings < 1 || servings > 50) return { ok: false, message: "Servings need to be from 1 to 50." }
  const visibility = formData.get("visibility") === "private" ? "private" : "shared"
  const notes = textOf(formData.get("notes"), 2000)
  const steps = String(formData.get("steps") ?? "")
    .split("\n")
    .map((step) => step.trim())
    .filter(Boolean)
    .slice(0, 30)
  if (steps.some((step) => step.length > 400)) return { ok: false, message: "Keep each step under 400 characters." }
  let raw: unknown
  try {
    raw = JSON.parse(String(formData.get("ingredients") ?? "[]"))
  } catch {
    return { ok: false, message: "Check the ingredients." }
  }
  if (!Array.isArray(raw)) return { ok: false, message: "Check the ingredients." }
  const ingredients: RecipeDraft["ingredients"] = []
  for (const entry of raw.slice(0, 80)) {
    if (!entry || typeof entry !== "object") continue
    const row = entry as { name?: unknown; quantity?: unknown; unit?: unknown; category?: unknown }
    const itemName = String(row.name ?? "").trim()
    if (!itemName) continue
    if (itemName.length > 140) return { ok: false, message: "Ingredient names need to be under 140 characters." }
    const quantity = String(row.quantity ?? "").trim()
    const unit = String(row.unit ?? "").trim()
    if (quantity.length > 40 || unit.length > 24) return { ok: false, message: "Check the ingredient amounts." }
    ingredients.push({
      name: itemName,
      quantity: quantity || null,
      unit: unit || null,
      category: optionalShoppingCategory(String(row.category ?? "")),
    })
  }
  return {
    ok: true,
    draft: {
      id: textOf(formData.get("id"), 80),
      name,
      category,
      servings,
      steps,
      notes,
      visibility,
      catalogRecipeId: textOf(formData.get("catalog_recipe_id"), 80),
      ingredients,
    },
  }
}
