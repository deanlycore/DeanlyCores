import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { createClient } from "@supabase/supabase-js"

import { assertLocalCatalogTarget, assertProdCatalogTarget, catalogPhotoObjectPath, readCatalogPhotos } from "@/lib/life/catalog-photos"
import { toCatalogRecipes, type CatalogSourceFile } from "@/lib/life/catalog-seed"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")

function fail(message: string): never {
  console.error(message)
  process.exit(1)
}

const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
if (!serviceKey) fail("Set SUPABASE_SERVICE_ROLE_KEY in the environment. The catalog seed does not read a client key.")
if (serviceKey === process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || serviceKey === process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
  fail("Refusing to seed with a client key.")
}

const supabaseUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/$/, "")
if (!supabaseUrl) fail("Set SUPABASE_URL to the project URL.")

const file = JSON.parse(readFileSync(join(root, "data/recipes.json"), "utf8")) as CatalogSourceFile
const rows = toCatalogRecipes(file)
const imageDir = process.env.RECIPE_CATALOG_IMAGE_DIR?.trim() || join(root, "supabase/seed/recipe-photos")

const prod = process.argv.includes("--prod")

let photos
try {
  photos = readCatalogPhotos(imageDir, rows.map((row) => row.slug))
  if (prod) assertProdCatalogTarget(supabaseUrl, process.env.CONFIRM_PROJECT_REF)
  else assertLocalCatalogTarget(supabaseUrl)
} catch (error) {
  fail(error instanceof Error ? error.message : "Recipe photos are not valid.")
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const saved = await supabase.from("recipe_catalog").upsert(rows, { onConflict: "slug" })
if (saved.error) fail(saved.error.message)

for (const photo of photos) {
  const uploaded = await supabase.storage.from("recipe-catalog").upload(catalogPhotoObjectPath(photo.slug), photo.bytes, {
    contentType: "image/webp",
    upsert: true,
  })
  if (uploaded.error) fail(uploaded.error.message)
}

console.log(`Upserted ${rows.length} catalog recipes.`)
