import { requireHousehold } from "@/lib/data/context"
import { getSessionView } from "@/lib/data/session"
import {
  isFamilyColor,
  isHouseholdPermission,
  visibleProfiles,
  type FamilyProfile,
} from "@/lib/family/profile"

function columnMissing(error: { message: string } | null) {
  return Boolean(error && /column/i.test(error.message) && /does not exist/i.test(error.message))
}

export async function loadFamily(): Promise<{
  members: FamilyProfile[]
  canEdit: boolean
  viewerId: string | null
  error: boolean
}> {
  const [ctx, session] = await Promise.all([requireHousehold(), getSessionView()])
  if (!ctx) return { members: [], canEdit: false, viewerId: null, error: false }

  let canEdit = session.role === "owner"
  const ownerLookup = await ctx.supabase.from("households").select("owner_id").eq("id", ctx.householdId).maybeSingle()
  if (!ownerLookup.error && ownerLookup.data && typeof ownerLookup.data.owner_id === "string") {
    canEdit = ownerLookup.data.owner_id === ctx.userId
  } else if (ownerLookup.error && !columnMissing(ownerLookup.error)) {
    canEdit = false
  }

  const withLogin = await ctx.supabase
    .from("family_profiles")
    .select("id, name, role, birthday, color, notes, created_at, archived_at, user_id")
    .eq("household_id", ctx.householdId)
    .is("archived_at", null)
    .order("name", { ascending: true })
    .limit(100)

  const listed = withLogin.error && columnMissing(withLogin.error)
    ? await ctx.supabase
        .from("family_profiles")
        .select("id, name, role, birthday, color, notes, created_at, archived_at")
        .eq("household_id", ctx.householdId)
        .is("archived_at", null)
        .order("name", { ascending: true })
        .limit(100)
    : withLogin

  if (listed.error) {
    return { members: [], canEdit, viewerId: ctx.userId, error: true }
  }

  const memberships = await ctx.supabase
    .from("household_members")
    .select("user_id, role")
    .eq("household_id", ctx.householdId)

  if (memberships.error) {
    return { members: [], canEdit, viewerId: ctx.userId, error: true }
  }

  const roleByUser = new Map(
    (memberships.data ?? []).map((row) => [row.user_id, isHouseholdPermission(row.role) ? row.role : "member"] as const),
  )

  const members = visibleProfiles(
    (listed.data ?? []).flatMap((row) => {
      const userId = "user_id" in row && typeof row.user_id === "string" ? row.user_id : null
      if (userId && !roleByUser.has(userId)) return []
      const profile: FamilyProfile = {
        id: row.id,
        name: row.name,
        role: row.role,
        birthday: row.birthday,
        color: isFamilyColor(row.color) ? row.color : "teal",
        notes: row.notes,
        createdAt: row.created_at,
        archivedAt: row.archived_at,
        userId,
        permission: userId ? roleByUser.get(userId) ?? null : null,
      }
      return [profile]
    }),
  )

  return { members, canEdit, viewerId: ctx.userId, error: false }
}
