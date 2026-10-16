import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { RecipeDetail } from "@/components/life/recipe-detail"
import { getRecipe } from "@/lib/data/lists"

export const metadata: Metadata = { title: "Recipe" }

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const result = await getRecipe(id)
  if (result.error) return <RecipeDetail recipe={null} shopping={[]} pantry={[]} error canWrite={result.canWrite} />
  if (!result.recipe) notFound()
  return (
    <RecipeDetail
      recipe={result.recipe}
      shopping={result.shopping}
      pantry={result.pantry}
      canWrite={result.canWrite}
    />
  )
}
