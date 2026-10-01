import { cache } from "react"

import { isSupabaseConfigured } from "@/lib/supabase/env"
import { createClient } from "@/lib/supabase/server"

export type MemberView = {
  userId: string
  role: "owner" | "member"
  displayName: string
  avatarUrl: string | null
}

export type SessionView = {
  configured: boolean
  email: string | null
  userId: string | null
  displayName: string
  avatarUrl: string | null
  householdId: string | null
  householdName: string | null
  role: "owner" | "member" | null
  members: MemberView[]
}

export const getSessionView = cache(async (): Promise<SessionView> => {
  const empty: SessionView = {
    configured: false,
    email: null,
    userId: null,
    displayName: "there",
    avatarUrl: null,
    householdId: null,
    householdName: null,
    role: null,
    members: [],
  }
  if (!isSupabaseConfigured()) return empty

  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  const user = data.user
  if (!user) return { ...empty, configured: true }

  const [{ data: profile }, { data: membership }] = await Promise.all([
    supabase.from("profiles").select("display_name, avatar_url").eq("id", user.id).maybeSingle(),
    supabase
      .from("household_members")
      .select("household_id, role, households(name)")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle(),
  ])

  const household = membership?.households as { name?: string } | { name?: string }[] | null
  const householdName = Array.isArray(household) ? household[0]?.name ?? null : household?.name ?? null
  const displayName = profile?.display_name?.trim() || user.email?.split("@")[0] || "there"
  let members: MemberView[] = []
  if (membership?.household_id) {
    const { data: rows } = await supabase
      .from("household_members")
      .select("user_id, role")
      .eq("household_id", membership.household_id)
    const ids = (rows ?? []).map((row) => row.user_id)
    const { data: profiles } = ids.length
      ? await supabase.from("profiles").select("id, display_name, avatar_url").in("id", ids)
      : { data: [] }
    const byId = new Map((profiles ?? []).map((row) => [row.id, row]))
    members = (rows ?? []).map((row) => ({
      userId: row.user_id,
      role: row.role === "owner" ? "owner" : "member",
      displayName: byId.get(row.user_id)?.display_name?.trim() || "Member",
      avatarUrl: byId.get(row.user_id)?.avatar_url ?? null,
    }))
  }

  return {
    configured: true,
    email: user.email ?? null,
    userId: user.id,
    displayName,
    avatarUrl: profile?.avatar_url ?? null,
    householdId: membership?.household_id ?? null,
    householdName,
    role: membership?.role === "owner" ? "owner" : membership ? "member" : null,
    members,
  }
})
