import type { Metadata } from "next"

import { ShoppingBoard } from "@/components/life/shopping-board"
import { listMealLabels, listPantry, listShopping, listShoppingLists } from "@/lib/data/lists"
import { pageClock } from "@/lib/data/timezone"

export const metadata: Metadata = { title: "Shopping" }

export default async function Page() {
  const [clock, items, lists, pantry] = await Promise.all([pageClock(), listShopping(), listShoppingLists(), listPantry()])
  const labels = await listMealLabels(items.rows.map((item) => item.id))
  const rows = items.rows.map((item) => ({
    ...item,
    for_meal: labels.get(item.id) ?? ("for_meal" in item ? item.for_meal : null) ?? null,
  }))
  return (
    <ShoppingBoard
      rows={rows}
      lists={lists.rows}
      pantry={pantry.rows}
      today={clock.today}
      currency={items.currency}
      error={items.error || lists.error || pantry.error}
    />
  )
}
