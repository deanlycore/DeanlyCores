import { CATALOG_SLUG, type CatalogIngredient, type CatalogRecipe } from "@/lib/life/catalog"

export type CatalogSourceRecipe = {
  slug: string
  name: string
  cuisine: string
  servings: number
  minutes: number
  vegetarian?: boolean
  ingredients: { text?: string; grams?: number; fdc_id?: number }[]
  steps: string[]
  nutrition_per_serving: { kcal: number; protein: number; carbs: number; fat: number }
  goal_tags?: string[]
  image?: string
  source: string
  license: string
}

export type CatalogSourceFile = {
  goal_cutoffs?: Record<string, string>
  recipes: CatalogSourceRecipe[]
}

export function mealTypeForCuisine(cuisine: string) {
  return cuisine === "Breakfast" ? "breakfast" : "dinner"
}

function ingredientOf(item: CatalogSourceRecipe["ingredients"][number]): CatalogIngredient | null {
  const text = item.text?.trim() ?? ""
  if (!text) return null
  const next: CatalogIngredient = { text }
  if (typeof item.grams === "number" && Number.isFinite(item.grams) && item.grams > 0) next.grams = item.grams
  if (typeof item.fdc_id === "number" && Number.isInteger(item.fdc_id) && item.fdc_id > 0) next.fdc_id = item.fdc_id
  return next
}

export function toCatalogRecipe(recipe: CatalogSourceRecipe): CatalogRecipe {
  if (!CATALOG_SLUG.test(recipe.slug)) throw new Error(`Recipe slug is not stable: ${recipe.slug}`)
  const imagePath = `recipes/${recipe.slug}.webp`
  if (recipe.image && recipe.image !== imagePath) throw new Error(`Recipe image path must be ${imagePath}`)
  const tags = [...new Set([...(recipe.goal_tags ?? []), ...(recipe.vegetarian ? ["vegetarian"] : [])])]
  return {
    slug: recipe.slug,
    name: recipe.name.trim(),
    cuisine: recipe.cuisine.trim(),
    meal_type: mealTypeForCuisine(recipe.cuisine),
    minutes: recipe.minutes,
    servings: recipe.servings,
    ingredients: recipe.ingredients.map(ingredientOf).filter((item): item is CatalogIngredient => Boolean(item)),
    steps: recipe.steps.map((step) => step.trim()).filter(Boolean),
    kcal: recipe.nutrition_per_serving.kcal,
    protein: recipe.nutrition_per_serving.protein,
    carbs: recipe.nutrition_per_serving.carbs,
    fat: recipe.nutrition_per_serving.fat,
    tags,
    image_path: imagePath,
    source: recipe.source.trim(),
    license: recipe.license.trim(),
  }
}

export function toCatalogRecipes(file: CatalogSourceFile) {
  const rows = file.recipes.map(toCatalogRecipe)
  const slugs = new Set(rows.map((row) => row.slug))
  if (slugs.size !== rows.length) throw new Error("Recipe slugs must be unique.")
  return rows
}
