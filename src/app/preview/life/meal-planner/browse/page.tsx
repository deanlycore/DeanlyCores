import { notFound } from "next/navigation"

import { RecipeBrowse } from "@/components/life/recipe-browse"
import { catalogFileRecipes } from "@/lib/life/catalog-file"
import { filterCatalog, parseCatalogFilters } from "@/lib/life/catalog"
import { previewIsProduction } from "@/lib/preview-access"

import { LifePreview } from "../../chrome"

export const dynamic = "force-dynamic"

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; cuisine?: string; goal?: string; sort?: string; view?: string }>
}) {
  if (previewIsProduction()) notFound()
  const params = await searchParams
  const filters = parseCatalogFilters(params)
  const recipes = params.view === "error" ? [] : filterCatalog(catalogFileRecipes, filters)
  return (
    <LifePreview>
      <RecipeBrowse recipes={recipes} error={params.view === "error"} filters={filters} preview base="/preview/life/meal-planner" />
    </LifePreview>
  )
}
