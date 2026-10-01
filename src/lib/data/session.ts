import { cache } from "react"

import { isSupabaseConfigured } from "@/lib/supabase/env"
import { createClient } from "@/lib/supabase/server"

export type SessionView = {
  configured: boolean
  email: string | null
  displayName: string
  householdName: string | null
}

export const getSessionView = cache(async (): Promise<SessionView> => {
  if (!isSupabaseConfigured()) {
    return { configured: false, email: null, displayName: "there", householdName: null }
  }

  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  const user = data.user
  if (!user) {
    return { configured: true, email: null, displayName: "there", householdName: null }
  }

  const [{ data: profile }, { data: membership }] = await Promise.all([
    supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
    supabase
      .from("household_members")
      .select("households(name)")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle(),
  ])

  const household = membership?.households as { name?: string } | { name?: string }[] | null
  const householdName = Array.isArray(household) ? household[0]?.name ?? null : household?.name ?? null
  const displayName = profile?.display_name?.trim() || user.email?.split("@")[0] || "there"

  return {
    configured: true,
    email: user.email ?? null,
    displayName,
    householdName,
  }
})
