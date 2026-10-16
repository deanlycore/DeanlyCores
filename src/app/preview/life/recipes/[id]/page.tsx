import { notFound } from "next/navigation"

import { RecipeDetail } from "@/components/life/recipe-detail"

import { LifePreview } from "../../chrome"
import { previewPantry, previewRecipes, previewShopping } from "../sample"

export const dynamic = "force-dynamic"

export default async function PreviewRecipe({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ review?: string; view?: string; error?: string }>
}) {
  if (process.env.NODE_ENV === "production") notFound()
  const [{ id }, query] = await Promise.all([params, searchParams])
  const recipe = previewRecipes.find((item) => item.id === id) ?? null
  if (!recipe && query.error !== "1") notFound()
  return (
    <LifePreview>
      <RecipeDetail
        recipe={recipe}
        shopping={previewShopping}
        pantry={previewPantry}
        error={query.error === "1"}
        canWrite={query.view !== "1"}
        preview
        reviewOpen={query.review === "1"}
        backHref="/preview/life/recipes"
      />
    </LifePreview>
  )
}
