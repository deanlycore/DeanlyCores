import { notFound } from "next/navigation"

import { previewIsProduction } from "@/lib/preview-access"

import { FamilyBoard } from "@/components/family/family-board"
import { HouseholdPanel } from "@/components/family/household-panel"
import type { MemberView } from "@/lib/data/session"
import type { FamilyProfile, HouseholdPermission } from "@/lib/family/profile"
import type { InviteCodeView } from "@/lib/invite"

import { previewSession } from "../../shell-session"

import { LifePreview } from "../chrome"

export const dynamic = "force-dynamic"

const previewCodes: InviteCodeView[] = [
  {
    id: "preview-code",
    code: "HOME-7K2M4P9Q",
    createdAt: "2026-10-01T16:00:00.000Z",
    expiresAt: null,
    maxUses: 2,
    uses: 0,
  },
]

const previewLogins: MemberView[] = [
  { userId: "alex", role: "owner", displayName: "Alex", avatarUrl: null },
  { userId: "sam", role: "adult", displayName: "Sam", avatarUrl: null },
  { userId: "quinn", role: "view_only", displayName: "Quinn", avatarUrl: null },
]

const familyPreviewSession = {
  ...previewSession,
  displayName: "Alex",
  householdName: "My household",
  members: previewLogins,
}

const previewFamily: FamilyProfile[] = [
  {
    id: "alex",
    name: "Alex",
    role: null,
    birthday: null,
    color: "teal",
    notes: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    archivedAt: null,
    userId: "alex",
    permission: "owner",
  },
  {
    id: "sam",
    name: "Sam",
    role: null,
    birthday: null,
    color: "deep",
    notes: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    archivedAt: null,
    userId: "sam",
    permission: "adult",
  },
  {
    id: "quinn",
    name: "Quinn",
    role: null,
    birthday: null,
    color: "ink",
    notes: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    archivedAt: null,
    userId: "quinn",
    permission: "view_only",
  },
  {
    id: "jordan",
    name: "Jordan",
    role: "Partner",
    birthday: "1992-03-12",
    color: "sand",
    notes: "Saturday soccer.",
    createdAt: "2026-01-02T00:00:00.000Z",
    archivedAt: null,
    userId: null,
    permission: null,
  },
  {
    id: "riley",
    name: "Riley",
    role: "Grandma",
    birthday: "1954-06-02",
    color: "success",
    notes: null,
    createdAt: "2026-01-03T00:00:00.000Z",
    archivedAt: null,
    userId: null,
    permission: null,
  },
  {
    id: "avery",
    name: "Avery",
    role: "Son",
    birthday: "2018-11-18",
    color: "warn",
    notes: null,
    createdAt: "2026-01-04T00:00:00.000Z",
    archivedAt: null,
    userId: null,
    permission: null,
  },
  {
    id: "casey",
    name: "Casey",
    role: "Cousin",
    birthday: "2001-01-09",
    color: "ink",
    notes: "Kept off the list.",
    createdAt: "2026-01-01T00:00:00.000Z",
    archivedAt: "2026-02-01T00:00:00.000Z",
    userId: null,
    permission: null,
  },
]

export default async function PreviewFamily({
  searchParams,
}: {
  searchParams: Promise<{ view?: string | string[]; role?: string | string[]; who?: string | string[] }>
}) {
  if (previewIsProduction()) notFound()
  const params = await searchParams
  const view = Array.isArray(params.view) ? params.view[0] : params.view
  const role = Array.isArray(params.role) ? params.role[0] : params.role
  const who = Array.isArray(params.who) ? params.who[0] : params.who
  const viewerRole: HouseholdPermission = role === "adult" || role === "view_only" ? role : "owner"
  const initialSheet = view === "add" || view === "edit" || view === "remove" ? view : null
  return (
    <LifePreview session={{ ...familyPreviewSession, role: viewerRole }}>
      <FamilyBoard
        members={view === "empty" ? [] : previewFamily}
        viewerRole={viewerRole}
        viewerId={viewerRole === "owner" ? "alex" : viewerRole === "view_only" ? "quinn" : "sam"}
        ownerCount={previewFamily.filter((member) => member.permission === "owner" && member.archivedAt == null).length}
        mode="preview"
        initialSheet={initialSheet}
        initialEditId={who ?? (initialSheet === "edit" ? "sam" : null)}
        beforeList={
          <HouseholdPanel
            name="My household"
            canRename={viewerRole === "owner"}
            inviteCodes={viewerRole === "owner" ? previewCodes : []}
          />
        }
      />
    </LifePreview>
  )
}
