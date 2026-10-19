import { notFound } from "next/navigation"

import { MealsPlanner, type PlannerMeal, type PlannerRecipe } from "@/components/life/meals-planner"
import { addedDayLabel } from "@/lib/life/catalog"
import type { WeekShoppingLine } from "@/lib/life/planner"
import { previewIsProduction } from "@/lib/preview-access"

import { LifePreview } from "../chrome"
import { previewToday } from "../sample"

export const dynamic = "force-dynamic"

const meals: PlannerMeal[] = [
  { id: "mon", title: "Grilled chicken", meal_on: "2026-09-28", slot: "dinner", notes: null, visibility: "shared", servings: 4, recipe_id: "tacos", updated_at: "2026-10-02T00:00:00.000Z", needed: 2 },
  { id: "fri", title: "Tacos", meal_on: "2026-10-02", slot: "dinner", notes: null, visibility: "shared", servings: 4, recipe_id: "tacos", updated_at: "2026-10-02T00:00:00.000Z", needed: 2 },
  { id: "sat", title: "Leftovers", meal_on: "2026-10-03", slot: "lunch", notes: null, visibility: "shared", servings: 2, recipe_id: null, updated_at: "2026-10-02T00:00:00.000Z", needed: 0 },
]

const shoppingLines: WeekShoppingLine[] = [
  { mealId: "mon", checked: false, priceCents: 1200 },
  { mealId: "mon", checked: false, priceCents: 800 },
  { mealId: "mon", checked: true, priceCents: 400 },
  { mealId: "fri", checked: false, priceCents: 1500 },
  { mealId: "fri", checked: true, priceCents: 900 },
  { mealId: "fri", checked: true, priceCents: 200 },
]

const recipes: PlannerRecipe[] = [
  { id: "tacos", name: "Weeknight tacos", servings: 4, visibility: "shared", category: "Dinner", minutes: 25, atHome: 1, onList: 1, need: 2, ingredientCount: 4, costCents: 4800 },
  { id: "soup", name: "Tomato soup", servings: 4, visibility: "shared", category: "Soup", minutes: 40, atHome: 0, onList: 1, need: 1, ingredientCount: 2, costCents: 900 },
]

export default async function Page({ searchParams }: { searchParams: Promise<{ added?: string; sheet?: string; view?: string }> }) {
  if (previewIsProduction()) notFound()
  const params = await searchParams
  const sheet = params.sheet === "detail" || params.sheet === "confirm" || params.sheet === "already" ? params.sheet : null
  return (
    <LifePreview>
      <MealsPlanner
        meals={params.view === "empty" ? [] : meals}
        recipes={recipes}
        today={previewToday}
        canWrite={params.view !== "1"}
        preview
        initialSheet={sheet}
        shoppingLines={shoppingLines}
        showTabs
        addedDay={addedDayLabel(params.added)}
        browseHref="/preview/life/meal-planner/browse"
        tabBase="/preview/life/meal-planner"
      />
    </LifePreview>
  )
}
