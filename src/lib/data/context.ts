import { cache } from "react"

import type { Visibility } from "@/lib/visibility"
import { createClient } from "@/lib/supabase/server"

export type HouseholdContext = {
  supabase: Awaited<ReturnType<typeof createClient>>
  userId: string
  householdId: string
  displayName: string
  currency: string
  lastVisibility: Visibility
  checklistDismissed: boolean
}

export const requireHousehold = cache(async (): Promise<HouseholdContext | null> => {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  const user = data.user
  if (!user) return null

  const [{ data: profile }, { data: membership }, { data: prefs }] = await Promise.all([
    supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
    supabase.from("household_members").select("household_id").eq("user_id", user.id).limit(1).maybeSingle(),
    supabase
      .from("user_preferences")
      .select("currency, last_visibility, notification_prefs")
      .eq("user_id", user.id)
      .maybeSingle(),
  ])

  if (!membership?.household_id) return null
  const notification = (prefs?.notification_prefs ?? {}) as { home_checklist_dismissed?: boolean }

  return {
    supabase,
    userId: user.id,
    householdId: membership.household_id,
    displayName: profile?.display_name?.trim() || user.email?.split("@")[0] || "Someone",
    currency: prefs?.currency || "USD",
    lastVisibility: prefs?.last_visibility === "private" ? "private" : "shared",
    checklistDismissed: Boolean(notification.home_checklist_dismissed),
  }
})
