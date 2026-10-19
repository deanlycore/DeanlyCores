import { notFound } from "next/navigation"

import { RecipesBoard } from "@/components/life/recipes-board"
import { previewIsProduction } from "@/lib/preview-access"

import { LifePreview } from "../chrome"
import { previewRecipes, previewStarters } from "./sample"

export const dynamic = "force-dynamic"

export default async function PreviewRecipes({
  searchParams,
}: {
  searchParams: Promise<{ empty?: string; error?: string; view?: string; stale?: string; blocked?: string; starter?: string }>
}) {
  if (previewIsProduction()) notFound()
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
        staleOpen={params.stale === "1" && !empty && !failed && !view}
        blockedOpen={params.blocked === "1" && !empty && !failed}
        starterOpen={params.starter === "1" && !empty && !failed}
        hrefBase="/preview/life/recipes"
      />
    </LifePreview>
  )
}
