import type { Metadata } from "next"

import { BillsBoard } from "@/components/records/section-board"
import { listBills } from "@/lib/data/lists"
import { pageClock } from "@/lib/data/timezone"

export const metadata: Metadata = { title: "Bills" }

export default async function Page() {
  const [clock, bills] = await Promise.all([pageClock(), listBills()])
  return <BillsBoard rows={bills.rows} currency={bills.currency} today={clock.today} visibility={bills.visibility} error={bills.error} />
}
