import { permanentRedirect } from "next/navigation"

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") query.set(key, value)
  }
  const suffix = query.toString()
  permanentRedirect(suffix ? `/life/meal-planner/mine?${suffix}` : "/life/meal-planner/mine")
}
