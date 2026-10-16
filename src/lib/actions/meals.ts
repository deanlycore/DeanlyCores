"use server"

import { revalidatePath } from "next/cache"

import { requireHousehold } from "@/lib/data/context"
import { listPantry, listRecipes, listShopping } from "@/lib/data/lists"
import { savePlannedMealWith } from "@/lib/life/meals-save"
import { buildShoppingLines } from "@/lib/life/planner"
import { LIST_ALREADY_HAS_MEAL, OTHERS_ADDED, recipeDbMessage } from "@/lib/life/recipes"
import { LINKED_STAYS_SHARED } from "@/lib/life/shopping"
import type { Visibility } from "@/lib/visibility"

type Result = { ok: true; id?: string; message?: string } | { ok: false; message: string }

function refresh() {
  revalidatePath("/life/meals")
  revalidatePath("/life/shopping")
  revalidatePath("/home")
}

function failed(error: { code?: string; message?: string; details?: string | null } | null, fallback: string): Result | null {
  if (!error) return null
  const message = recipeDbMessage(error, fallback)
  if (/others_added/i.test(`${error.message ?? ""} ${error.details ?? ""}`)) return { ok: false, message: OTHERS_ADDED }
  if (/msn_meal_fk|msn_item_fk|linked to a planned meal/i.test(`${error.message ?? ""} ${error.details ?? ""}`)) {
    return { ok: false, message: LINKED_STAYS_SHARED }
  }
  return { ok: false, message }
}

export async function savePlannedMeal(input: {
  id?: string | null
  updatedAt?: string | null
  title: string
  mealOn: string
  slot: string
  servings: number
  visibility: Visibility
  recipeId?: string | null
  applyToList?: boolean
  clientRequestId?: string | null
}): Promise<Result> {
  const ctx = await requireHousehold()
  if (!ctx) return { ok: false, message: "Create your household first." }
  const lines = input.applyToList && input.recipeId ? await linesFor(ctx.householdId, input.recipeId, input.servings) : []
  return savePlannedMealWith(ctx, { ...input, lines }, refresh)
}

export async function removePlannedMeal(id: string, updatedAt: string): Promise<Result> {
  const ctx = await requireHousehold()
  if (!ctx) return { ok: false, message: "Create your household first." }
  if (!ctx.canWrite) return { ok: false, message: "You don’t have access to change that." }
  const removed = await ctx.supabase.rpc("remove_planned_meal", {
    p_household_id: ctx.householdId,
    p_meal_id: id,
    p_updated_at: updatedAt,
  })
  const error = failed(removed.error, "Couldn’t remove that meal.")
  if (error) return error
  const data = removed.data as { ok?: boolean } | null
  if (!data?.ok) return { ok: false, message: "This changed. Reload to see the latest." }
  refresh()
  return { ok: true, id }
}

export async function updateMealList(mealId: string): Promise<Result> {
  const ctx = await requireHousehold()
  if (!ctx) return { ok: false, message: "Create your household first." }
  if (!ctx.canWrite) return { ok: false, message: "You don’t have access to change that." }
  const meal = await ctx.supabase.from("meals").select("id, servings, recipe_id, updated_at, title, meal_on, slot, visibility").eq("id", mealId).eq("household_id", ctx.householdId).maybeSingle()
  if (meal.error || !meal.data?.recipe_id) return { ok: false, message: "That item is not available." }
  const lines = await linesFor(ctx.householdId, String(meal.data.recipe_id), Number(meal.data.servings ?? 1))
  const synced = await ctx.supabase.rpc("sync_meal_shopping", {
    p_household_id: ctx.householdId,
    p_meal_id: mealId,
    p_lines: lines,
  })
  const error = failed(synced.error, "Couldn’t update the list.")
  if (error) return error
  const data = synced.data as { ok?: boolean; added?: number; updated?: number; removed?: number } | null
  if (!data?.ok) return { ok: false, message: "Couldn’t update the list." }
  refresh()
  const unchanged = (data.added ?? 0) === 0 && (data.updated ?? 0) === 0 && (data.removed ?? 0) === 0
  return { ok: true, id: mealId, message: unchanged ? LIST_ALREADY_HAS_MEAL : "List updated." }
}

async function linesFor(householdId: string, recipeId: string, mealServings: number) {
  const [library, shopping, pantry] = await Promise.all([listRecipes(), listShopping(), listPantry()])
  const recipe = library.rows.find((row) => row.id === recipeId)
  if (!recipe) return []
  void householdId
  return buildShoppingLines({
    ingredients: recipe.ingredients.map((item) => ({
      id: item.id,
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      category: item.category,
    })),
    recipeServings: recipe.servings,
    mealServings,
    shopping: shopping.rows.map((item) => ({ name: item.name, checked_at: item.checked_at })),
    pantry: pantry.rows.map((item) => ({ name: item.name })),
    includeOnList: true,
  })
}
