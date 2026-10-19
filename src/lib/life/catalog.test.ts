import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
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
  PHOTO_ILLUSTRATION_LINE,
  recipeCatalogImageCsp,
  recipeCatalogImageUrl,
  recipeCatalogRemotePatterns,
  searchCatalog,
  SHELF_MIN,
  textSimilarity,
} from "./catalog.ts"
import { assertLocalCatalogTarget, catalogPhotoObjectPath, readCatalogPhotos } from "./catalog-photos.ts"
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
  assert.equal(patterns.length, 1)
  assert.equal(patterns[0]?.hostname, "cdn.example.com")
  assert.equal(patterns[0]?.pathname, "/storage/v1/object/public/**")
  assert.deepEqual(recipeCatalogRemotePatterns(), [])
  const pinned = recipeCatalogRemotePatterns("https://example.supabase.co")
  assert.equal(pinned[0]?.hostname, "example.supabase.co")
  assert.equal(pinned[0]?.hostname.includes("*"), false)
  const csp = recipeCatalogImageCsp("https://cdn.example.com")
  assert.match(csp, /img-src/)
  assert.match(csp, /'self'/)
  assert.match(csp, /data:/)
  assert.match(csp, /blob:/)
  assert.match(csp, /https:\/\/cdn\.example\.com/)
  assert.equal(csp.includes("supabase.co"), false)
  assert.equal(recipeCatalogImageCsp(), "img-src 'self' data: blob:;")
  const photo = readFileSync(join(root, "src/components/life/recipe-photo.tsx"), "utf8")
  assert.match(photo, /aspect-\[4\/3\]/)
  assert.match(photo, /object-cover/)
  assert.match(photo, /max-w-\[960px\]/)
  assert.match(photo, /max-h-\[720px\]/)
  assert.match(photo, /bg-surface-muted/)
  assert.match(photo, /unoptimized/)
  assert.doesNotMatch(photo, /dangerouslySetInnerHTML|<img/)
})

test("the seed reads the service role and no app route writes the catalog", () => {
  const seed = readFileSync(join(root, "scripts/seed-recipe-catalog.ts"), "utf8")
  assert.match(seed, /SUPABASE_SERVICE_ROLE_KEY/)
  assert.match(seed, /onConflict:\s*"slug"/)
  assert.match(seed, /Refusing to seed with a client key/)
  assert.doesNotMatch(seed, /NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY/)
  const readAt = seed.indexOf("readCatalogPhotos(")
  const localAt = seed.indexOf("assertLocalCatalogTarget(")
  const uploadAt = seed.indexOf(".upload(")
  assert.ok(readAt > 0 && localAt > readAt && uploadAt > localAt)
  assert.match(seed, /catalogPhotoObjectPath\(photo\.slug\)/)
  assert.doesNotMatch(seed, /jpe\?g|image\/jpeg|\.jpg/)
  const browse = readFileSync(join(root, "src/components/life/recipe-browse.tsx"), "utf8")
  const detail = readFileSync(join(root, "src/components/life/recipe-catalog-detail.tsx"), "utf8")
  assert.doesNotMatch(browse, /dangerouslySetInnerHTML/)
  assert.doesNotMatch(detail, /dangerouslySetInnerHTML/)
  assert.match(detail, /\{item\.text\}/)
  assert.match(detail, /\{step\}/)
  assert.equal(PHOTO_ILLUSTRATION_LINE, "Photos are AI-generated illustrations.")
  assert.match(detail, /PHOTO_ILLUSTRATION_LINE/)
  assert.match(detail, /‹ Browse/)
  assert.doesNotMatch(detail, /ILLUSTRATION_LABEL/)
  assert.match(browse, /flex flex-wrap gap-2/)
  assert.match(detail, /Nutrition per serving/)
  assert.match(browse, /SEARCH_PLACEHOLDER/)
  assert.match(browse, /NO_RESULTS_COPY/)
  assert.match(browse, /seedPhotoSrc/)
  assert.match(detail, /preview \? seedPhotoSrc/)
})

function sampleWebp(width: number, height: number) {
  const bytes = Buffer.alloc(30)
  bytes.write("RIFF", 0)
  bytes.writeUInt32LE(22, 4)
  bytes.write("WEBP", 8)
  bytes.write("VP8X", 12)
  bytes.writeUInt32LE(10, 16)
  bytes.writeUIntLE(width - 1, 24, 3)
  bytes.writeUIntLE(height - 1, 27, 3)
  return bytes
}

test("catalog photo upload accepts only the recipes.json webp set", () => {
  assert.equal(catalogPhotoObjectPath("chicken-tinga-tacos"), "recipes/chicken-tinga-tacos.webp")
  assert.doesNotThrow(() => assertLocalCatalogTarget("http://127.0.0.1:54321"))
  assert.throws(() => assertLocalCatalogTarget("https://example.supabase.co"), /local Supabase/)

  const dir = mkdtempSync(join(tmpdir(), "recipe-photos-"))
  const slugs = ["chicken-tinga-tacos", "apple-cinnamon-oatmeal"]
  try {
    for (const slug of slugs) writeFileSync(join(dir, `${slug}.webp`), sampleWebp(960, 720))
    const photos = readCatalogPhotos(dir, slugs)
    assert.deepEqual(photos.map((photo) => photo.slug).sort(), slugs.slice().sort())

    writeFileSync(join(dir, "notes.md"), "nope")
    assert.throws(() => readCatalogPhotos(dir, slugs), /Unexpected files: notes\.md/)
    rmSync(join(dir, "notes.md"))

    writeFileSync(join(dir, "extra.jpg"), sampleWebp(960, 720))
    assert.throws(() => readCatalogPhotos(dir, slugs), /Unexpected files: extra\.jpg/)
    rmSync(join(dir, "extra.jpg"))

    rmSync(join(dir, "apple-cinnamon-oatmeal.webp"))
    assert.throws(() => readCatalogPhotos(dir, slugs), /Missing files: apple-cinnamon-oatmeal\.webp/)
    writeFileSync(join(dir, "apple-cinnamon-oatmeal.webp"), Buffer.from("not-a-webp"))
    assert.throws(() => readCatalogPhotos(dir, slugs), /not a WebP image/)
    writeFileSync(join(dir, "apple-cinnamon-oatmeal.webp"), sampleWebp(100, 100))
    assert.throws(() => readCatalogPhotos(dir, slugs), /must be 960x720/)
    const huge = Buffer.alloc(1048577)
    sampleWebp(960, 720).copy(huge)
    writeFileSync(join(dir, "apple-cinnamon-oatmeal.webp"), huge)
    assert.throws(() => readCatalogPhotos(dir, slugs), /1MB catalog limit/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }

  const nested = mkdtempSync(join(tmpdir(), "recipe-photos-dir-"))
  try {
    mkdirSync(join(nested, "nested"))
    assert.throws(() => readCatalogPhotos(nested, ["chicken-tinga-tacos"]), /unexpected entry/)
  } finally {
    rmSync(nested, { recursive: true, force: true })
  }
})

test("checked-in recipe photos cover every catalog slug at 960x720", () => {
  const photos = readCatalogPhotos(join(root, "supabase/seed/recipe-photos"), recipes.map((recipe) => recipe.slug))
  assert.equal(photos.length, 50)
  assert.equal(new Set(photos.map((photo) => photo.slug)).size, 50)
})
