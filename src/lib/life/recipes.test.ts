import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import { ingredientLine, parseRecipeForm, planIngredients, planLabel, RECIPE_VIEW_ONLY, servingsLabel } from "./recipes.ts"
import { addRecipeToShoppingWith, copyCatalogRecipeWith, deleteRecipeWith, saveRecipeWith, type RecipeWriter } from "./recipes-save.ts"
import type { ShoppingWriter } from "./shopping-save.ts"

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..")
const recipesSql = readFileSync(join(root, "supabase/migrations/20261016121000_recipes.sql"), "utf8")
const revokeSql = readFileSync(join(root, "supabase/migrations/20261016120000_revoke_shopping_anon.sql"), "utf8")

test("anon loses every shopping privilege, including truncate, without touching grants or policies", () => {
  for (const table of ["shopping_lists", "shopping_items", "pantry_items"]) {
    assert.match(revokeSql, new RegExp(`revoke all privileges on table public\\.${table} from anon`, "i"))
    assert.match(revokeSql, new RegExp(`revoke truncate on table public\\.${table} from anon`, "i"))
  }
  assert.doesNotMatch(revokeSql, /grant /i)
  assert.doesNotMatch(revokeSql, /policy/i)
  assert.doesNotMatch(revokeSql, /to authenticated/i)
})

test("starter recipes are catalog seed data, not rows written per household", () => {
  assert.match(recipesSql, /create table public\.catalog_recipes/)
  assert.match(recipesSql, /create table public\.recipes/)
  assert.match(recipesSql, /create table public\.recipe_ingredients/)
  assert.match(recipesSql, /grant select on table public\.catalog_recipes to authenticated/)
  assert.match(recipesSql, /grant select, insert, update, delete on public\.%I to authenticated/)
  assert.match(recipesSql, /revoke all privileges on table public\.%I from anon/)
  assert.match(recipesSql, /can_write_household_content\(household_id\)/)
  assert.match(recipesSql, /can_access_row\(household_id, visibility, created_by\)/)
  assert.match(recipesSql, /raise exception 'That recipe is not available\.'/)
  assert.match(recipesSql, /'recipe_ingredients', 'recipes'/)
  assert.match(recipesSql, /on update no action/)
  assert.match(recipesSql, /on delete cascade/)
  assert.match(recipesSql, /revoke all on function public\.protect_household_member_delete\(\) from public, anon, authenticated, service_role/)
  assert.doesNotMatch(recipesSql, /insert into public\.recipes/i)
  assert.doesNotMatch(recipesSql, /grant\s+\S[\s\S]*?\sto anon/i)
  assert.equal(/DeanFamily|Andrey|Arabella/i.test(recipesSql), false)
  const catalog = recipesSql.slice(0, recipesSql.indexOf("create table public.recipes"))
  assert.equal(catalog.includes("household_id"), false)
})

test("ingredient plans skip the current list and what is already at home", () => {
  const planned = planIngredients(
    [
      ingredient("Chicken thighs"),
      ingredient("Tortillas"),
      ingredient("Limes"),
      ingredient("Milk"),
      ingredient("  "),
    ],
    [
      { name: "Tortilla", checked_at: null },
      { name: "Milk", checked_at: "2026-10-01T00:00:00.000Z" },
    ],
    [{ name: "Lime" }],
  )
  assert.deepEqual(planned.map((item) => [item.name, item.plan]), [
    ["Chicken thighs", "add"],
    ["Tortillas", "list"],
    ["Limes", "home"],
    ["Milk", "add"],
  ])
  assert.equal(planLabel("add"), "Add")
  assert.equal(planLabel("list"), "Already on the list")
  assert.equal(planLabel("home"), "At home")
  assert.equal(ingredientLine({ name: "Vegetable stock", quantity: "1", unit: "l" }), "1 L Vegetable stock")
  assert.equal(servingsLabel(1), "1 serving")
  assert.equal(servingsLabel(4), "4 servings")
})

test("view-only cannot save, delete, copy, or add ingredients", async () => {
  const ctx = writer({
    from() {
      throw new Error("wrote")
    },
  })
  ctx.canWrite = false
  const form = recipeForm()
  for (const result of [
    await saveRecipeWith(ctx, form, () => undefined),
    await deleteRecipeWith(ctx, "recipe-1", () => undefined),
    await copyCatalogRecipeWith(ctx, "catalog-1", "shared", () => undefined),
    await addRecipeToShoppingWith(ctx, "recipe-1", () => undefined),
  ]) {
    assert.deepEqual(result, { ok: false, message: RECIPE_VIEW_ONLY })
  }
})

test("a recipe save and a catalog copy stay inside the caller's household", async () => {
  const store = memory()
  const home = writer(store.supabase, "house-a", "user-a")
  const saved = await saveRecipeWith(home, recipeForm(), () => undefined)
  assert.equal(saved.ok, true)
  assert.equal(store.recipes[0]?.household_id, "house-a")
  assert.equal(store.recipes[0]?.created_by, "user-a")
  assert.equal(store.ingredients[0]?.household_id, "house-a")

  const other = writer(store.supabase, "house-b", "user-b")
  const copied = await copyCatalogRecipeWith(other, "catalog-1", "shared", () => undefined)
  assert.equal(copied.ok, true)
  assert.equal(store.recipes.filter((row) => row.household_id === "house-b").length, 1)
  assert.equal(store.recipes.some((row) => row.household_id === "house-a" && row.created_by === "user-b"), false)
  const again = await copyCatalogRecipeWith(other, "catalog-1", "shared", () => undefined)
  assert.equal(again.ok, true)
  if (again.ok && copied.ok) assert.equal(again.id, copied.id)
  assert.equal(store.recipes.filter((row) => row.household_id === "house-b").length, 1)
})

test("add ingredients to shopping reuses the save path and skips duplicates", async () => {
  const store = memory()
  store.recipes.push({ id: "recipe-1", household_id: "house-a", created_by: "user-a", visibility: "shared", name: "Tacos" })
  store.ingredients.push(
    { recipe_id: "recipe-1", household_id: "house-a", name: "Chicken thighs", quantity: "500", unit: "g", category: "meat", sort_order: 0 },
    { recipe_id: "recipe-1", household_id: "house-a", name: "Tortillas", quantity: "8", unit: "each", category: "bakery", sort_order: 1 },
    { recipe_id: "recipe-1", household_id: "house-a", name: "Lime", quantity: "1", unit: "each", category: "produce", sort_order: 2 },
  )
  store.shopping.push({ household_id: "house-a", name: "Tortilla", checked_at: null })
  store.pantry.push({ household_id: "house-a", name: "Lime" })
  const saved: { name: string; category: string | null; amount: string | null; unit: string | null; visibility: string | null }[] = []
  const result = await addRecipeToShoppingWith(writer(store.supabase, "house-a", "user-a"), "recipe-1", () => undefined, async (_ctx, formData) => {
    saved.push({
      name: String(formData.get("name")),
      category: formData.get("category") ? String(formData.get("category")) : null,
      amount: formData.get("manual_amount_raw") ? String(formData.get("manual_amount_raw")) : null,
      unit: formData.get("manual_unit_raw") ? String(formData.get("manual_unit_raw")) : null,
      visibility: formData.get("visibility") ? String(formData.get("visibility")) : null,
    })
    return { ok: true, id: "item" }
  })
  assert.equal(result.ok, true)
  if (result.ok) {
    assert.deepEqual(result.added, ["Chicken thighs"])
    assert.deepEqual(result.skipped, ["Tortillas", "Lime"])
  }
  assert.deepEqual(saved, [{ name: "Chicken thighs", category: "meat", amount: "500", unit: "g", visibility: "shared" }])
})

test("a recipe form rejects a missing name and keeps an optional category empty", () => {
  const missing = new FormData()
  missing.set("servings", "4")
  assert.equal(parseRecipeForm(missing).ok, false)
  const form = recipeForm()
  form.delete("category")
  const parsed = parseRecipeForm(form)
  assert.equal(parsed.ok, true)
  if (parsed.ok) {
    assert.equal(parsed.draft.category, null)
    assert.equal(parsed.draft.ingredients[0]?.category, "produce")
    assert.equal(parsed.draft.ingredients[1]?.category, null)
  }
})

function ingredient(name: string) {
  return { id: name, name, quantity: null, unit: null, category: null, sort_order: 0 }
}

function recipeForm() {
  const form = new FormData()
  form.set("name", "Weeknight tacos")
  form.set("category", "Dinner")
  form.set("servings", "4")
  form.set("steps", "Warm the tortillas.\nCook the filling.")
  form.set("notes", "Tuesday night.")
  form.set("visibility", "shared")
  form.set(
    "ingredients",
    JSON.stringify([
      { name: "Onion", quantity: "1", unit: "each", category: "produce" },
      { name: "Salsa", quantity: "1", unit: "cup", category: "" },
    ]),
  )
  return form
}

function writer(supabase: ShoppingWriter["supabase"], householdId = "house-a", userId = "user-a"): RecipeWriter {
  return { supabase, householdId, userId, lastVisibility: "shared", canWrite: true }
}

type Row = Record<string, unknown>

function memory() {
  const recipes: Row[] = []
  const ingredients: Row[] = []
  const shopping: Row[] = []
  const pantry: Row[] = []
  const catalog = [
    { id: "catalog-1", name: "Pancakes", category: "Breakfast", servings: 4, steps: ["Mix the batter."], notes: null },
  ]
  const catalogIngredients = [
    { catalog_recipe_id: "catalog-1", name: "Flour", quantity: "200", unit: "g", category: "pantry", sort_order: 0 },
  ]
  const tables: Record<string, Row[]> = {
    recipes,
    recipe_ingredients: ingredients,
    shopping_items: shopping,
    pantry_items: pantry,
    catalog_recipes: catalog,
    catalog_recipe_ingredients: catalogIngredients,
  }
  const supabase: ShoppingWriter["supabase"] = {
    from(table: string) {
      const filters: [string, unknown][] = []
      let pending: Row | Row[] | null = null
      const rows = () => (tables[table] ?? []).filter((row) => filters.every(([column, value]) => row[column] === value))
      const api = {
        select() {
          return api
        },
        eq(column: string, value: unknown) {
          filters.push([column, value])
          return api
        },
        order() {
          return api
        },
        insert(value: Row | Row[]) {
          pending = value
          const incoming = Array.isArray(value) ? value : [value]
          for (const row of incoming) {
            tables[table].push({ id: `${table}-${tables[table].length + 1}`, ...row })
          }
          return api
        },
        update(value: Row) {
          pending = value
          for (const row of rows()) Object.assign(row, value)
          return api
        },
        delete() {
          const matched = rows()
          const kept = tables[table].filter((row) => !matched.includes(row))
          tables[table].splice(0, tables[table].length, ...kept)
          pending = matched
          return api
        },
        maybeSingle() {
          const matched = rows()
          return Promise.resolve({ data: matched[0] ?? null, error: null })
        },
        single() {
          const matched = rows()
          const data = pending && !Array.isArray(pending) ? matched[matched.length - 1] ?? null : matched[0] ?? null
          return Promise.resolve({ data, error: null })
        },
        then(onfulfilled: (value: { data: Row[] | null; error: null }) => unknown) {
          const data = Array.isArray(pending) ? pending : rows()
          return Promise.resolve({ data, error: null }).then(onfulfilled)
        },
      }
      return api
    },
  }
  return { supabase, recipes, ingredients, shopping, pantry }
}
