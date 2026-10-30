import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { recipeCatalogImageUrl } from "@/lib/life/catalog"
import { catalogPhotoProblem } from "@/lib/life/catalog-photos"
import { toCatalogRecipes, type CatalogSourceFile } from "@/lib/life/catalog-seed"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")

function fail(message: string): never {
  console.error(message)
  process.exit(1)
}

const supabaseUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/$/, "")
if (!supabaseUrl) fail("Set SUPABASE_URL to the project URL.")

const file = JSON.parse(readFileSync(join(root, "data/recipes.json"), "utf8")) as CatalogSourceFile
const rows = toCatalogRecipes(file)
if (!rows.length) fail("The catalog has no recipes to verify.")

const problems: string[] = []
for (const row of rows) {
  const url = recipeCatalogImageUrl(row.slug, supabaseUrl)
  if (!url) {
    problems.push(`${row.slug}: no photo URL`)
    continue
  }
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(20000) })
    const problem = catalogPhotoProblem({
      status: response.status,
      contentType: response.headers.get("content-type"),
      bytes: Buffer.from(await response.arrayBuffer()),
    })
    if (problem) problems.push(`${row.slug}: ${problem}`)
  } catch (error) {
    problems.push(`${row.slug}: ${error instanceof Error ? error.message : "request failed"}`)
  }
}

if (problems.length) {
  for (const problem of problems) console.error(problem)
  process.exit(1)
}

console.log(`Verified ${rows.length} catalog photos.`)
