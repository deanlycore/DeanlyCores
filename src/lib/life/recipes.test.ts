import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import { ADDED_JUST_ME, browseSavedCount, ingredientLine, justMeListLine, parseRecipeForm, planIngredients, planLabel, RECIPE_REFERENCE, RECIPE_STALE, RECIPE_UNAVAILABLE, RECIPE_VIEW_ONLY, recipeDbMessage, seededExampleCount, servingsLabel } from "./recipes.ts"
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

test("seeded sample recipes count as examples, and Browse copies count as saved", () => {
  assert.equal(seededExampleCount(1), "1 example")
  assert.equal(seededExampleCount(2), "2 examples")
  assert.equal(browseSavedCount(1), "1 saved")
  assert.equal(browseSavedCount(2), "2 saved")
  const board = readFileSync(join(root, "src/components/life/recipes-board.tsx"), "utf8")
  assert.match(board, /seededExampleCount\(visibleStarters\.length\)/)
  assert.doesNotMatch(board, /starter\$\{/)
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
  assert.match(recipesSql, /deferrable initially deferred/)
  assert.match(recipesSql, /security invoker/)
  assert.match(recipesSql, /set search_path to 'public'/)
  assert.match(recipesSql, /revoke all on function public\.save_household_recipe\(jsonb\) from public, anon/)
  assert.match(recipesSql, /grant execute on function public\.save_household_recipe\(jsonb\) to authenticated/)
  assert.doesNotMatch(recipesSql, /grant execute on function public\.save_household_recipe\(jsonb\) to anon/)
  assert.doesNotMatch(recipesSql, /grant execute on function public\.save_household_recipe\(jsonb\) to public/)
  assert.match(recipesSql, /char_length\(step\.value\) > 2000/)
  assert.match(recipesSql, /constraint catalog_recipes_steps_ok check \(public\.recipe_steps_within_limit\(steps\)\)/)
  assert.match(recipesSql, /constraint recipes_steps_ok check \(public\.recipe_steps_within_limit\(steps\)\)/)
  assert.match(recipesSql, /revoke all on function public\.recipe_steps_within_limit\(jsonb\) from public, anon/)
  assert.match(recipesSql, /grant execute on function public\.recipe_steps_within_limit\(jsonb\) to authenticated/)
  assert.match(recipesSql, /revoke all on function public\.protect_household_member_delete\(\) from public, anon, authenticated, service_role/)
  const beforeSave = recipesSql.slice(0, recipesSql.indexOf("create or replace function public.save_household_recipe"))
  assert.doesNotMatch(beforeSave, /insert into public\.recipes/i)
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
  assert.equal(ingredientLine({ name: "Eggs", quantity: "3", unit: "each" }), "3 Eggs")
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
    await copyCatalogRecipeWith(ctx, CATALOG_ID, "shared", () => undefined),
    await addRecipeToShoppingWith(ctx, "recipe-1", () => undefined, "b8b8b8b8-b8b8-48b8-88b8-b8b8b8b8b8b8"),
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
  const copied = await copyCatalogRecipeWith(other, CATALOG_ID, "shared", () => undefined)
  assert.equal(copied.ok, true)
  assert.equal(store.recipes.filter((row) => row.household_id === "house-b").length, 1)
  assert.equal(store.recipes.some((row) => row.household_id === "house-a" && row.created_by === "user-b"), false)
  const again = await copyCatalogRecipeWith(other, CATALOG_ID, "shared", () => undefined)
  assert.equal(again.ok, true)
  if (again.ok && copied.ok) assert.equal(again.id, copied.id)
  assert.equal(store.recipes.filter((row) => row.household_id === "house-b").length, 1)
})

test("add ingredients to shopping skips the list and pantry and never sends manual fields", async () => {
  const store = memory()
  store.recipes.push({ id: "recipe-1", household_id: "house-a", created_by: "user-a", visibility: "shared", name: "Tacos" })
  store.ingredients.push(
    { id: "line-chicken", recipe_id: "recipe-1", household_id: "house-a", name: "Chicken thighs", quantity: "500", unit: "g", category: "meat", sort_order: 0 },
    { id: "line-tortilla", recipe_id: "recipe-1", household_id: "house-a", name: "Tortillas", quantity: "8", unit: "each", category: "bakery", sort_order: 1 },
    { id: "line-lime", recipe_id: "recipe-1", household_id: "house-a", name: "Lime", quantity: "1", unit: "each", category: "produce", sort_order: 2 },
  )
  store.shopping.push({ household_id: "house-a", name: "Tortilla", checked_at: null })
  store.pantry.push({ household_id: "house-a", name: "Lime" })
  const result = await addRecipeToShoppingWith(writer(store.supabase, "house-a", "user-a"), "recipe-1", () => undefined, "b8b8b8b8-b8b8-48b8-88b8-b8b8b8b8b8b8")
  assert.equal(result.ok, true)
  if (result.ok) {
    assert.deepEqual(result.added, ["Chicken thighs"])
    assert.deepEqual(result.skipped, ["Tortillas", "Lime"])
  }
  const call = (store.bound as { last?: { fn: string; args: { p_lines?: { name: string; match_key: string }[] } } }).last
  assert.equal(call?.fn, "add_recipe_to_shopping")
  assert.deepEqual(call?.args.p_lines?.map((line) => line.name), ["Chicken thighs"])
  assert.equal(JSON.stringify(call?.args.p_lines).includes("manual_"), false)
})

test("a repeated shopping batch does not double auto_qty or the links", async () => {
  const store = memory()
  store.recipes.push({ id: "recipe-onion", household_id: "house-a", created_by: "user-a", visibility: "shared", name: "Onion bowl", servings: 2 })
  store.ingredients.push({ id: "line-onion", recipe_id: "recipe-onion", household_id: "house-a", name: "Onion", quantity: "2", unit: "each", category: "produce", sort_order: 0 })
  const batch = "b8b8b8b8-b8b8-48b8-88b8-b8b8b8b8b8b8"
  const home = writer(store.supabase, "house-a", "user-a")
  const first = await addRecipeToShoppingWith(home, "recipe-onion", () => undefined, batch)
  const second = await addRecipeToShoppingWith(home, "recipe-onion", () => undefined, batch)
  assert.equal(first.ok, true)
  assert.equal(second.ok, true)
  const saved = store.bound.batches.get(batch)
  assert.equal(saved?.links, 1)
  assert.equal(saved?.qty, 2)
  const calls = (store.bound as { last?: { args: { p_add_batch_id?: string } } }).last
  assert.equal(calls?.args.p_add_batch_id, batch)
  assert.equal(store.bound.batches.size, 1)
  assert.doesNotMatch(readFileSync(join(root, "src/lib/life/recipes-save.ts"), "utf8"), /randomUUID/)
  assert.match(readFileSync(join(root, "src/components/life/recipe-detail.tsx"), "utf8"), /disabled=\{pendingAdd/)
})

test("just me confirm copy stays future tense until the add succeeds", () => {
  assert.equal(justMeListLine(false), "Adds to your Just me list.")
  assert.equal(justMeListLine(true), "Added to your Just me list.")
  assert.equal(ADDED_JUST_ME, "Added to your Just me list.")
  const detail = readFileSync(join(root, "src/components/life/recipe-detail.tsx"), "utf8")
  assert.match(detail, /const settled = recipe\.visibility === "private" && \(added !== null \|\| notice === ADDED_JUST_ME\)/)
  assert.match(detail, /justMeListLine\(settled\)/)
  assert.match(detail, /On your list/)
  assert.match(detail, /canWrite && !settled/)
  assert.match(detail, /visibility !== "private" && added/)
  const form = readFileSync(join(root, "src/components/life/recipe-form.tsx"), "utf8")
  assert.match(form, /min-h-12 shrink-0/)
  assert.match(form, /disabled=\{locked\}/)
  assert.match(readFileSync(join(root, "src/components/life/meals-planner.tsx"), "utf8"), /listAction === "hidden" \|\| confirm/)
})

test("berries keep their recipe spelling on the shopping line", async () => {
  const store = memory()
  store.recipes.push({ id: "recipe-berries", household_id: "house-a", created_by: "user-a", visibility: "private", name: "Oats" })
  store.ingredients.push({ id: "line-berries", recipe_id: "recipe-berries", household_id: "house-a", name: "Berries", quantity: "150", unit: "g", category: "produce", sort_order: 0 })
  const result = await addRecipeToShoppingWith(writer(store.supabase, "house-a", "user-a"), "recipe-berries", () => undefined, "b8b8b8b8-b8b8-48b8-88b8-b8b8b8b8b8b8")
  assert.equal(result.ok, true)
  if (result.ok) {
    assert.deepEqual(result.added, ["Berries"])
    assert.equal(result.message, "Added to your Just me list.")
  }
  const call = (store.bound as { last?: { args: { p_lines?: { name: string; qty_base: number; unit_group: string }[] } } }).last
  assert.equal(call?.args.p_lines?.[0]?.name, "Berries")
  assert.equal(call?.args.p_lines?.[0]?.qty_base, 150)
  assert.equal(call?.args.p_lines?.[0]?.unit_group, "mass")
})

test("an old recipe stamp conflicts and a failed save leaves ingredients", async () => {
  const store = memory()
  const home = writer(store.supabase)
  const saved = await saveRecipeWith(home, recipeForm(), () => undefined)
  assert.equal(saved.ok, true)
  const id = saved.ok ? saved.id ?? "" : ""
  const before = store.ingredients.map((row) => row.name)
  store.recipes[0].name = "Theirs"
  const stale = recipeForm()
  stale.set("id", id)
  stale.set("updated_at", "1999-01-01T00:00:00.000Z")
  stale.set("name", "Mine")
  const conflict = await saveRecipeWith(home, stale, () => undefined)
  assert.deepEqual(conflict, { ok: false, message: RECIPE_STALE, conflict: true })
  assert.equal(store.recipes[0]?.name, "Theirs")
  assert.deepEqual(store.ingredients.map((row) => row.name), before)

  const calls = store.bound.calls
  const missing = recipeForm()
  missing.set("id", id)
  missing.set("name", "Mine")
  const blank = await saveRecipeWith(home, missing, () => undefined)
  assert.deepEqual(blank, { ok: false, message: RECIPE_STALE, conflict: true })
  assert.equal(store.bound.calls, calls)

  store.recipes[0].updated_at = "newer"
  const keep = recipeForm()
  keep.set("id", id)
  keep.set("updated_at", "stamp-1")
  keep.set("keep_mine", "1")
  keep.set("name", "Mine")
  const kept = await saveRecipeWith(home, keep, () => undefined)
  assert.equal(kept.ok, true)
  assert.equal(store.recipes[0]?.name, "Mine")
  assert.equal(store.recipes[0]?.updated_at, "fresh-stamp")

  store.bound.failNext = "23503"
  const brokenForm = recipeForm()
  brokenForm.set("id", id)
  brokenForm.set("updated_at", "fresh-stamp")
  brokenForm.set("name", "Broken")
  const broken = await saveRecipeWith(home, brokenForm, () => undefined)
  assert.equal(broken.ok, false)
  if (!broken.ok) {
    assert.equal(broken.message, RECIPE_REFERENCE)
    assert.equal(/recipe_ingredients_parent_fk|23503|violates|constraint/i.test(broken.message), false)
  }
  assert.equal(store.recipes[0]?.name, "Mine")
  assert.deepEqual(store.ingredients.map((row) => row.name), before)
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
    assert.equal(parsed.draft.catalogRecipeId, null)
  }
  const badCatalog = recipeForm()
  badCatalog.set("catalog_recipe_id", "catalog-1")
  const rejected = parseRecipeForm(badCatalog)
  assert.equal(rejected.ok, false)
  if (!rejected.ok) assert.equal(rejected.message, RECIPE_UNAVAILABLE)
  const goodCatalog = recipeForm()
  goodCatalog.set("catalog_recipe_id", CATALOG_ID)
  const accepted = parseRecipeForm(goodCatalog)
  assert.equal(accepted.ok, true)
  if (accepted.ok) assert.equal(accepted.draft.catalogRecipeId, CATALOG_ID)
  const longStep = recipeForm()
  longStep.set("steps", "a".repeat(2001))
  assert.equal(parseRecipeForm(longStep).ok, false)
  const cappedStep = recipeForm()
  cappedStep.set("steps", "a".repeat(2000))
  assert.equal(parseRecipeForm(cappedStep).ok, true)
  const foreignKey = recipeDbMessage(
    {
      code: "23503",
      message: 'insert or update on table "recipe_ingredients" violates foreign key constraint "recipe_ingredients_parent_fk"',
      details: "Key (recipe_id, household_id, visibility)=(1) is not present in table \"recipes\".",
    },
    "Couldn’t save that recipe.",
  )
  assert.equal(foreignKey, RECIPE_REFERENCE)
  assert.equal(/recipe_ingredients_parent_fk|23503|violates/i.test(foreignKey), false)
  const formSource = readFileSync(join(root, "src/components/life/recipe-form.tsx"), "utf8")
  const choice = readFileSync(join(root, "src/components/life/stale-choice.tsx"), "utf8")
  const nameAt = formSource.indexOf("\n            Name")
  const top = formSource.slice(formSource.indexOf("<form"), nameAt)
  assert.ok(nameAt > formSource.indexOf("<form"))
  assert.match(top, /<StaleChoice/)
  assert.match(formSource, /name="updated_at"/)
  assert.match(formSource, /keep_mine/)
  assert.match(formSource, /if \(result\.conflict\)/)
  assert.match(choice, /\{STALE_CHANGED\}/)
  assert.match(choice, /\{STALE_USE_THEIRS\}/)
  assert.match(choice, /\{STALE_KEEP_MINE\}/)
  assert.match(choice, /text-muted-foreground/)
  assert.doesNotMatch(choice, /text-danger/)
  assert.doesNotMatch(formSource, /text-danger/)
})

const CATALOG_ID = "11111111-1111-4111-8111-111111111111"

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
  const bound = (supabase as { bound?: { householdId: string; userId: string } }).bound
  if (bound) {
    bound.householdId = householdId
    bound.userId = userId
  }
  return { supabase, householdId, userId, lastVisibility: "shared", canWrite: true }
}

type Row = Record<string, unknown>

function memory() {
  const recipes: Row[] = []
  const ingredients: Row[] = []
  const shopping: Row[] = []
  const pantry: Row[] = []
  const bound = {
    householdId: "house-a",
    userId: "user-a",
    calls: 0,
    failNext: null as string | null,
    batches: new Map<string, { links: number; qty: number }>(),
  }
  const catalog = [
    { id: CATALOG_ID, name: "Pancakes", category: "Breakfast", servings: 4, steps: ["Mix the batter."], notes: null },
  ]
  const catalogIngredients = [
    { catalog_recipe_id: CATALOG_ID, name: "Flour", quantity: "200", unit: "g", category: "pantry", sort_order: 0 },
  ]
  const tables: Record<string, Row[]> = {
    recipes,
    recipe_ingredients: ingredients,
    shopping_items: shopping,
    pantry_items: pantry,
    catalog_recipes: catalog,
    catalog_recipe_ingredients: catalogIngredients,
  }
  const supabase: ShoppingWriter["supabase"] & { bound: typeof bound; rpc: (fn: string, args: { p_household_id?: string; p_recipe?: Row; p_lines?: Row[] }) => Promise<{ data: Row | null; error: { code?: string; message: string; details?: string } | null }> } = {
    bound,
    async rpc(fn: string, args: { p_household_id?: string; p_recipe?: Row; p_lines?: Row[]; p_add_batch_id?: string }) {
      bound.calls += 1
      ;(bound as { last?: unknown }).last = { fn, args }
      if (fn === "add_recipe_to_shopping") {
        const manual = JSON.stringify(args.p_lines ?? []).match(/manual_/)
        if (manual) return { data: null, error: { message: "manual field" } }
        const batch = String(args.p_add_batch_id ?? "")
        if (!bound.batches.has(batch)) {
          const qty = (args.p_lines ?? []).reduce((sum, line) => sum + Number(line.qty_base ?? 0), 0)
          bound.batches.set(batch, { links: args.p_lines?.length ?? 0, qty })
        }
        const saved = bound.batches.get(batch)
        return { data: { ok: true, added: 0, updated: 0, removed: 0, links: saved?.links, auto_qty: saved?.qty }, error: null }
      }
      const draft = args.p_recipe ?? {}
      const householdId = args.p_household_id ?? bound.householdId
      const nextIngredients = (recipeId: string) =>
        (Array.isArray(draft.ingredients) ? (draft.ingredients as Row[]) : []).map((item, index) => ({
          recipe_id: recipeId,
          household_id: householdId,
          created_by: bound.userId,
          visibility: draft.visibility,
          name: item.name,
          quantity: item.quantity,
          unit: item.unit,
          category: item.category,
          sort_order: index,
        }))
      if (draft.id) {
        const row = recipes.find((item) => item.id === draft.id && item.household_id === bound.householdId)
        if (!row || String(row.updated_at ?? "") !== String(draft.updated_at ?? "")) {
          return { data: { ok: false, conflict: true }, error: null }
        }
        if (bound.failNext) {
          const code = bound.failNext
          bound.failNext = null
          return {
            data: null,
            error: {
              code,
              message: 'insert or update on table "recipe_ingredients" violates foreign key constraint "recipe_ingredients_parent_fk"',
              details: "Key is not present in table recipes.",
            },
          }
        }
        Object.assign(row, {
          name: draft.name,
          category: draft.category,
          servings: draft.servings,
          steps: draft.steps,
          notes: draft.notes,
          visibility: draft.visibility,
          updated_at: "fresh-stamp",
        })
        const kept = ingredients.filter((item) => item.recipe_id !== row.id || item.household_id !== bound.householdId)
        ingredients.splice(0, ingredients.length, ...kept, ...nextIngredients(String(row.id)))
        return { data: { ok: true, id: String(row.id) }, error: null }
      }
      const id = `recipes-${recipes.length + 1}`
      recipes.push({
        id,
        household_id: householdId,
        created_by: bound.userId,
        updated_at: "stamp-1",
        catalog_recipe_id: draft.catalog_recipe_id ?? null,
        name: draft.name,
        category: draft.category,
        servings: draft.servings,
        steps: draft.steps,
        notes: draft.notes,
        visibility: draft.visibility,
      })
      ingredients.push(...nextIngredients(id))
      return { data: { ok: true, id }, error: null }
    },
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
  return { supabase, recipes, ingredients, shopping, pantry, bound }
}
