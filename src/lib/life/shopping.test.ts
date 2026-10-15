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
import {
  ITEM_UNAVAILABLE,
  LIST_JUST_ME_BLOCKED,
  LIST_UNAVAILABLE,
  SHOPPING_CATEGORIES,
  calmShoppingMessage,
  displayAmount,
  groupShopping,
  shoppingDbMessage,
  shoppingTiles,
} from "./shopping.ts"
import { mergeAmounts } from "./units.ts"

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..")
const sql = readFileSync(join(root, "supabase/migrations/20261015200000_shopping_upgrade.sql"), "utf8")
const board = readFileSync(join(root, "src/components/life/shopping-board.tsx"), "utf8")
const actions = readFileSync(join(root, "src/lib/actions/shopping.ts"), "utf8")
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
  assert.match(board, /shoppingTiles\(visible\)/)
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
  assert.match(board, /Bought\. Mark as at home\?/)
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

test("an existing item save requires updated_at before any write", () => {
  const save = actions.slice(actions.indexOf("export async function saveShoppingItem"), actions.indexOf("export async function quickAddShoppingItem"))
  const stamp = save.indexOf("await loadStamp")
  const lookup = save.indexOf("listForVisibility")
  assert.ok(stamp > 0 && stamp < lookup)
  assert.match(actions, /if \(!updatedAt\) return \{ ok: false, message: STALE_SAVE, conflict: true \}/)
  assert.match(save, /if \(stamp && !stamp\.ok\) return stamp/)
  assert.match(save, /\.eq\("updated_at", stamp\.updatedAt\)/)
  assert.equal(save.includes("if (expected)"), false)
  assert.equal(save.includes("if (updatedAt) update"), false)
})

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
