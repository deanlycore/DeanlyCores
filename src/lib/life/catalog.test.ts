import assert from "node:assert/strict"
import { spawn, spawnSync } from "node:child_process"
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { createServer } from "node:http"
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
import { assertLocalCatalogTarget, assertProdCatalogTarget, catalogPhotoObjectPath, catalogPhotoProblem, PROD_CATALOG_PROJECT_REF, readCatalogPhotos } from "./catalog-photos.ts"
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
  assert.match(browse, /id !== "vegetarian"[\s\S]*mx-3 h-6 w-px shrink-0 bg-border[\s\S]*goal\.id === "vegetarian"/)
  assert.match(browse, /overflow-x-auto pb-1 max-md:-mr-4/)
  assert.match(browse, /aria-hidden="true"/)
  assert.doesNotMatch(browse, /flex flex-wrap gap-2/)
  assert.match(seed, /process\.argv\.includes\("--prod"\)/)
  assert.match(seed, /assertProdCatalogTarget\(supabaseUrl, process\.env\.CONFIRM_PROJECT_REF\)/)
  assert.match(seed, /upsert:\s*true/)
  assert.doesNotMatch(seed, /console\.(log|error|info|debug)\([^)\n]*serviceKey/)
  assert.doesNotMatch(seed, /\$\{serviceKey\}/)
  const clientAt = seed.indexOf("createClient(")
  assert.ok(clientAt > localAt)
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

test("prod catalog seed runs only when the confirmed ref matches the Supabase URL", () => {
  const prodUrl = `https://${PROD_CATALOG_PROJECT_REF}.supabase.co`
  assert.equal(PROD_CATALOG_PROJECT_REF, "dpjzlitklsjtfrfrxvhl")
  assert.doesNotThrow(() => assertProdCatalogTarget(prodUrl, PROD_CATALOG_PROJECT_REF))
  assert.doesNotThrow(() => assertProdCatalogTarget(`${prodUrl}/`, `  ${PROD_CATALOG_PROJECT_REF}  `))
  assert.throws(() => assertProdCatalogTarget(prodUrl, undefined), /CONFIRM_PROJECT_REF/)
  assert.throws(() => assertProdCatalogTarget(prodUrl, "other-project"), /CONFIRM_PROJECT_REF/)
  assert.throws(() => assertProdCatalogTarget("https://otherref.supabase.co", PROD_CATALOG_PROJECT_REF), /does not match/)
  assert.throws(() => assertProdCatalogTarget("https://example.com", PROD_CATALOG_PROJECT_REF), /does not match/)
  assert.throws(() => assertLocalCatalogTarget(prodUrl), /local Supabase/)

  const remote = runSeed([], { SUPABASE_URL: "https://example.supabase.co", CONFIRM_PROJECT_REF: PROD_CATALOG_PROJECT_REF })
  assert.equal(remote.status, 1)
  assert.match(remote.stderr, /local Supabase/)
  assert.equal(remote.stderr.includes("local-service-role"), false)

  const missing = runSeed(["--prod"], { SUPABASE_URL: "https://example.supabase.co", CONFIRM_PROJECT_REF: "" })
  assert.equal(missing.status, 1)
  assert.match(missing.stderr, /Set CONFIRM_PROJECT_REF/)
  assert.equal(missing.stderr.includes("local-service-role"), false)

  const mismatch = runSeed(["--prod"], { SUPABASE_URL: "https://otherref.supabase.co", CONFIRM_PROJECT_REF: PROD_CATALOG_PROJECT_REF })
  assert.equal(mismatch.status, 1)
  assert.match(mismatch.stderr, /does not match/)
  assert.equal(mismatch.stderr.includes("local-service-role"), false)
})

test("catalog photo checks reject anything other than 200 image/webp at 960x720", async () => {
  const good = sampleWebp(960, 720)
  assert.equal(catalogPhotoProblem({ status: 200, contentType: "image/webp", bytes: good }), null)
  assert.equal(catalogPhotoProblem({ status: 200, contentType: "image/webp; charset=binary", bytes: good }), null)
  assert.match(catalogPhotoProblem({ status: 404, contentType: "image/webp", bytes: good }) ?? "", /status 404/)
  assert.match(catalogPhotoProblem({ status: 200, contentType: "image/jpeg", bytes: good }) ?? "", /content-type/)
  assert.match(catalogPhotoProblem({ status: 200, contentType: "image/webp", bytes: Buffer.from("nope") }) ?? "", /not a WebP/)
  assert.match(catalogPhotoProblem({ status: 200, contentType: "image/webp", bytes: sampleWebp(100, 100) }) ?? "", /size 100x100/)

  const failed = await runVerifyAgainst("chicken-tinga-tacos")
  assert.notEqual(failed.status, 0)
  assert.match(failed.stderr, /chicken-tinga-tacos/)
  const passed = await runVerifyAgainst("")
  assert.equal(passed.status, 0, passed.stderr)
  assert.match(passed.stdout, /Verified 50 catalog photos/)
})

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

function runNodeScript(script: string, args: string[], env: Record<string, string>) {
  const result = spawnSync(
    process.execPath,
    ["--experimental-strip-types", "--import", "./scripts/register-alias.mjs", script, ...args],
    {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        SUPABASE_SERVICE_ROLE_KEY: "local-service-role",
        NEXT_PUBLIC_SUPABASE_URL: "",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
        ...env,
      },
    },
  )
  return { status: result.status, stderr: result.stderr ?? "", stdout: result.stdout ?? "" }
}

function runSeed(args: string[], env: { SUPABASE_URL: string; CONFIRM_PROJECT_REF: string }) {
  return runNodeScript("scripts/seed-recipe-catalog.ts", args, env)
}

function runVerifyAgainst(failSlug: string) {
  return new Promise<{ status: number | null; stderr: string; stdout: string }>((resolve, reject) => {
    const server = createServer((req, res) => {
      const slug = req.url?.split("/").pop()?.replace(/\.webp$/, "") ?? ""
      if (failSlug && slug === failSlug) {
        res.writeHead(500, { "content-type": "text/plain" })
        res.end("nope")
        return
      }
      res.writeHead(200, { "content-type": "image/webp" })
      res.end(sampleWebp(960, 720))
    })
    server.on("error", reject)
    server.listen(0, "127.0.0.1", () => {
      const address = server.address()
      const port = typeof address === "object" && address ? address.port : 0
      const child = spawn(process.execPath, [
        "--experimental-strip-types",
        "--import",
        "./scripts/register-alias.mjs",
        "scripts/verify-catalog-photos.ts",
      ], {
        cwd: root,
        env: {
          ...process.env,
          SUPABASE_SERVICE_ROLE_KEY: "local-service-role",
          NEXT_PUBLIC_SUPABASE_URL: "",
          NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
          SUPABASE_URL: `http://127.0.0.1:${port}`,
          CONFIRM_PROJECT_REF: "",
        },
      })
      let stdout = ""
      let stderr = ""
      child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString() })
      child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString() })
      child.on("error", (error) => {
        server.closeAllConnections()
        server.close()
        reject(error)
      })
      child.on("close", (status) => {
        server.closeAllConnections()
        server.close()
        resolve({ status, stdout, stderr })
      })
    })
  })
}
