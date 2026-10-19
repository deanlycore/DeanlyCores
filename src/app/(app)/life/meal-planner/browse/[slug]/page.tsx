import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { RecipeCatalogDetail } from "@/components/life/recipe-catalog-detail"
import { getCatalogRecipe } from "@/lib/data/catalog"
import { pageClock } from "@/lib/data/timezone"
import { CATALOG_ERROR_COPY, fullWeekday, isCatalogSlug, MEAL_PLANNER_HREF } from "@/lib/life/catalog"
import { weekOf } from "@/lib/life/planner"
import { getSupabaseUrl } from "@/lib/supabase/env"

export const metadata: Metadata = { title: "Meal Planner" }

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  if (!isCatalogSlug(slug)) notFound()
  const [result, clock] = await Promise.all([getCatalogRecipe(slug), pageClock()])
  if (result.error) {
    return <p className="text-sm text-ink">{CATALOG_ERROR_COPY}</p>
  }
  if (!result.recipe) notFound()
  const days = weekOf(clock.today, 0).days.map((date) => ({ date, label: fullWeekday(date) ?? date }))
  return (
    <RecipeCatalogDetail
      recipe={result.recipe}
      saved={Boolean(result.savedId)}
      canWrite={result.canWrite}
      supabaseUrl={getSupabaseUrl()}
      base={MEAL_PLANNER_HREF}
      days={days}
    />
  )
}
