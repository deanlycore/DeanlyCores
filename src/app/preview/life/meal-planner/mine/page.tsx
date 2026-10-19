import { notFound } from "next/navigation"

import { RecipesBoard } from "@/components/life/recipes-board"
import { previewIsProduction } from "@/lib/preview-access"

import { LifePreview } from "../../chrome"
import { previewRecipes, previewStarters } from "../../recipes/sample"

export const dynamic = "force-dynamic"

export default async function Page({ searchParams }: { searchParams: Promise<{ empty?: string; view?: string }> }) {
  if (previewIsProduction()) notFound()
  const params = await searchParams
  const empty = params.empty === "1" || params.view === "empty"
  return (
    <LifePreview>
      <RecipesBoard
        rows={empty ? [] : previewRecipes}
        starters={empty ? [] : previewStarters}
        error={params.view === "error"}
        canWrite
        preview
        title="Meal Planner"
        hrefBase="/preview/life/meal-planner/mine"
        tabBase="/preview/life/meal-planner"
      />
    </LifePreview>
  )
}
