import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { RedeemForm } from "@/components/auth/redeem-form"
import { normalizeInviteCode } from "@/lib/invite"
import { getSessionView } from "@/lib/data/session"
import { isSupabaseConfigured } from "@/lib/supabase/env"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: { absolute: "Deanly Tracking" } }

export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string | string[] }>
}) {
  const params = await searchParams
  const raw = typeof params.code === "string" ? params.code : ""
  const session = await getSessionView()
  if (session.householdId) redirect("/home")

  return (
    <RedeemForm
      configured={isSupabaseConfigured()}
      signedIn={Boolean(session.userId)}
      initialCode={normalizeInviteCode(raw)}
    />
  )
}
