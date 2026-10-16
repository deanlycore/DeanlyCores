import type { ShoppingCategory } from "@/lib/life/shopping"
import { saveShoppingItemWith, type ShoppingActionResult, type ShoppingWriter } from "@/lib/life/shopping-save"
import type { Visibility } from "@/lib/visibility"

import { buildShoppingLines } from "@/lib/life/planner"
import { ADDED_JUST_ME, OTHERS_ADDED, parseRecipeForm, planIngredients, RECIPE_STALE, RECIPE_UNAVAILABLE, RECIPE_VIEW_ONLY, recipeDbMessage, recipeSteps, type RecipeDraft, type RecipeIngredient } from "@/lib/life/recipes"

export type RecipeActionResult =
  | { ok: true; id?: string; added?: string[]; skipped?: string[]; message?: string }
  | { ok: false; message: string; conflict?: boolean }

type DbError = { code?: string; message: string; details?: string | null } | null

type RecipeTable = {
  select(columns?: string): RecipeTable
  eq(column: string, value: unknown): RecipeTable
  order(column: string, options?: { ascending?: boolean }): RecipeTable
  insert(values: object | object[]): RecipeTable
  update(values: object): RecipeTable
  delete(): RecipeTable
  maybeSingle(): Promise<{ data: Record<string, unknown> | null; error: DbError }>
  single(): Promise<{ data: Record<string, unknown> | null; error: DbError }>
  then<TResult1 = { data: Record<string, unknown>[] | null; error: DbError }, TResult2 = never>(
    onfulfilled?: ((value: { data: Record<string, unknown>[] | null; error: DbError }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2>
}

export type RecipeWriter = ShoppingWriter & { canWrite?: boolean }

function fromTable(ctx: RecipeWriter, table: string) {
  return ctx.supabase.from(table) as RecipeTable
}

function blocked(ctx: RecipeWriter): RecipeActionResult | null {
  if (!ctx.householdId.trim() || !ctx.userId.trim()) return { ok: false, message: "Create your household first." }
  if (ctx.canWrite === false) return { ok: false, message: RECIPE_VIEW_ONLY }
  return null
}

function failed(error: DbError, fallback: string): RecipeActionResult | null {
  if (!error) return null
  return { ok: false, message: recipeDbMessage(error, fallback) }
}

type RecipeRpc = (
  fn: string,
  args: { p_household_id?: string; p_recipe?: Record<string, unknown>; p_add_batch_id?: string; p_recipe_id?: string | null; p_catalog_recipe_id?: string | null; p_servings?: number; p_lines?: unknown },
) => Promise<{ data: { ok?: boolean; conflict?: boolean; code?: string; id?: string; added?: number; updated?: number; removed?: number } | null; error: DbError }>

function recipePayload(draft: RecipeDraft, updatedAt: string | null) {
  return {
    id: draft.id,
    updated_at: updatedAt,
    name: draft.name,
    category: draft.category,
    servings: draft.servings,
    steps: draft.steps,
    notes: draft.notes,
    visibility: draft.visibility,
    catalog_recipe_id: draft.catalogRecipeId,
    ingredients: draft.ingredients,
  }
}

export async function saveRecipeWith(ctx: RecipeWriter, formData: FormData, refresh: () => void): Promise<RecipeActionResult> {
  const denied = blocked(ctx)
  if (denied) return denied
  const parsed = parseRecipeForm(formData)
  if (!parsed.ok) return parsed
  const { draft } = parsed
  let updatedAt = draft.updatedAt
  if (draft.id && formData.get("keep_mine") === "1") {
    const current = await fromTable(ctx, "recipes").select("updated_at").eq("id", draft.id).eq("household_id", ctx.householdId).maybeSingle()
    const readError = failed(current.error, "Couldn’t save that recipe.")
    if (readError) return readError
    const fresh = current.data?.updated_at
    if (!fresh) return { ok: false, message: RECIPE_STALE, conflict: true }
    updatedAt = String(fresh)
  } else if (draft.id && !updatedAt) {
    return { ok: false, message: RECIPE_STALE, conflict: true }
  }
  const rpc = (ctx.supabase as { rpc?: RecipeRpc }).rpc
  if (!rpc) return { ok: false, message: "Couldn’t save that recipe." }
  const saved = await rpc("save_household_recipe", { p_household_id: ctx.householdId, p_recipe: recipePayload(draft, updatedAt) })
  const saveError = failed(saved.error, "Couldn’t save that recipe.")
  if (saveError) return saveError
  if (saved.data?.code === "others_added") return { ok: false, message: OTHERS_ADDED }
  if (saved.data?.conflict) return { ok: false, message: RECIPE_STALE, conflict: true }
  const recipeId = saved.data?.id ? String(saved.data.id) : draft.id
  if (!saved.data?.ok || !recipeId) return { ok: false, message: "Couldn’t save that recipe." }
  refresh()
  return { ok: true, id: recipeId }
}

export async function deleteRecipeWith(ctx: RecipeWriter, id: string, refresh: () => void): Promise<RecipeActionResult> {
  const denied = blocked(ctx)
  if (denied) return denied
  if (!id.trim()) return { ok: false, message: RECIPE_UNAVAILABLE }
  const removed = await fromTable(ctx, "recipes").delete().eq("id", id).eq("household_id", ctx.householdId).select("id")
  const removeError = failed(removed.error, "Couldn’t remove that recipe.")
  if (removeError) return removeError
  if (!removed.data?.length) return { ok: false, message: RECIPE_UNAVAILABLE }
  refresh()
  return { ok: true, id }
}

export async function copyCatalogRecipeWith(
  ctx: RecipeWriter,
  catalogRecipeId: string,
  visibility: Visibility,
  refresh: () => void,
): Promise<RecipeActionResult> {
  const denied = blocked(ctx)
  if (denied) return denied
  if (!catalogRecipeId.trim()) return { ok: false, message: RECIPE_UNAVAILABLE }
  if (visibility !== "shared" && visibility !== "private") return { ok: false, message: RECIPE_UNAVAILABLE }
  const recipe = await fromTable(ctx, "catalog_recipes")
    .select("id, name, category, servings, steps, notes")
    .eq("id", catalogRecipeId)
    .maybeSingle()
  const recipeError = failed(recipe.error, "Couldn’t add that recipe.")
  if (recipeError) return recipeError
  if (!recipe.data?.id) return { ok: false, message: RECIPE_UNAVAILABLE }
  const existing = await fromTable(ctx, "recipes")
    .select("id, visibility, created_by")
    .eq("household_id", ctx.householdId)
    .eq("catalog_recipe_id", catalogRecipeId)
  const existingError = failed(existing.error, "Couldn’t add that recipe.")
  if (existingError) return existingError
  const rows = existing.data ?? []
  const already =
    visibility === "shared"
      ? rows.find((row) => row.visibility === "shared")
      : rows.find((row) => row.visibility === "private" && row.created_by === ctx.userId)
  if (already?.id) return { ok: true, id: String(already.id) }
  const lines = await fromTable(ctx, "catalog_recipe_ingredients")
    .select("name, quantity, unit, category, sort_order")
    .eq("catalog_recipe_id", catalogRecipeId)
    .order("sort_order", { ascending: true })
  const lineError = failed(lines.error, "Couldn’t add that recipe.")
  if (lineError) return lineError
  const form = new FormData()
  form.set("name", String(recipe.data.name ?? ""))
  if (recipe.data.category) form.set("category", String(recipe.data.category))
  form.set("servings", String(recipe.data.servings ?? ""))
  form.set("steps", recipeSteps(recipe.data.steps).join("\n"))
  if (recipe.data.notes) form.set("notes", String(recipe.data.notes))
  form.set("visibility", visibility)
  form.set("catalog_recipe_id", catalogRecipeId)
  form.set(
    "ingredients",
    JSON.stringify(
      (lines.data ?? []).map((line) => ({
        name: line.name,
        quantity: line.quantity,
        unit: line.unit,
        category: line.category,
      })),
    ),
  )
  return saveRecipeWith(ctx, form, refresh)
}

type SaveItem = (ctx: ShoppingWriter, formData: FormData, refresh: () => void) => Promise<ShoppingActionResult>

export async function addRecipeToShoppingWith(
  ctx: RecipeWriter,
  recipeId: string,
  refresh: () => void,
  saveItem: SaveItem = saveShoppingItemWith,
): Promise<RecipeActionResult> {
  const denied = blocked(ctx)
  if (denied) return denied
  if (!recipeId.trim()) return { ok: false, message: RECIPE_UNAVAILABLE }
  const recipe = await fromTable(ctx, "recipes").select("id, visibility").eq("id", recipeId).eq("household_id", ctx.householdId).maybeSingle()
  const recipeError = failed(recipe.error, "Couldn’t add those ingredients.")
  if (recipeError) return recipeError
  if (!recipe.data?.id) return { ok: false, message: RECIPE_UNAVAILABLE }
  const visibility: Visibility = recipe.data.visibility === "private" ? "private" : "shared"
  const [ingredients, shopping, pantry] = await Promise.all([
    fromTable(ctx, "recipe_ingredients").select("id, name, quantity, unit, category, sort_order").eq("recipe_id", recipeId).eq("household_id", ctx.householdId).order("sort_order", { ascending: true }),
    fromTable(ctx, "shopping_items").select("name, checked_at").eq("household_id", ctx.householdId),
    fromTable(ctx, "pantry_items").select("name").eq("household_id", ctx.householdId),
  ])
  const readError = failed(ingredients.error, "Couldn’t add those ingredients.") || failed(shopping.error, "Couldn’t add those ingredients.") || failed(pantry.error, "Couldn’t add those ingredients.")
  if (readError) return readError
  const rows = ((ingredients.data ?? []) as unknown as RecipeIngredient[]).map((item, index) => ({
    id: String(item.id ?? index),
    name: String(item.name ?? ""),
    quantity: item.quantity == null ? null : String(item.quantity),
    unit: item.unit == null ? null : String(item.unit),
    category: typeof item.category === "string" ? (item.category as ShoppingCategory) : null,
    sort_order: Number(item.sort_order ?? index),
  }))
  const planned = planIngredients(
    rows,
    (shopping.data ?? []).map((item) => ({ name: String(item.name ?? ""), checked_at: (item.checked_at as string | null) ?? null })),
    (pantry.data ?? []).map((item) => ({ name: String(item.name ?? "") })),
  )
  const lines = buildShoppingLines({
    ingredients: rows,
    recipeServings: 1,
    mealServings: 1,
    shopping: (shopping.data ?? []).map((item) => ({ name: String(item.name ?? ""), checked_at: (item.checked_at as string | null) ?? null })),
    pantry: (pantry.data ?? []).map((item) => ({ name: String(item.name ?? "") })),
    includeOnList: false,
  })
  const rpc = (ctx.supabase as { rpc?: RecipeRpc }).rpc
  if (!rpc) return { ok: false, message: "Couldn’t add those ingredients." }
  void saveItem
  const saved = await rpc("add_recipe_to_shopping", {
    p_household_id: ctx.householdId,
    p_add_batch_id: crypto.randomUUID(),
    p_recipe_id: recipeId,
    p_catalog_recipe_id: null,
    p_servings: 1,
    p_lines: lines,
  })
  const saveError = failed(saved.error, "Couldn’t add those ingredients.")
  if (saveError) return saveError
  if (!saved.data?.ok) return { ok: false, message: "Couldn’t add those ingredients." }
  refresh()
  const added = planned.filter((item) => item.plan === "add" && !lines.every((line) => line.name !== item.name)).map((item) => item.name)
  const skipped = planned.filter((item) => !added.includes(item.name)).map((item) => item.name)
  return {
    ok: true,
    id: recipeId,
    added,
    skipped,
    message: visibility === "private" ? ADDED_JUST_ME : undefined,
  }
}
