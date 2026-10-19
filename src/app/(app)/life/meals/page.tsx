import type { Metadata } from "next"

import { MealsPlanner, type PlannerMeal, type PlannerRecipe } from "@/components/life/meals-planner"
import { listMealNeedCounts, listMealShoppingLines, listMeals, listPantry, listRecipes, listShopping } from "@/lib/data/lists"
import { pageClock } from "@/lib/data/timezone"
import { addedDayLabel } from "@/lib/life/catalog"
import { ingredientNamesMatch } from "@/lib/life/normalize"

export const metadata: Metadata = { title: "Meal Planner" }

export default async function Page({
  searchParams,
}: {
  searchParams?: Promise<{ added?: string }>
}) {
  const params = await searchParams
  const [clock, meals, library, pantry, shopping, needs, shoppingLines] = await Promise.all([
    pageClock(),
    listMeals(),
    listRecipes(),
    listPantry(),
    listShopping(),
    listMealNeedCounts(),
    listMealShoppingLines(),
  ])
  const openShopping = shopping.rows.filter((item) => !item.checked_at)
  const rows: PlannerMeal[] = meals.rows.map((meal) => ({
    id: meal.id,
    title: meal.title,
    meal_on: meal.meal_on,
    slot: meal.slot,
    notes: meal.notes,
    visibility: meal.visibility,
    servings: meal.servings ?? 1,
    recipe_id: meal.recipe_id ?? null,
    updated_at: meal.updated_at ?? null,
    needed: needs.get(meal.id) ?? 0,
  }))
  const recipes: PlannerRecipe[] = library.rows.map((recipe) => {
    const atHome = recipe.ingredients.filter((item) => pantry.rows.some((row) => ingredientNamesMatch(item.name, row.name))).length
    const onList = recipe.ingredients.filter((item) => openShopping.some((row) => ingredientNamesMatch(item.name, row.name))).length
    const need = Math.max(recipe.ingredients.length - atHome - onList, 0)
    return {
      id: recipe.id,
      name: recipe.name,
      servings: recipe.servings,
      visibility: recipe.visibility,
      category: recipe.category,
      minutes: null,
      atHome,
      onList,
      need,
      ingredientCount: recipe.ingredients.length,
      costCents: null,
    }
  })
  return (
    <MealsPlanner
      meals={rows}
      recipes={recipes}
      today={clock.today}
      canWrite={library.canWrite}
      error={meals.error || library.error}
      shoppingLines={shoppingLines}
      showTabs
      addedDay={addedDayLabel(params?.added)}
      tabBase="/life/meal-planner"
    />
  )
}
