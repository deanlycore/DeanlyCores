import type { ShoppingCategory } from "@/lib/life/shopping"
import { saveShoppingItemWith, type ShoppingActionResult, type ShoppingWriter } from "@/lib/life/shopping-save"
import type { Visibility } from "@/lib/visibility"

import { parseRecipeForm, planIngredients, RECIPE_UNAVAILABLE, RECIPE_VIEW_ONLY, recipeDbMessage, recipeSteps, type RecipeIngredient } from "@/lib/life/recipes"

export type RecipeActionResult = { ok: true; id?: string; added?: string[]; skipped?: string[] } | { ok: false; message: string }

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

function ingredientRows(
  ctx: RecipeWriter,
  recipeId: string,
  visibility: Visibility,
  ingredients: { name: string; quantity: string | null; unit: string | null; category: ShoppingCategory | null }[],
) {
  return ingredients.map((item, index) => ({
    recipe_id: recipeId,
    household_id: ctx.householdId,
    created_by: ctx.userId,
    visibility,
    name: item.name,
    quantity: item.quantity,
    unit: item.unit,
    category: item.category,
    sort_order: index,
  }))
}

async function replaceIngredients(
  ctx: RecipeWriter,
  recipeId: string,
  visibility: Visibility,
  ingredients: { name: string; quantity: string | null; unit: string | null; category: ShoppingCategory | null }[],
) {
  const removed = await fromTable(ctx, "recipe_ingredients").delete().eq("recipe_id", recipeId).eq("household_id", ctx.householdId)
  const removeError = failed(removed.error, "Couldn’t save that recipe.")
  if (removeError) return removeError
  if (!ingredients.length) return null
  const inserted = await fromTable(ctx, "recipe_ingredients").insert(ingredientRows(ctx, recipeId, visibility, ingredients))
  return failed(inserted.error, "Couldn’t save that recipe.")
}

export async function saveRecipeWith(ctx: RecipeWriter, formData: FormData, refresh: () => void): Promise<RecipeActionResult> {
  const denied = blocked(ctx)
  if (denied) return denied
  const parsed = parseRecipeForm(formData)
  if (!parsed.ok) return parsed
  const { draft } = parsed
  const fields = {
    name: draft.name,
    category: draft.category,
    servings: draft.servings,
    steps: draft.steps,
    notes: draft.notes,
    visibility: draft.visibility,
  }
  if (draft.id) {
    const saved = await fromTable(ctx, "recipes").update(fields).eq("id", draft.id).eq("household_id", ctx.householdId).select("id")
    const saveError = failed(saved.error, "Couldn’t save that recipe.")
    if (saveError) return saveError
    if (!saved.data?.length) return { ok: false, message: RECIPE_UNAVAILABLE }
    const ingredients = await replaceIngredients(ctx, draft.id, draft.visibility, draft.ingredients)
    if (ingredients) return ingredients
    refresh()
    return { ok: true, id: draft.id }
  }
  const created = await fromTable(ctx, "recipes")
    .insert({
      household_id: ctx.householdId,
      created_by: ctx.userId,
      catalog_recipe_id: draft.catalogRecipeId,
      ...fields,
    })
    .select("id")
    .single()
  const createError = failed(created.error, "Couldn’t save that recipe.")
  if (createError || !created.data?.id) return createError ?? { ok: false, message: "Couldn’t save that recipe." }
  const recipeId = String(created.data.id)
  const ingredients = await replaceIngredients(ctx, recipeId, draft.visibility, draft.ingredients)
  if (ingredients) return ingredients
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
  const planned = planIngredients(
    ((ingredients.data ?? []) as unknown as RecipeIngredient[]).map((item, index) => ({
      id: String(item.id ?? index),
      name: String(item.name ?? ""),
      quantity: item.quantity == null ? null : String(item.quantity),
      unit: item.unit == null ? null : String(item.unit),
      category: typeof item.category === "string" ? (item.category as ShoppingCategory) : null,
      sort_order: Number(item.sort_order ?? index),
    })),
    (shopping.data ?? []).map((item) => ({ name: String(item.name ?? ""), checked_at: (item.checked_at as string | null) ?? null })),
    (pantry.data ?? []).map((item) => ({ name: String(item.name ?? "") })),
  )
  const added: string[] = []
  const skipped = planned.filter((item) => item.plan !== "add").map((item) => item.name)
  for (const item of planned) {
    if (item.plan !== "add") continue
    const form = new FormData()
    form.set("name", item.name)
    if (item.quantity) form.set("manual_amount_raw", item.quantity)
    if (item.unit) form.set("manual_unit_raw", item.unit)
    if (item.category) form.set("category", item.category)
    form.set("visibility", visibility)
    const saved = await saveItem(ctx, form, refresh)
    if (!saved.ok) return saved
    added.push(item.name)
  }
  return { ok: true, id: recipeId, added, skipped }
}
