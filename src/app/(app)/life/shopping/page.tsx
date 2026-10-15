import type { Metadata } from "next"

import { ShoppingBoard } from "@/components/life/shopping-board"
import { listPantry, listShopping, listShoppingLists } from "@/lib/data/lists"
import { pageClock } from "@/lib/data/timezone"

export const metadata: Metadata = { title: "Shopping" }

export default async function Page() {
  const [clock, items, lists, pantry] = await Promise.all([pageClock(), listShopping(), listShoppingLists(), listPantry()])
  return (
    <ShoppingBoard
      rows={items.rows}
      lists={lists.rows}
      pantry={pantry.rows}
      today={clock.today}
      currency={items.currency}
      error={items.error || lists.error || pantry.error}
    />
  )
}
