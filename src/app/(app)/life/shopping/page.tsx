import type { Metadata } from "next"

import { ShoppingBoard } from "@/components/life/shopping-board"
import { listShopping } from "@/lib/data/lists"
import { pageClock } from "@/lib/data/timezone"

export const metadata: Metadata = { title: "Shopping" }

export default async function Page() {
  const [clock, items] = await Promise.all([pageClock(), listShopping()])
  return <ShoppingBoard rows={items.rows} today={clock.today} error={items.error} />
}
