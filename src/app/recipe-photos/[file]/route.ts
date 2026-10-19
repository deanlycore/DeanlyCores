import { readFile } from "node:fs/promises"
import { join } from "node:path"

import { isCatalogSlug } from "@/lib/life/catalog"

export async function GET(_request: Request, context: { params: Promise<{ file: string }> }) {
  const { file } = await context.params
  const slug = file.endsWith(".webp") ? file.slice(0, -".webp".length) : ""
  if (!isCatalogSlug(slug) || file !== `${slug}.webp`) return new Response(null, { status: 404 })
  try {
    const bytes = await readFile(join(process.cwd(), "supabase/seed/recipe-photos", file))
    return new Response(bytes, {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    })
  } catch {
    return new Response(null, { status: 404 })
  }
}
