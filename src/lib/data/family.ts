import { requireHousehold } from "@/lib/data/context"
import { getSessionView } from "@/lib/data/session"
import { isFamilyColor, visibleProfiles, type FamilyProfile } from "@/lib/family/profile"

function columnMissing(error: { message: string } | null) {
  return Boolean(error && /column/i.test(error.message) && /does not exist/i.test(error.message))
}

export async function loadFamily(): Promise<{ members: FamilyProfile[]; canEdit: boolean; error: boolean }> {
  const [ctx, session] = await Promise.all([requireHousehold(), getSessionView()])
  if (!ctx) return { members: [], canEdit: false, error: false }

  let canEdit = session.role === "owner"
  const ownerLookup = await ctx.supabase.from("households").select("owner_id").eq("id", ctx.householdId).maybeSingle()
  if (!ownerLookup.error && ownerLookup.data && typeof ownerLookup.data.owner_id === "string") {
    canEdit = ownerLookup.data.owner_id === ctx.userId
  } else if (ownerLookup.error && !columnMissing(ownerLookup.error)) {
    canEdit = false
  }

  const listed = await ctx.supabase
    .from("family_profiles")
    .select("id, name, role, birthday, color, notes, created_at, archived_at")
    .eq("household_id", ctx.householdId)
    .is("archived_at", null)
    .order("name", { ascending: true })
    .limit(100)

  if (listed.error) {
    return { members: [], canEdit, error: true }
  }

  const members = visibleProfiles(
    (listed.data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      role: row.role,
      birthday: row.birthday,
      color: isFamilyColor(row.color) ? row.color : "teal",
      notes: row.notes,
      createdAt: row.created_at,
      archivedAt: row.archived_at,
    })),
  )

  return { members, canEdit, error: false }
}
