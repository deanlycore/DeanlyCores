import type { Metadata } from "next"

import { RecipesBoard } from "@/components/life/recipes-board"
import { listRecipes } from "@/lib/data/lists"

export const metadata: Metadata = { title: "Meal Planner" }

export default async function Page() {
  const library = await listRecipes()
  return (
    <RecipesBoard
      rows={library.rows}
      starters={library.starters}
      error={library.error}
      canWrite={library.canWrite}
      title="Meal Planner"
      hrefBase="/life/meal-planner/mine"
      tabBase="/life/meal-planner"
    />
  )
}
