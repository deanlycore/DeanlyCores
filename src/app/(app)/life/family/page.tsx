import type { Metadata } from "next"

import { FamilyBoard } from "@/components/family/family-board"
import { HouseholdPanel } from "@/components/family/household-panel"
import { requireHousehold } from "@/lib/data/context"
import { loadFamily } from "@/lib/data/family"
import { getSessionView } from "@/lib/data/session"
import { toActiveInvite, type InviteCodeRecord, type InviteCodeView } from "@/lib/invite"

export const metadata: Metadata = { title: "Family" }

export default async function Page() {
  const [family, session, ctx] = await Promise.all([loadFamily(), getSessionView(), requireHousehold()])

  let inviteCodes: InviteCodeView[] = []
  let inviteCodesReady = true
  if (ctx && session.role === "owner") {
    const { data, error } = await ctx.supabase
      .from("household_invite_codes")
      .select("id, code, created_at, expires_at, max_uses, uses, revoked_at, purpose")
      .eq("household_id", ctx.householdId)
      .order("created_at", { ascending: false })
    if (error) {
      inviteCodesReady = false
    } else {
      inviteCodes = (data ?? []).flatMap((row) => {
        const view = toActiveInvite(row as InviteCodeRecord)
        return view ? [view] : []
      })
    }
  }

  return (
    <FamilyBoard
      members={family.members}
      viewerRole={family.viewerRole}
      viewerId={family.viewerId}
      error={family.error}
      beforeList={
        <HouseholdPanel
          name={session.householdName ?? "My household"}
          canRename={session.role === "owner"}
          members={session.members}
          inviteCodes={inviteCodes}
          inviteCodesReady={inviteCodesReady}
        />
      }
    />
  )
}
