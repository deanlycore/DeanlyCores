import { notFound } from "next/navigation"

import { RecipesBoard } from "@/components/life/recipes-board"

import { LifePreview } from "../chrome"
import { previewRecipes, previewStarters } from "./sample"

export const dynamic = "force-dynamic"

export default async function PreviewRecipes({
  searchParams,
}: {
  searchParams: Promise<{ empty?: string; error?: string; view?: string }>
}) {
  if (process.env.NODE_ENV === "production") notFound()
  const params = await searchParams
  const empty = params.empty === "1"
  const failed = params.error === "1"
  const view = params.view === "1"
  return (
    <LifePreview>
      <RecipesBoard
        rows={empty || failed ? [] : previewRecipes}
        starters={failed ? [] : previewStarters}
        error={failed}
        canWrite={!view}
        preview
        hrefBase="/preview/life/recipes"
      />
    </LifePreview>
  )
}
