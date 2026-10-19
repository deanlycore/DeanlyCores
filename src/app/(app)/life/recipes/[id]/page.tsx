import { permanentRedirect } from "next/navigation"

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [{ id }, raw] = await Promise.all([params, searchParams])
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string") query.set(key, value)
  }
  const suffix = query.toString()
  permanentRedirect(suffix ? `/life/meal-planner/mine/${id}?${suffix}` : `/life/meal-planner/mine/${id}`)
}
