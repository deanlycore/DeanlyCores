import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import {
  catalogBrowseHref,
  catalogShelves,
  CATALOG_PHOTO_HEIGHT,
  CATALOG_PHOTO_WIDTH,
  filterCatalog,
  mealPlannerRedirects,
  parseCatalogFilters,
  recipeCatalogImageCsp,
  recipeCatalogImageUrl,
  recipeCatalogRemotePatterns,
  searchCatalog,
  SHELF_MIN,
  textSimilarity,
} from "./catalog.ts"
import { toCatalogRecipes, type CatalogSourceFile } from "./catalog-seed.ts"

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..")
const file = JSON.parse(readFileSync(join(root, "data/recipes.json"), "utf8")) as CatalogSourceFile
const recipes = toCatalogRecipes(file)

test("catalog seed is stable and idempotent", () => {
  const again = toCatalogRecipes(file)
  assert.equal(recipes.length, 50)
  assert.deepEqual(again, recipes)
  assert.equal(new Set(recipes.map((recipe) => recipe.slug)).size, 50)
  for (const recipe of recipes) {
    assert.match(recipe.slug, /^[a-z0-9]+(-[a-z0-9]+)*$/)
    assert.equal(recipe.image_path, `recipes/${recipe.slug}.webp`)
    assert.ok(recipe.ingredients.every((item) => item.text.length > 0))
  }
})

test("shelves keep a cuisine only when four recipes remain", () => {
  const shelves = catalogShelves(recipes)
  assert.deepEqual(shelves.map((shelf) => shelf.cuisine), ["Mexican", "Italian", "Asian", "American", "Mediterranean", "Breakfast"])
  for (const shelf of shelves) assert.ok(shelf.recipes.length >= SHELF_MIN)
  const quick = catalogShelves(filterCatalog(recipes, { q: "", cuisine: null, goal: "quick", sort: "popular" }))
  for (const shelf of quick) assert.ok(shelf.recipes.length >= SHELF_MIN)
  const hidden = catalogShelves([recipes[0], recipes[1], recipes[2]].filter((recipe): recipe is NonNullable<typeof recipe> => Boolean(recipe)))
  assert.deepEqual(hidden, [])
})

test("search matches ingredients and close spellings", () => {
  const direct = searchCatalog(recipes, "chipotle")
  assert.ok(direct.some((recipe) => recipe.slug === "chicken-tinga-tacos"))
  const typo = searchCatalog(recipes, "chiken")
  assert.ok(typo.some((recipe) => recipe.name.toLowerCase().includes("chicken")))
  assert.ok(textSimilarity("chicken", "chiken") > 0.4)
  const none = filterCatalog(recipes, { q: "zzzz-not-a-food", cuisine: null, goal: null, sort: "popular" })
  assert.equal(none.length, 0)
})

test("goal and cuisine filters stay on the known labels", () => {
  const filters = parseCatalogFilters({ q: "  rice  ", cuisine: "Mexican", goal: "lose_weight", sort: "quickest" })
  assert.deepEqual(filters, { q: "rice", cuisine: "Mexican", goal: "lose_weight", sort: "quickest" })
  assert.equal(parseCatalogFilters({ goal: "budget" }).goal, null)
  const href = catalogBrowseHref("/life/meal-planner/browse", filters)
  assert.equal(href, "/life/meal-planner/browse?q=rice&cuisine=Mexican&goal=lose_weight&sort=quickest")
})

test("old meals and recipes routes redirect permanently and keep query params", () => {
  const redirects = mealPlannerRedirects()
  const config = readFileSync(join(root, "next.config.ts"), "utf8")
  assert.match(config, /mealPlannerRedirects\(\)/)
  for (const redirect of redirects) {
    assert.equal(redirect.permanent, true)
    assert.equal(redirect.destination.includes("?"), false)
  }
  assert.deepEqual(
    redirects.map((redirect) => [redirect.source, redirect.destination]),
    [
      ["/meals", "/life/meal-planner"],
      ["/recipes", "/life/meal-planner/mine"],
      ["/recipes/:id", "/life/meal-planner/mine/:id"],
      ["/life/meals", "/life/meal-planner"],
      ["/life/recipes", "/life/meal-planner/mine"],
      ["/life/recipes/:id", "/life/meal-planner/mine/:id"],
    ],
  )
})

test("catalog photos use the storage host and never upscale past 960x720", () => {
  assert.equal(CATALOG_PHOTO_WIDTH, 960)
  assert.equal(CATALOG_PHOTO_HEIGHT, 720)
  assert.equal(
    recipeCatalogImageUrl("chicken-tinga-tacos", "https://example.supabase.co"),
    "https://example.supabase.co/storage/v1/object/public/recipe-catalog/recipes/chicken-tinga-tacos.webp",
  )
  assert.equal(recipeCatalogImageUrl("Not Safe", "https://example.supabase.co"), null)
  const patterns = recipeCatalogRemotePatterns("https://cdn.example.com")
  assert.equal(patterns[0]?.hostname, "**.supabase.co")
  assert.equal(patterns[0]?.pathname, "/storage/v1/object/public/recipe-catalog/**")
  assert.equal(patterns[1]?.hostname, "cdn.example.com")
  const csp = recipeCatalogImageCsp("https://cdn.example.com")
  assert.match(csp, /img-src/)
  assert.match(csp, /https:\/\/\*\.supabase\.co/)
  assert.match(csp, /https:\/\/cdn\.example\.com/)
  const photo = readFileSync(join(root, "src/components/life/recipe-photo.tsx"), "utf8")
  assert.match(photo, /aspect-\[4\/3\]/)
  assert.match(photo, /object-cover/)
  assert.match(photo, /max-w-\[960px\]/)
  assert.match(photo, /max-h-\[720px\]/)
  assert.match(photo, /bg-surface-muted/)
  assert.doesNotMatch(photo, /dangerouslySetInnerHTML|<img/)
})

test("the seed reads the service role and no app route writes the catalog", () => {
  const seed = readFileSync(join(root, "scripts/seed-recipe-catalog.ts"), "utf8")
  assert.match(seed, /SUPABASE_SERVICE_ROLE_KEY/)
  assert.match(seed, /onConflict:\s*"slug"/)
  assert.match(seed, /Refusing to seed with a client key/)
  assert.doesNotMatch(seed, /NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY/)
  const browse = readFileSync(join(root, "src/components/life/recipe-browse.tsx"), "utf8")
  const detail = readFileSync(join(root, "src/components/life/recipe-catalog-detail.tsx"), "utf8")
  assert.doesNotMatch(browse, /dangerouslySetInnerHTML/)
  assert.doesNotMatch(detail, /dangerouslySetInnerHTML/)
  assert.match(detail, /ILLUSTRATION_LABEL/)
  assert.match(detail, /Nutrition per serving/)
  assert.match(browse, /SEARCH_PLACEHOLDER/)
  assert.match(browse, /NO_RESULTS_COPY/)
})
