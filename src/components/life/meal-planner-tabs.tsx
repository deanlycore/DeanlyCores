import Link from "next/link"

import { MEAL_PLANNER_TABS, mealPlannerTabHref, type MealPlannerTab } from "@/lib/life/catalog"
import { cn } from "cn"

export function MealPlannerTabs({ base, current }: { base: string; current: MealPlannerTab }) {
  return (
    <nav aria-label="Meal Planner" className="flex gap-2 overflow-x-auto">
      {MEAL_PLANNER_TABS.map((tab) => {
        const active = tab.id === current
        return (
          <Link
            key={tab.id}
            href={mealPlannerTabHref(base, tab.id)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex min-h-12 shrink-0 items-center rounded-full px-4 text-sm font-medium",
              active ? "bg-brand-soft text-on-brand-soft" : "bg-surface-muted text-muted-foreground",
            )}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
