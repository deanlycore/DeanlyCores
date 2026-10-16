import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import {
  canonicalIngredient,
  ingredientNamesMatch,
  isStapleIngredient,
  normalizeIngredientName,
} from "./normalize.ts"
import type { Visibility } from "../visibility.ts"
import { listForVisibility, saveShoppingItemWith, type ShoppingWriter } from "./shopping-save.ts"
import {
  ITEM_UNAVAILABLE,
  KEEP_MINE_ATTEMPTS,
  LIST_JUST_ME_BLOCKED,
  LIST_UNAVAILABLE,
  SHOPPING_CATEGORIES,
  STALE_CHANGED,
  STALE_KEEP_MINE,
  STALE_SAVE,
  STALE_USE_THEIRS,
  calmShoppingMessage,
  displayAmount,
  displayUnit,
  formatQty,
  groupShopping,
  shoppingDbMessage,
  shoppingTiles,
  unpricedLabel,
} from "./shopping.ts"
import { mergeAmounts } from "./units.ts"

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..")
const sql = readFileSync(join(root, "supabase/migrations/20261015200000_shopping_upgrade.sql"), "utf8")
const board = readFileSync(join(root, "src/components/life/shopping-board.tsx"), "utf8")
const actions = readFileSync(join(root, "src/lib/actions/shopping.ts"), "utf8")
const saveImpl = readFileSync(join(root, "src/lib/life/shopping-save.ts"), "utf8")
const records = readFileSync(join(root, "src/lib/actions/records.ts"), "utf8")

test("normalization strips quantity and prep words, then singularizes", () => {
  assert.equal(normalizeIngredientName("Tomatoes"), "tomato")
  assert.equal(normalizeIngredientName("berries"), "berry")
  assert.equal(normalizeIngredientName("2 large chopped tomatoes"), "tomato")
  assert.equal(normalizeIngredientName("1 1/2 fresh berries"), "berry")
  assert.equal(normalizeIngredientName("hummus"), "hummus")
  assert.equal(normalizeIngredientName("molasses"), "molasses")
  assert.equal(normalizeIngredientName("asparagus"), "asparagus")
  assert.equal(normalizeIngredientName("couscous"), "couscous")
  assert.equal(normalizeIngredientName("swiss chard"), "swiss chard")
  assert.equal(normalizeIngredientName("greens"), "greens")
  assert.equal(canonicalIngredient("2 large chopped tomatoes"), "tomato")
  assert.equal(ingredientNamesMatch("tomatoes", "tomato"), true)
  assert.equal(ingredientNamesMatch("chicken broth", "chicken"), false)
  assert.equal(ingredientNamesMatch("Chicken", "chicken broth"), false)
})

test("staples are an exact canonical match", () => {
  assert.equal(isStapleIngredient("Salt"), true)
  assert.equal(isStapleIngredient("pepper"), true)
  assert.equal(isStapleIngredient("oil"), true)
  assert.equal(isStapleIngredient("water"), true)
  assert.equal(isStapleIngredient("sea salt"), false)
  assert.equal(isStapleIngredient("chicken"), false)
  assert.equal(isStapleIngredient("chicken broth"), false)
})

test("amounts merge inside one unit group and never across groups", () => {
  assert.deepEqual(mergeAmounts([{ qty: 500, unit: "g" }, { qty: 1, unit: "kg" }]), { qty: 1.5, unit: "kg" })
  assert.deepEqual(mergeAmounts([{ qty: 500, unit: "grams" }, { qty: 1, unit: "kilogram" }]), { qty: 1.5, unit: "kg" })
  assert.equal(mergeAmounts([{ qty: 1, unit: "cup" }, { qty: 500, unit: "g" }]), null)
  assert.deepEqual(mergeAmounts([{ qty: 1, unit: "cup" }, { qty: 1, unit: "cups" }]), { qty: 2, unit: "cup" })
  assert.equal(
    displayAmount({ manual_amount_raw: "500", manual_unit_raw: "g", manual_qty: 500, manual_unit: "g", auto_qty: 1, auto_unit: "kg" }),
    "1.5 kg",
  )
  assert.equal(
    displayAmount({ manual_amount_raw: "1", manual_unit_raw: "cup", manual_qty: 1, manual_unit: "cup", auto_qty: 500, auto_unit: "g" }),
    "1 cup + 500 g",
  )
  assert.equal(displayAmount({ manual_amount_raw: "1/2", manual_unit_raw: "cup", manual_qty: 0.5, manual_unit: "cup" }), "1/2 cup")
  assert.equal(displayAmount({ manual_amount_raw: "1", manual_unit_raw: "l", manual_qty: 1, manual_unit: "l" }), "1 L")
  assert.equal(displayAmount({ manual_amount_raw: "1", manual_unit_raw: "litre", manual_qty: 1, manual_unit: "l" }), "1 L")
  assert.equal(displayAmount({ manual_qty: 1, manual_unit: "l", auto_qty: 500, auto_unit: "ml" }), "1.5 L")
  assert.equal(displayAmount({ manual_amount_raw: "250", manual_unit_raw: "ML", manual_qty: 250, manual_unit: "ml" }), "250 ml")
  assert.equal(formatQty(1, "l"), "1 L")
  assert.equal(formatQty(250, "ml"), "250 ml")
  assert.equal(displayUnit("litres"), "L")
  assert.equal(displayUnit("milliliters"), "ml")
})

test("estimated total counts only priced items that are still to buy", () => {
  const tiles = shoppingTiles([
    { id: "a", name: "Milk", checked_at: null, visibility: "shared", price_cents: 500 },
    { id: "b", name: "Broth", checked_at: null, visibility: "shared", price_cents: null },
    { id: "c", name: "Bananas", checked_at: "2026-10-02T15:00:00.000Z", visibility: "shared", price_cents: 900 },
  ])
  assert.equal(tiles.estimatedCents, 500)
  assert.equal(tiles.pricedCount, 1)
  assert.equal(tiles.needToBuy, 2)
  assert.equal(tiles.progressBought, 1)
  assert.equal(tiles.progressTotal, 3)
  assert.equal(tiles.unpricedCount, 1)
  assert.equal(unpricedLabel(0), null)
  assert.equal(unpricedLabel(1), "1 item has no price")
  assert.equal(unpricedLabel(3), "3 items have no price")
  assert.match(board, /shoppingTiles\(visible\)/)
  assert.match(board, /of \$\{tiles\.progressTotal\} bought/)
  assert.match(board, /unpricedLabel\(tiles\.unpricedCount\)/)
})

test("checked items leave the category groups for Bought", () => {
  const grouped = groupShopping([
    { id: "milk", name: "Milk", checked_at: null, visibility: "shared", category: "dairy" },
    { id: "bananas", name: "Bananas", checked_at: "2026-10-02T15:00:00.000Z", visibility: "shared", category: "produce" },
  ])
  assert.deepEqual(grouped.groups.map((group) => group.id), ["dairy"])
  assert.deepEqual(grouped.bought.map((item) => item.id), ["bananas"])
  assert.deepEqual(SHOPPING_CATEGORIES.map((category) => category.id), [
    "produce",
    "meat",
    "dairy",
    "bakery",
    "pantry",
    "frozen",
    "beverages",
    "household",
    "other",
  ])
})

test("list visibility stays Shared when shared items still reference it", () => {
  assert.equal(LIST_JUST_ME_BLOCKED, "Some items on this list are shared. Make them Just me or remove them first.")
  assert.equal(LIST_UNAVAILABLE, "That list is not available.")
  assert.equal(ITEM_UNAVAILABLE, "That item is not available.")
  assert.match(board, /LIST_JUST_ME_BLOCKED/)
  assert.match(board, /text-muted-foreground">\{note\}/)
  assert.match(board, /reportShoppingError\(result\.message, setListNote\)/)
  assert.doesNotMatch(board, /toast\(result\.message\)/)
  assert.doesNotMatch(board, /VisibilityPill/)
  assert.doesNotMatch(board, /All categories/)
  assert.match(board, /For \{item\.for_meal\}/)
  assert.match(board, /bought\. Mark as at home\?/)
  assert.match(board, /w-\[420px\]/)
  assert.match(board, /Mark as at home\?/)
  const check = board.slice(board.indexOf("async function checkItem"), board.indexOf("async function changeListVisibility"))
  assert.equal(check.includes("markShoppingAtHome"), false)
  assert.match(actions, /eq\("updated_at", updatedAt\)/)
  assert.match(actions, /STALE_SAVE/)
  assert.match(records, /shoppingDbMessage/)
})

test("database rejections use the list and item sentences", () => {
  const parentUpdate = `update or delete on table "shopping_lists" violates foreign key constraint "shopping_items_list_fk" on table "shopping_items"`
  assert.equal(shoppingDbMessage({ code: "23503", message: parentUpdate }, "Couldn’t update that list."), LIST_JUST_ME_BLOCKED)
  assert.equal(
    shoppingDbMessage(
      { code: "23503", message: 'update or delete on table "shopping_lists" violates foreign key constraint "shopping_lists_visibility_fkey"' },
      "Couldn’t update that list.",
    ),
    LIST_JUST_ME_BLOCKED,
  )
  assert.equal(shoppingDbMessage({ message: parentUpdate }, "Couldn’t update that list."), LIST_JUST_ME_BLOCKED)
  assert.equal(
    shoppingDbMessage(
      { code: "23503", message: `insert or update on table "shopping_items" violates foreign key constraint "shopping_items_list_fk"` },
      "Couldn’t save that item.",
    ),
    LIST_UNAVAILABLE,
  )
  assert.equal(shoppingDbMessage({ message: "That list is not available." }, "Couldn’t save that item."), LIST_UNAVAILABLE)
  assert.equal(shoppingDbMessage({ message: "That item is not available." }, "Couldn’t mark that at home."), ITEM_UNAVAILABLE)
  assert.equal(
    shoppingDbMessage({ message: `duplicate key value violates unique constraint "shopping_lists_shared_name_uidx"` }, "Couldn’t add that list."),
    "Couldn’t add that list.",
  )
  assert.equal(calmShoppingMessage(parentUpdate), LIST_JUST_ME_BLOCKED)
  assert.equal(calmShoppingMessage("Add an item."), "Add an item.")
  assert.equal(calmShoppingMessage(`new row violates check constraint "shopping_items_price_ok"`), "Couldn’t save that.")
})

test("phone shopping scrolls only the category chips and stacks quick add", () => {
  const pulse = board.slice(board.indexOf("pulse={"), board.indexOf("{error ?"))
  assert.match(pulse, /grid min-w-0 grid-cols-1 gap-2/)
  assert.equal(pulse.match(/overflow-x-auto/g)?.length, 1)
  assert.match(pulse, /flex min-w-0 gap-1\.5 overflow-x-auto/)
  assert.doesNotMatch(pulse, /-mx-1|overflow-x-auto px-1/)
  assert.match(pulse, /grid min-w-0 grid-cols-\[minmax\(0,1fr\)_auto\] items-center gap-2 md:flex/)
  assert.match(pulse, /placeholder="Search"[\s\S]*placeholder="Quick add"/)
  assert.match(pulse, /md:order-last/)
  const chips = pulse.slice(pulse.indexOf("flex min-w-0 gap-1.5 overflow-x-auto"))
  assert.doesNotMatch(chips, />\s*Sort\s*</)
  assert.match(pulse, /flex min-w-0 flex-wrap gap-2/)
  assert.doesNotMatch(pulse, /flex gap-2 overflow-x-auto/)
  const prompt = board.slice(board.indexOf("{offer || homePrompt ? ("), board.indexOf('{tab === "home"'))
  assert.match(prompt, /bought\. Mark as at home\?/)
  assert.match(prompt, /flex flex-wrap items-center justify-between gap-2/)
  assert.match(board, />\s*Bought\s*</)
  const chrome = readFileSync(join(root, "src/components/money/money-chrome.tsx"), "utf8")
  assert.match(chrome, /compact && "max-md:grid max-md:min-w-0 max-md:grid-cols-3"/)
  assert.match(chrome, /"flex flex-wrap gap-2"/)
  assert.doesNotMatch(chrome, /compact && "max-md:flex-nowrap|compact && "max-md:overflow-x-auto/)
  const segments = readFileSync(join(root, "src/components/shell/section-segments.tsx"), "utf8")
  assert.match(segments, /flex min-w-0 w-full max-w-full flex-wrap gap-1 border-b border-border py-2 md:hidden/)
  assert.match(segments, /"-mx-4 flex gap-1 overflow-x-auto border-b border-border px-4 py-2 md:hidden"/)
  const lifeNav = readFileSync(join(root, "src/components/life/life-section-nav.tsx"), "utf8")
  assert.match(lifeNav, /tone="life" wrap/)
  const moneyLayout = readFileSync(join(root, "src/app/(app)/money/layout.tsx"), "utf8")
  assert.doesNotMatch(moneyLayout, /wrap/)
})

test("a stale row offers Use theirs or Keep mine, and Keep mine retries with the fresh stamp", () => {
  assert.equal(STALE_CHANGED, "Changed by someone else.")
  assert.equal(STALE_USE_THEIRS, "Use theirs")
  assert.equal(STALE_KEEP_MINE, "Keep mine")
  assert.equal(KEEP_MINE_ATTEMPTS, 2)
  const choice = readFileSync(join(root, "src/components/life/stale-choice.tsx"), "utf8")
  assert.match(choice, /\{STALE_CHANGED\}/)
  assert.match(choice, /\{STALE_USE_THEIRS\}/)
  assert.match(choice, /\{STALE_KEEP_MINE\}/)
  assert.match(choice, /text-muted-foreground/)
  assert.doesNotMatch(choice, /toast\(/)
  assert.doesNotMatch(choice, /text-danger/)
  assert.match(board, /<StaleChoice/)
  const check = board.slice(board.indexOf("async function checkItem"), board.indexOf("async function keepMine"))
  const noted = check.indexOf("noteStale")
  const refreshed = check.indexOf("router.refresh")
  assert.ok(noted > 0 && noted < refreshed)
  const keep = board.slice(board.indexOf("async function keepMine"), board.indexOf("function useTheirs"))
  assert.match(keep, /if \(result\.conflict\) return/)
  assert.equal(keep.slice(keep.indexOf("{")).includes("keepMine"), false)
  assert.match(board, /function useTheirs\(\) \{\n    setConflict\(null\)\n    router\.refresh\(\)/)
  const fresh = saveImpl.slice(saveImpl.indexOf("export async function writeFresh"), saveImpl.indexOf("export function finishFresh"))
  assert.match(fresh, /attempt < KEEP_MINE_ATTEMPTS/)
  assert.doesNotMatch(fresh, /while\s*\(/)
  const readStamp = fresh.indexOf('select("updated_at")')
  const writeStamp = fresh.indexOf('.eq("updated_at", stamp)')
  assert.ok(readStamp > 0 && readStamp < writeStamp)
  assert.match(saveImpl, /keep_mine/)
})

test("an auto add writes the recipe amount and leaves every manual field empty", async () => {
  let inserted: Record<string, unknown> | null = null
  const saved = await saveShoppingItemWith(
    writer({
      from(table: string) {
        const api = {
          select() {
            return api
          },
          eq() {
            return api
          },
          insert(value: Record<string, unknown>) {
            if (table === "shopping_items") inserted = value
            return api
          },
          update() {
            return api
          },
          maybeSingle() {
            return Promise.resolve(
              table === "shopping_lists" ? { data: { id: "list-1", visibility: "shared" }, error: null } : { data: null, error: null },
            )
          },
          single() {
            return Promise.resolve({ data: { id: "item-1" }, error: null })
          },
        }
        return api
      },
    }),
    (() => {
      const form = new FormData()
      form.set("name", "Berries")
      form.set("source", "auto")
      form.set("auto_qty", "150")
      form.set("auto_unit", "g")
      form.set("category", "produce")
      form.set("visibility", "shared")
      return form
    })(),
    () => undefined,
  )
  assert.equal(saved.ok, true)
  assert.equal(inserted?.source, "auto")
  assert.equal(inserted?.user_edited, false)
  assert.equal(inserted?.auto_qty, 150)
  assert.equal(inserted?.auto_unit, "g")
  assert.equal(inserted?.manual_amount_raw, null)
  assert.equal(inserted?.manual_unit_raw, null)
  assert.equal(inserted?.manual_qty, null)
  assert.equal(inserted?.manual_unit, null)
})

test("an existing item save requires updated_at before any write", () => {
  const save = saveImpl.slice(saveImpl.indexOf("export async function saveShoppingItemWith"), saveImpl.length)
  const stamp = save.indexOf("await loadStamp")
  const lookup = save.indexOf("listForVisibility")
  assert.ok(stamp > 0 && stamp < lookup)
  assert.match(saveImpl, /if \(!updatedAt\) return \{ ok: false, message: STALE_SAVE, conflict: true \}/)
  assert.match(save, /if \(stamp && !stamp\.ok\) return stamp/)
  assert.match(save, /\.eq\("updated_at", stamp\.updatedAt\)/)
  assert.equal(save.includes("if (expected)"), false)
  assert.equal(save.includes("if (updatedAt) update"), false)
  assert.doesNotMatch(saveImpl.slice(saveImpl.indexOf("async function loadStamp"), saveImpl.indexOf("async function keepEditedShoppingItem")), /schemaMissing/)
})

test("a save without updated_at is rejected and does not write", async () => {
  const writes: string[] = []
  const ctx = writer({
    from() {
      writes.push("query")
      return chain({ data: { id: "item-1" }, error: null }, writes)
    },
  })
  const form = new FormData()
  form.set("id", "item-1")
  form.set("name", "Milk")
  const missing = await saveShoppingItemWith(ctx, form, () => writes.push("refresh"))
  assert.deepEqual(missing, { ok: false, message: STALE_SAVE, conflict: true })
  assert.deepEqual(writes, [])

  const blank = new FormData()
  blank.set("id", "item-1")
  blank.set("name", "Milk")
  blank.set("updated_at", "   ")
  const blankResult = await saveShoppingItemWith(ctx, blank, () => writes.push("refresh"))
  assert.equal(blankResult.ok, false)
  if (!blankResult.ok) assert.equal(blankResult.conflict, true)
  assert.deepEqual(writes, [])

  for (const message of [
    'column "updated_at" does not exist',
    'relation "shopping_items" does not exist',
    "Could not find the table in the schema cache",
  ]) {
    const calls: string[] = []
    const broken = await saveShoppingItemWith(
      writer({
        from() {
          return chain({ data: null, error: { message, code: "42703" } }, calls)
        },
      }),
      stampedForm(),
      () => calls.push("refresh"),
    )
    assert.equal(broken.ok, false)
    if (!broken.ok) assert.equal(broken.conflict, undefined)
    assert.equal(broken.ok ? "" : broken.message, "Couldn’t save that item.")
    assert.deepEqual(calls, [])
  }
})

function stampedForm() {
  const form = new FormData()
  form.set("id", "item-1")
  form.set("name", "Milk")
  form.set("updated_at", "2026-10-02T12:00:00.000Z")
  return form
}

function writer(supabase: ShoppingWriter["supabase"]): ShoppingWriter {
  return { supabase, householdId: "house-1", userId: "user-1", lastVisibility: "shared" }
}

function chain(
  result: { data: { id: string } | null; error: { message: string; code?: string } | null },
  writes: string[],
) {
  const api = {
    select() {
      return api
    },
    eq() {
      return api
    },
    insert() {
      writes.push("insert")
      return api
    },
    update() {
      writes.push("update")
      return api
    },
    maybeSingle() {
      return Promise.resolve(result)
    },
    single() {
      return Promise.resolve(result)
    },
  }
  return api
}

test("shopping migration keeps parent checks, authenticated catalog reads, and a revoked purge", () => {
  assert.match(sql, /raise exception 'That list is not available\.'/)
  assert.match(sql, /raise exception 'That item is not available\.'/)
  assert.match(sql, /shopping_items_list_fk/)
  assert.match(sql, /on update no action/)
  assert.match(sql, /on delete cascade/)
  assert.match(sql, /is_staple boolean not null default false/)
  assert.match(sql, /manual_amount_raw text/)
  assert.match(sql, /manual_unit_raw text/)
  assert.match(sql, /manual_qty numeric/)
  assert.match(sql, /auto_qty numeric/)
  assert.match(sql, /auto_unit text/)
  assert.match(sql, /Existing rows have no amount/)
  assert.doesNotMatch(sql, /add column qty\b/)
  assert.doesNotMatch(sql, /add column unit\b/)
  assert.match(sql, /'beverages'/)
  assert.match(sql, /'meat'/)
  assert.match(sql, /grant select on table public\.unit_aliases to authenticated/)
  assert.match(sql, /grant select on table public\.ingredient_aliases to authenticated/)
  assert.doesNotMatch(sql, /grant\s+\S[\s\S]*?\sto anon/i)
  assert.match(sql, /foreach t in array array\['shopping_lists', 'pantry_items'\]/)
  assert.equal(sql.includes("'recipes'"), false)
  assert.equal(sql.includes("'recipe_ingredients'"), false)
  assert.equal(sql.includes("'substitutions'"), false)
  assert.equal(sql.includes("'meal_shopping_needs'"), false)
  assert.equal(sql.includes("'recipe_favorites'"), false)
  assert.match(sql, /revoke all on function public\.protect_household_member_delete\(\) from public, anon, authenticated, service_role/)
  assert.doesNotMatch(sql, /grant execute on function public\.protect_household_member_delete/i)
  assert.equal(/DeanFamily|Andrey|Arabella/i.test(sql), false)
  assert.equal(/grant\s+(insert|update|delete|all)[\s\S]{0,80}unit_aliases/i.test(sql), false)
})

test("listForVisibility fails closed and never returns an unfiltered list", async () => {
  const closed = await listForVisibility({ ...writer(unreachable()), householdId: "  " }, "list-1", "shared")
  assert.deepEqual(closed, { id: null, missing: false })
  const unknownHome = await listForVisibility({ ...writer(unreachable()), householdId: "" }, "", "shared")
  assert.equal(unknownHome.id, null)
  const unknownUser = await listForVisibility({ ...writer(unreachable()), userId: "" }, "", "private")
  assert.equal(unknownUser.id, null)
  const unknownVisibility = await listForVisibility(writer(unreachable()), "", "team" as Visibility)
  assert.deepEqual(unknownVisibility, { id: null, missing: false })

  const errored = scopedLists({ error: { message: 'relation "shopping_lists" does not exist' } })
  const missingTable = await listForVisibility(writer(errored.supabase), "list-1", "shared")
  assert.deepEqual(missingTable, { id: null, missing: false })
  assert.equal(errored.inserts.length, 0)
  assert.equal(missingTable.id === "unfiltered", false)

  const denied = scopedLists({ error: { message: "permission denied for table shopping_lists" } })
  const deniedResult = await listForVisibility(writer(denied.supabase), "", "shared")
  assert.equal(deniedResult.id, null)
  assert.equal(denied.inserts.length, 0)

  const found = scopedLists({ row: { id: "wanted", visibility: "shared" } })
  const hit = await listForVisibility(writer(found.supabase), "wanted", "shared")
  assert.deepEqual(hit, { id: "wanted", missing: false })
  assert.equal(found.inserts.length, 0)
  assert.equal(found.filters.some((filter) => filter[0] === "household_id" && filter[1] === "house-1"), true)
  assert.equal(found.filters.some((filter) => filter[0] === "visibility" && filter[1] === "shared"), true)

  const created = scopedLists({})
  const made = await listForVisibility(writer(created.supabase), "", "private")
  assert.deepEqual(made, { id: "list-1", missing: false })
  assert.equal(created.inserts[0]?.household_id, "house-1")
  assert.equal(created.inserts[0]?.visibility, "private")
  assert.equal(created.inserts[0]?.created_by, "user-1")
  assert.equal(created.filters.some((filter) => filter[0] === "created_by" && filter[1] === "user-1"), true)

  const writes: string[] = []
  const brokenSave = await saveShoppingItemWith(
    writer({
      from(table: string) {
        return chain(
          table === "shopping_lists"
            ? { data: null, error: { message: "Could not find the table in the schema cache" } }
            : { data: { id: "item-1" }, error: null },
          writes,
          table,
        )
      },
    }),
    stampedForm(),
    () => writes.push("refresh"),
  )
  assert.equal(brokenSave.ok, false)
  if (!brokenSave.ok) assert.equal(brokenSave.message, LIST_UNAVAILABLE)
  assert.deepEqual(writes, [])
})

function unreachable(): ShoppingWriter["supabase"] {
  return {
    from() {
      throw new Error("unfiltered query")
    },
  }
}

function scopedLists(options: { error?: { message: string } | null; row?: { id: string; visibility?: string } | null }) {
  const filters: [string, unknown][] = []
  const inserts: Record<string, unknown>[] = []
  const supabase: ShoppingWriter["supabase"] = {
    from() {
      const local: [string, unknown][] = []
      const api = {
        select() {
          return api
        },
        eq(column: string, value: unknown) {
          local.push([column, value])
          filters.push([column, value])
          return api
        },
        insert(row: Record<string, unknown>) {
          inserts.push(row)
          return api
        },
        update() {
          return api
        },
        maybeSingle() {
          const scoped = local.some(([column, value]) => column === "household_id" && value === "house-1")
            && local.some(([column, value]) => column === "visibility" && (value === "shared" || value === "private"))
          if (!scoped) return Promise.resolve({ data: { id: "unfiltered", visibility: "shared" }, error: null })
          if (options.error) return Promise.resolve({ data: null, error: options.error })
          return Promise.resolve({ data: options.row ?? null, error: null })
        },
        single() {
          return Promise.resolve({ data: { id: "list-1" }, error: null })
        },
      }
      return api
    },
  }
  return { supabase, filters, inserts }
}
