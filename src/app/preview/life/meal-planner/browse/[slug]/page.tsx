import { notFound } from "next/navigation"

import { RecipeCatalogDetail } from "@/components/life/recipe-catalog-detail"
import { catalogFileRecipes } from "@/lib/life/catalog-file"
import { fullWeekday, isCatalogSlug } from "@/lib/life/catalog"
import { weekOf } from "@/lib/life/planner"
import { previewIsProduction } from "@/lib/preview-access"

import { LifePreview } from "../../../chrome"
import { previewToday } from "../../../sample"

export const dynamic = "force-dynamic"

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  if (previewIsProduction()) notFound()
  const { slug } = await params
  if (!isCatalogSlug(slug)) notFound()
  const recipe = catalogFileRecipes.find((item) => item.slug === slug)
  if (!recipe) notFound()
  const days = weekOf(previewToday, 0).days.map((date) => ({ date, label: fullWeekday(date) ?? date }))
  return (
    <LifePreview>
      <RecipeCatalogDetail recipe={recipe} preview base="/preview/life/meal-planner" days={days} supabaseUrl={null} />
    </LifePreview>
  )
}
