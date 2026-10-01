import { cookies } from "next/headers"

import { zonedDate } from "@/lib/home/metrics"

export const TIMEZONE_COOKIE = "deanly-tz"

export async function readTimeZone() {
  const store = await cookies()
  const value = store.get(TIMEZONE_COOKIE)?.value
  if (!value) return "UTC"
  try {
    Intl.DateTimeFormat(undefined, { timeZone: value })
    return value
  } catch {
    return "UTC"
  }
}

export async function pageClock() {
  const timeZone = await readTimeZone()
  return { timeZone, today: zonedDate(timeZone) }
}
