import type { Metadata } from "next"

import { RecipeBrowse } from "@/components/life/recipe-browse"
import { listCatalog } from "@/lib/data/catalog"
import { MEAL_PLANNER_HREF, parseCatalogFilters } from "@/lib/life/catalog"
import { getSupabaseUrl } from "@/lib/supabase/env"

export const metadata: Metadata = { title: "Meal Planner" }

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; cuisine?: string; goal?: string; sort?: string }>
}) {
  const filters = parseCatalogFilters(await searchParams)
  const catalog = await listCatalog(filters)
  return (
    <RecipeBrowse
      recipes={catalog.recipes}
      error={catalog.error}
      filters={filters}
      supabaseUrl={getSupabaseUrl()}
      base={MEAL_PLANNER_HREF}
    />
  )
}
