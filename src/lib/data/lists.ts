import { requireHousehold } from "@/lib/data/context"
import { monthStart } from "@/lib/home/metrics"
import type { PantryRow, ShoppingListRow } from "@/lib/life/shopping"
import { optionalShoppingCategory, recipeSteps, type RecipeIngredient, type RecipeRow, type StarterRecipe } from "@/lib/life/recipes"
import type {
  BillRow,
  EventRow,
  ExpenseRow,
  GoalRow,
  MealRow,
  NoteRow,
  ShoppingRow,
  MoneyCardRow,
  MoneyPaymentRow,
  MoneyPersonRow,
  SubscriptionRow,
  TaskRow,
  VaultRow,
} from "@/lib/data/home"

async function listed<T>(
  run: PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
) {
  const ctx = await requireHousehold()
  if (!ctx) return { rows: [] as T[], error: false, currency: "USD", visibility: "shared" as const }
  const { data, error } = await run
  return {
    rows: data ?? [],
    error: Boolean(error),
    currency: ctx.currency,
    visibility: ctx.lastVisibility,
  }
}

export async function listMonthBudget(today: string) {
  const ctx = await requireHousehold()
  if (!ctx) return { amountCents: null as number | null, error: false }
  const { data, error } = await ctx.supabase
    .from("budgets")
    .select("amount_cents, visibility, owner_id")
    .eq("household_id", ctx.householdId)
    .eq("period_month", monthStart(today))
  if (error) return { amountCents: null, error: true }
  const shared = (data ?? []).find((row) => row.visibility === "shared")
  const personal = (data ?? []).find((row) => row.visibility === "private" && row.owner_id === ctx.userId)
  const chosen = shared ?? personal ?? null
  return { amountCents: chosen ? chosen.amount_cents : null, error: false }
}

export async function listBills() {
  const ctx = await requireHousehold()
  if (!ctx) return listed<BillRow>(Promise.resolve({ data: [], error: null }))
  const full = await ctx.supabase
    .from("bills")
    .select("id, name, amount_cents, due_on, paid_at, visibility, category")
    .eq("household_id", ctx.householdId)
    .order("due_on", { ascending: true })
    .limit(100)
  if (!columnMissing(full.error)) {
    return {
      rows: full.data ?? [],
      error: Boolean(full.error),
      currency: ctx.currency,
      visibility: ctx.lastVisibility,
    }
  }
  return listed<BillRow>(
    ctx.supabase
      .from("bills")
      .select("id, name, amount_cents, due_on, paid_at, visibility")
      .eq("household_id", ctx.householdId)
      .order("due_on", { ascending: true })
      .limit(100),
  )
}

export async function listTasks() {
  const ctx = await requireHousehold()
  if (!ctx) return listed<TaskRow>(Promise.resolve({ data: [], error: null }))
  return listed<TaskRow>(
    ctx.supabase
      .from("tasks")
      .select("id, title, due_on, completed_at, visibility")
      .eq("household_id", ctx.householdId)
      .order("due_on", { ascending: true, nullsFirst: false })
      .limit(100),
  )
}

export async function listEvents() {
  const ctx = await requireHousehold()
  if (!ctx) return listed<EventRow>(Promise.resolve({ data: [], error: null }))
  return listed<EventRow>(
    ctx.supabase
      .from("calendar_events")
      .select("id, title, starts_at, ends_at, location, visibility")
      .eq("household_id", ctx.householdId)
      .order("starts_at", { ascending: true })
      .limit(80),
  )
}

export async function listMeals() {
  const ctx = await requireHousehold()
  if (!ctx) return listed<MealRow>(Promise.resolve({ data: [], error: null }))
  const full = await ctx.supabase
    .from("meals")
    .select("id, title, meal_on, slot, notes, visibility, servings, recipe_id, catalog_recipe_id, updated_at, owner_id")
    .eq("household_id", ctx.householdId)
    .order("meal_on", { ascending: true })
    .limit(200)
  if (!full.error) return { rows: (full.data ?? []) as MealRow[], error: false, currency: ctx.currency, visibility: ctx.lastVisibility }
  if (!columnMissing(full.error)) return { rows: [] as MealRow[], error: true, currency: ctx.currency, visibility: ctx.lastVisibility }
  return listed<MealRow>(
    ctx.supabase
      .from("meals")
      .select("id, title, meal_on, slot, notes, visibility")
      .eq("household_id", ctx.householdId)
      .order("meal_on", { ascending: true })
      .limit(80),
  )
}

export async function listMealNeedCounts() {
  const counts = new Map<string, number>()
  const ctx = await requireHousehold()
  if (!ctx) return counts
  const links = await ctx.supabase.from("meal_shopping_needs").select("meal_id, shopping_item_id").eq("household_id", ctx.householdId)
  if (links.error) return counts
  const itemIds = [...new Set((links.data ?? []).map((link) => link.shopping_item_id))]
  if (itemIds.length === 0) return counts
  const items = await ctx.supabase.from("shopping_items").select("id, checked_at").eq("household_id", ctx.householdId).in("id", itemIds)
  if (items.error) return counts
  const open = new Set((items.data ?? []).filter((item) => !item.checked_at).map((item) => item.id))
  for (const link of links.data ?? []) {
    if (!link.meal_id || !open.has(link.shopping_item_id)) continue
    counts.set(link.meal_id, (counts.get(link.meal_id) ?? 0) + 1)
  }
  return counts
}

export async function listMealShoppingLines() {
  const lines: { mealId: string; checked: boolean; priceCents: number | null }[] = []
  const ctx = await requireHousehold()
  if (!ctx) return lines
  const links = await ctx.supabase.from("meal_shopping_needs").select("meal_id, shopping_item_id").eq("household_id", ctx.householdId)
  if (links.error) return lines
  const itemIds = [...new Set((links.data ?? []).map((link) => link.shopping_item_id))]
  if (itemIds.length === 0) return lines
  const items = await ctx.supabase
    .from("shopping_items")
    .select("id, checked_at, price_cents")
    .eq("household_id", ctx.householdId)
    .in("id", itemIds)
  if (items.error) return lines
  const byId = new Map((items.data ?? []).map((item) => [item.id, item]))
  for (const link of links.data ?? []) {
    const item = link.shopping_item_id ? byId.get(link.shopping_item_id) : null
    if (!link.meal_id || !item) continue
    lines.push({ mealId: link.meal_id, checked: Boolean(item.checked_at), priceCents: item.price_cents ?? null })
  }
  return lines
}

export async function listMealLabels(itemIds: string[]) {
  const labels = new Map<string, string>()
  const ctx = await requireHousehold()
  if (!ctx || itemIds.length === 0) return labels
  const links = await ctx.supabase
    .from("meal_shopping_needs")
    .select("shopping_item_id, meal_id")
    .eq("household_id", ctx.householdId)
    .in("shopping_item_id", itemIds)
  if (links.error) return labels
  const mealIds = [...new Set((links.data ?? []).map((link) => link.meal_id).filter((id): id is string => Boolean(id)))]
  if (mealIds.length === 0) return labels
  const meals = await ctx.supabase.from("meals").select("id, title").eq("household_id", ctx.householdId).in("id", mealIds)
  if (meals.error) return labels
  const titles = new Map((meals.data ?? []).map((meal) => [meal.id, meal.title]))
  const grouped = new Map<string, string[]>()
  for (const link of links.data ?? []) {
    const title = link.meal_id ? titles.get(link.meal_id) : null
    if (!title) continue
    const current = grouped.get(link.shopping_item_id) ?? []
    if (!current.includes(title)) current.push(title)
    grouped.set(link.shopping_item_id, current)
  }
  for (const [id, titlesForItem] of grouped) labels.set(id, titlesForItem.join(", "))
  return labels
}

const SHOPPING_COLUMNS = "id, name, checked_at, visibility, store, need_soon, list_id, manual_amount_raw, manual_unit_raw, manual_qty, manual_unit, auto_qty, auto_unit, price_cents, notes, category, updated_at"

export async function listShopping() {
  const ctx = await requireHousehold()
  if (!ctx) return listed<ShoppingRow>(Promise.resolve({ data: [], error: null }))
  const full = await ctx.supabase
    .from("shopping_items")
    .select(SHOPPING_COLUMNS)
    .eq("household_id", ctx.householdId)
    .order("created_at", { ascending: false })
    .limit(200)
  if (!full.error) {
    return { rows: full.data ?? [], error: false, currency: ctx.currency, visibility: ctx.lastVisibility }
  }
  const missingStore = /column/i.test(full.error.message) && /does not exist/i.test(full.error.message)
  if (!missingStore) return { rows: [] as ShoppingRow[], error: true, currency: ctx.currency, visibility: ctx.lastVisibility }
  return listed<ShoppingRow>(
    ctx.supabase
      .from("shopping_items")
      .select("id, name, checked_at, visibility")
      .eq("household_id", ctx.householdId)
      .order("created_at", { ascending: false })
      .limit(80),
  )
}

export async function listShoppingLists() {
  const ctx = await requireHousehold()
  if (!ctx) return { rows: [] as ShoppingListRow[], error: false }
  const result = await ctx.supabase
    .from("shopping_lists")
    .select("id, name, visibility, is_default, created_by, updated_at")
    .eq("household_id", ctx.householdId)
    .order("name", { ascending: true })
  if (result.error && (columnMissing(result.error) || relationMissing(result.error))) return { rows: [] as ShoppingListRow[], error: false }
  return { rows: (result.data ?? []) as ShoppingListRow[], error: Boolean(result.error) }
}

export async function listPantry() {
  const ctx = await requireHousehold()
  if (!ctx) return { rows: [] as PantryRow[], error: false }
  const result = await ctx.supabase
    .from("pantry_items")
    .select("id, name, manual_amount_raw, manual_unit_raw, manual_qty, manual_unit, auto_qty, auto_unit, category, notes, visibility, shopping_item_id, updated_at")
    .eq("household_id", ctx.householdId)
    .order("name", { ascending: true })
  if (result.error && (columnMissing(result.error) || relationMissing(result.error))) return { rows: [] as PantryRow[], error: false }
  return { rows: (result.data ?? []) as PantryRow[], error: Boolean(result.error) }
}

export async function listGoals() {
  const ctx = await requireHousehold()
  if (!ctx) return listed<GoalRow>(Promise.resolve({ data: [], error: null }))
  const full = await ctx.supabase
    .from("goals")
    .select("id, name, target_cents, current_cents, visibility, category")
    .eq("household_id", ctx.householdId)
    .order("created_at", { ascending: false })
    .limit(40)
  if (!columnMissing(full.error)) {
    return {
      rows: full.data ?? [],
      error: Boolean(full.error),
      currency: ctx.currency,
      visibility: ctx.lastVisibility,
    }
  }
  return listed<GoalRow>(
    ctx.supabase
      .from("goals")
      .select("id, name, target_cents, current_cents, visibility")
      .eq("household_id", ctx.householdId)
      .order("created_at", { ascending: false })
      .limit(40),
  )
}

export async function listExpenses(kind: "expense" | "income") {
  const ctx = await requireHousehold()
  if (!ctx) return listed<ExpenseRow>(Promise.resolve({ data: [], error: null }))
  const full = await ctx.supabase
    .from("expenses")
    .select("id, name, amount_cents, kind, spent_on, visibility, category")
    .eq("household_id", ctx.householdId)
    .eq("kind", kind)
    .order("spent_on", { ascending: false })
    .limit(60)
  if (!columnMissing(full.error)) {
    return {
      rows: full.data ?? [],
      error: Boolean(full.error),
      currency: ctx.currency,
      visibility: ctx.lastVisibility,
    }
  }
  return listed<ExpenseRow>(
    ctx.supabase
      .from("expenses")
      .select("id, name, amount_cents, kind, spent_on, visibility")
      .eq("household_id", ctx.householdId)
      .eq("kind", kind)
      .order("spent_on", { ascending: false })
      .limit(60),
  )
}

export async function listNotes() {
  const ctx = await requireHousehold()
  if (!ctx) return listed<NoteRow>(Promise.resolve({ data: [], error: null }))
  return listed<NoteRow>(
    ctx.supabase
      .from("notes")
      .select("id, title, body, visibility, updated_at")
      .eq("household_id", ctx.householdId)
      .order("updated_at", { ascending: false })
      .limit(40),
  )
}

export async function listDocuments() {
  const ctx = await requireHousehold()
  if (!ctx) return listed<VaultRow>(Promise.resolve({ data: [], error: null }))
  return listed<VaultRow>(
    ctx.supabase
      .from("vault_documents")
      .select("id, name, mime_type, size_bytes, storage_path, visibility, created_at")
      .eq("household_id", ctx.householdId)
      .order("created_at", { ascending: false })
      .limit(40),
  )
}

function relationMissing(error: { message: string } | null) {
  return Boolean(error && /does not exist|schema cache/i.test(error.message))
}

function columnMissing(error: { message: string } | null) {
  return Boolean(error && /column/i.test(error.message) && /does not exist|schema cache/i.test(error.message))
}

export async function listMoneyCards() {
  const ctx = await requireHousehold()
  if (!ctx) return listed<MoneyCardRow>(Promise.resolve({ data: [], error: null }))
  const result = await ctx.supabase
    .from("money_cards")
    .select("id, name, amount_cents, due_on, note, visibility, category, limit_cents")
    .eq("household_id", ctx.householdId)
    .order("name", { ascending: true })
    .limit(100)
  if (columnMissing(result.error)) {
    return listed<MoneyCardRow>(
      ctx.supabase
        .from("money_cards")
        .select("id, name, amount_cents, due_on, note, visibility")
        .eq("household_id", ctx.householdId)
        .order("name", { ascending: true })
        .limit(100),
    )
  }
  if (relationMissing(result.error)) {
    return { rows: [] as MoneyCardRow[], error: false, currency: ctx.currency, visibility: ctx.lastVisibility }
  }
  return {
    rows: result.data ?? [],
    error: Boolean(result.error),
    currency: ctx.currency,
    visibility: ctx.lastVisibility,
  }
}

export async function listMoneyPeople() {
  const ctx = await requireHousehold()
  if (!ctx) return listed<MoneyPersonRow>(Promise.resolve({ data: [], error: null }))
  const result = await ctx.supabase
    .from("money_people")
    .select("id, name, amount_cents, due_on, note, visibility, direction")
    .eq("household_id", ctx.householdId)
    .order("name", { ascending: true })
    .limit(100)
  if (columnMissing(result.error)) {
    return listed<MoneyPersonRow>(
      ctx.supabase
        .from("money_people")
        .select("id, name, amount_cents, due_on, note, visibility")
        .eq("household_id", ctx.householdId)
        .order("name", { ascending: true })
        .limit(100),
    )
  }
  if (relationMissing(result.error)) {
    return { rows: [] as MoneyPersonRow[], error: false, currency: ctx.currency, visibility: ctx.lastVisibility }
  }
  return {
    rows: result.data ?? [],
    error: Boolean(result.error),
    currency: ctx.currency,
    visibility: ctx.lastVisibility,
  }
}

export async function listMoneyPayments() {
  const ctx = await requireHousehold()
  if (!ctx) return listed<MoneyPaymentRow>(Promise.resolve({ data: [], error: null }))
  const result = await ctx.supabase
    .from("money_payments")
    .select("id, bill_id, card_id, person_id, amount_cents, paid_on, note")
    .eq("household_id", ctx.householdId)
    .order("paid_on", { ascending: true })
    .limit(500)
  if (relationMissing(result.error)) {
    return { rows: [] as MoneyPaymentRow[], error: false, currency: ctx.currency, visibility: ctx.lastVisibility }
  }
  return {
    rows: result.data ?? [],
    error: Boolean(result.error),
    currency: ctx.currency,
    visibility: ctx.lastVisibility,
  }
}

export async function listSubscriptions() {
  const ctx = await requireHousehold()
  if (!ctx) return listed<SubscriptionRow>(Promise.resolve({ data: [], error: null }))
  const full = await ctx.supabase
    .from("subscriptions")
    .select("id, name, amount_cents, renews_on, active, visibility, category, cadence")
    .eq("household_id", ctx.householdId)
    .order("renews_on", { ascending: true })
    .limit(40)
  if (!columnMissing(full.error)) {
    return {
      rows: full.data ?? [],
      error: Boolean(full.error),
      currency: ctx.currency,
      visibility: ctx.lastVisibility,
    }
  }
  return listed<SubscriptionRow>(
    ctx.supabase
      .from("subscriptions")
      .select("id, name, amount_cents, renews_on, active, visibility")
      .eq("household_id", ctx.householdId)
      .order("renews_on", { ascending: true })
      .limit(40),
  )
}

export async function listMoneyOverviewSources() {
  const [bills, income, goals, subscriptions, cards, people, payments] = await Promise.all([
    listBills(),
    listExpenses("income"),
    listGoals(),
    listSubscriptions(),
    listMoneyCards(),
    listMoneyPeople(),
    listMoneyPayments(),
  ])
  return { bills, income, goals, subscriptions, cards, people, payments }
}

export type RecipeLibrary = {
  rows: RecipeRow[]
  starters: StarterRecipe[]
  error: boolean
  canWrite: boolean
}

function ingredientOf(row: { id: string; name: string; quantity: string | null; unit: string | null; category: string | null; sort_order: number }): RecipeIngredient {
  return {
    id: row.id,
    name: row.name,
    quantity: row.quantity,
    unit: row.unit,
    category: optionalShoppingCategory(row.category),
    sort_order: row.sort_order,
  }
}

export async function listRecipes(): Promise<RecipeLibrary> {
  const ctx = await requireHousehold()
  if (!ctx) return { rows: [], starters: [], error: false, canWrite: false }
  const [recipes, ingredients, catalog, catalogIngredients] = await Promise.all([
    ctx.supabase
      .from("recipes")
      .select("id, name, category, servings, steps, notes, visibility, catalog_recipe_id, created_by, updated_at")
      .eq("household_id", ctx.householdId)
      .order("name", { ascending: true }),
    ctx.supabase
      .from("recipe_ingredients")
      .select("id, recipe_id, name, quantity, unit, category, sort_order")
      .eq("household_id", ctx.householdId)
      .order("sort_order", { ascending: true }),
    ctx.supabase.from("catalog_recipes").select("id, name, category, servings, steps, notes, sort_order").order("sort_order", { ascending: true }),
    ctx.supabase.from("catalog_recipe_ingredients").select("id, catalog_recipe_id, name, quantity, unit, category, sort_order").order("sort_order", { ascending: true }),
  ])
  const missing = [recipes.error, ingredients.error, catalog.error, catalogIngredients.error].some(
    (error) => relationMissing(error) || columnMissing(error),
  )
  if (missing) return { rows: [], starters: [], error: false, canWrite: ctx.canWrite }
  if (recipes.error || ingredients.error || catalog.error || catalogIngredients.error) {
    return { rows: [], starters: [], error: true, canWrite: ctx.canWrite }
  }
  const ingredientRows = ingredients.data ?? []
  const rows: RecipeRow[] = (recipes.data ?? []).map((recipe) => ({
    id: recipe.id,
    name: recipe.name,
    category: recipe.category,
    servings: recipe.servings,
    steps: recipeSteps(recipe.steps),
    notes: recipe.notes,
    visibility: recipe.visibility,
    catalog_recipe_id: recipe.catalog_recipe_id,
    created_by: recipe.created_by,
    updated_at: recipe.updated_at,
    ingredients: ingredientRows.filter((item) => item.recipe_id === recipe.id).map(ingredientOf),
  }))
  const copied = new Map(rows.filter((recipe) => recipe.catalog_recipe_id).map((recipe) => [recipe.catalog_recipe_id, recipe.id]))
  const catalogLines = catalogIngredients.data ?? []
  const starters: StarterRecipe[] = (catalog.data ?? []).map((recipe) => ({
    id: recipe.id,
    name: recipe.name,
    category: recipe.category,
    servings: recipe.servings,
    steps: recipeSteps(recipe.steps),
    notes: recipe.notes,
    copiedId: copied.get(recipe.id) ?? null,
    ingredients: catalogLines.filter((item) => item.catalog_recipe_id === recipe.id).map(ingredientOf),
  }))
  return { rows, starters, error: false, canWrite: ctx.canWrite }
}

export async function getRecipe(id: string) {
  const library = await listRecipes()
  const recipe = library.rows.find((row) => row.id === id) ?? null
  const ctx = await requireHousehold()
  if (!ctx || !recipe) return { recipe, shopping: [] as { name: string; checked_at: string | null }[], pantry: [] as { name: string }[], error: library.error, canWrite: library.canWrite }
  const [shopping, pantry] = await Promise.all([
    ctx.supabase.from("shopping_items").select("name, checked_at").eq("household_id", ctx.householdId),
    ctx.supabase.from("pantry_items").select("name").eq("household_id", ctx.householdId),
  ])
  if (shopping.error || pantry.error) return { recipe, shopping: [], pantry: [], error: true, canWrite: library.canWrite }
  return {
    recipe,
    shopping: shopping.data ?? [],
    pantry: pantry.data ?? [],
    error: false,
    canWrite: library.canWrite,
  }
}

export async function getNote(id: string) {
  const ctx = await requireHousehold()
  if (!ctx) return null
  const { data } = await ctx.supabase
    .from("notes")
    .select("id, title, body, visibility, updated_at")
    .eq("household_id", ctx.householdId)
    .eq("id", id)
    .maybeSingle()
  return data
}
