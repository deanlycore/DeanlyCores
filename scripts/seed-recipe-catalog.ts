import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { createClient } from "@supabase/supabase-js"

import { toCatalogRecipes, type CatalogSourceFile } from "@/lib/life/catalog-seed"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const IMAGE_BYTES = 1024 * 1024

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

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const saved = await supabase.from("recipe_catalog").upsert(rows, { onConflict: "slug" })
if (saved.error) fail(saved.error.message)

const imageDir = process.env.RECIPE_CATALOG_IMAGE_DIR?.trim()
if (imageDir) {
  const { readdirSync } = await import("node:fs")
  for (const name of readdirSync(imageDir)) {
    if (/\.svg$/i.test(name)) fail(`SVG is not allowed in recipe-catalog: ${name}`)
    if (!/\.(webp|jpe?g)$/i.test(name)) continue
    const bytes = readFileSync(join(imageDir, name))
    if (bytes.byteLength > IMAGE_BYTES) fail(`${name} is over the 1MB catalog limit.`)
    const contentType = /\.webp$/i.test(name) ? "image/webp" : "image/jpeg"
    const uploaded = await supabase.storage.from("recipe-catalog").upload(`recipes/${name.toLowerCase()}`, bytes, {
      contentType,
      upsert: true,
    })
    if (uploaded.error) fail(uploaded.error.message)
  }
}

console.log(`Upserted ${rows.length} catalog recipes.`)
