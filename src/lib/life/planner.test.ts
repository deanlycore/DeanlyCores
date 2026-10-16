import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import { previewStatus } from "../preview-access.ts"
import { LINKED_STAYS_SHARED, shoppingDbMessage } from "./shopping.ts"
import { buildShoppingLines, confirmListChoice, neededEstimate, syncCountsUnchanged, updateListButton } from "./planner.ts"

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..")

test("schema test 16: sync shopping updates set only auto_qty, auto_unit, and system_note", () => {
  const sql = readFileSync(join(root, "supabase/migrations/20261017103000_meal_shopping_functions.sql"), "utf8")
  const updates = sql.match(/update public\.shopping_items[\s\S]*?where /gi) ?? []
  assert.ok(updates.length >= 3)
  const allowed = new Set(["auto_qty", "auto_unit", "system_note"])
  for (const statement of updates) {
    const setBody = statement.slice(statement.toLowerCase().indexOf("set") + 3, statement.toLowerCase().lastIndexOf("where"))
    const columns = [...setBody.matchAll(/\b([a-z_]+)\s*=/g)].map((match) => match[1])
    assert.ok(columns.length > 0, statement)
    for (const column of columns) assert.ok(allowed.has(column), column)
  }
})

test("schema test 20: pantry coverage and staples produce no shopping line", () => {
  const lines = buildShoppingLines({
    ingredients: [
      { id: "salt", name: "Salt", quantity: "1", unit: "each", category: "pantry" },
      { id: "lime", name: "Lime", quantity: "1", unit: "each", category: "produce" },
      { id: "onion", name: "Onion", quantity: "2", unit: "each", category: "produce" },
    ],
    recipeServings: 4,
    mealServings: 8,
    pantry: [{ name: "Lime" }],
    includeOnList: true,
  })
  assert.deepEqual(lines.map((line) => line.name), ["Onion"])
  assert.equal(lines[0]?.qty_base, 4)
  assert.equal(lines[0]?.match_key, "onion|count")
  assert.equal(JSON.stringify(lines).includes("manual_"), false)
})

test("schema test 21: preview guard returns 404 in production and passes in preview and dev", () => {
  assert.equal(previewStatus("/preview/life/meals", { VERCEL_ENV: "production", NODE_ENV: "production" }), 404)
  assert.equal(previewStatus("/preview/life/meals", { NODE_ENV: "production" }), 404)
  assert.equal(previewStatus("/preview/life/meals", { VERCEL_ENV: "preview", NODE_ENV: "production" }), null)
  assert.equal(previewStatus("/preview/life/meals", { NODE_ENV: "development" }), null)
  assert.equal(previewStatus("/preview/life/meals", { VERCEL_ENV: "development", NODE_ENV: "development" }), null)
  assert.equal(previewStatus("/life/meals", { VERCEL_ENV: "production", NODE_ENV: "production" }), null)
  const proxy = readFileSync(join(root, "src/proxy.ts"), "utf8")
  assert.match(proxy, /previewStatus\(/)
  assert.match(proxy, /status:\s*404/)
})

test("schema test 25: update list stays quiet for view-only, free-text meals, and Not now", () => {
  assert.equal(updateListButton({ recipeId: null }, true), "hidden")
  assert.equal(updateListButton({ recipeId: "recipe-1" }, false), "disabled")
  assert.equal(updateListButton({ recipeId: "recipe-1" }, true), "ready")
  assert.deepEqual(confirmListChoice("not-now", []), [])
  assert.deepEqual(confirmListChoice("update", []), ["sync"])
  assert.equal(neededEstimate([{ price_cents: 4800 }]), "About $48")
  assert.equal(neededEstimate([{ price_cents: 4800 }, { price_cents: null }]), "Some prices not set")
  assert.equal(syncCountsUnchanged({ added: 0, updated: 0, removed: 0 }), true)
  assert.equal(
    shoppingDbMessage(
      { code: "23503", message: 'update or delete on table "meals" violates foreign key constraint "msn_meal_fk"' },
      "Couldn’t save that meal.",
    ),
    LINKED_STAYS_SHARED,
  )
  const planner = readFileSync(join(root, "src/components/life/meals-planner.tsx"), "utf8")
  assert.match(planner, /updateListButton\(/)
  assert.match(planner, /confirmListChoice\("not-now"/)
  assert.match(planner, /Update list/)
  assert.match(planner, /Not now/)
  assert.match(planner, /LIST_ALREADY_HAS_MEAL/)
  assert.match(readFileSync(join(root, "src/app/(app)/life/meals/page.tsx"), "utf8"), /neededEstimate\(/)
  assert.match(readFileSync(join(root, "src/lib/life/recipes.ts"), "utf8"), /Your list already has this meal\./)
  assert.match(planner, /min-h-12/)
})
