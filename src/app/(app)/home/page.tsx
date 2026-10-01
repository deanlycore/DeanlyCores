import type { Metadata } from "next"

import { HomeDashboard } from "@/components/home/home-dashboard"
import { TimezoneSync } from "@/components/home/timezone-sync"
import { loadHome } from "@/lib/data/home"
import { getSessionView } from "@/lib/data/session"
import { readTimeZone } from "@/lib/data/timezone"

export const metadata: Metadata = { title: "Home" }

export default async function HomePage() {
  const session = await getSessionView()
  const timeZone = await readTimeZone()
  const data = session.householdId ? await loadHome(timeZone) : null
  return (
    <>
      <TimezoneSync />
      <HomeDashboard session={session} data={data} timeZone={timeZone} />
    </>
  )
}
