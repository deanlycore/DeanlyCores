import { cookies } from "next/headers"
import { notFound } from "next/navigation"

import { RedeemForm } from "@/components/auth/redeem-form"
import { AppearanceControl } from "@/components/settings/appearance-control"
import { InviteCodesCard } from "@/components/settings/invite-codes-card"
import { HouseholdNameForm } from "@/components/settings/settings-forms"
import { APPEARANCE_COOKIE, parseAppearance } from "@/lib/theme"
import type { InviteCodeView } from "@/lib/invite"

export const dynamic = "force-dynamic"

const codes: InviteCodeView[] = [
  {
    id: "preview-code",
    code: "DEAN-7K2M4P9Q",
    createdAt: "2026-10-01T16:00:00.000Z",
    expiresAt: null,
    maxUses: 2,
    uses: 0,
  },
]

export default async function PreviewInvite() {
  if (process.env.NODE_ENV === "production") notFound()
  const appearance = parseAppearance((await cookies()).get(APPEARANCE_COOKIE)?.value)

  return (
    <div className="mx-auto grid max-w-3xl gap-8 px-4 py-8">
      <div className="flex flex-wrap items-center gap-4">
        <AppearanceControl appearance={appearance} />
        <p className="text-sm text-muted-foreground">Day and Night preview for invite codes.</p>
      </div>

      <div className="grid gap-4">
        <header>
          <h1 className="font-display text-[28px] font-semibold tracking-tight">Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">Household</p>
        </header>
        <section className="deanly-card grid gap-3 p-5">
          <h2 className="font-medium">Household</h2>
          <HouseholdNameForm name="DeanFamily" />
          <p className="text-sm text-muted-foreground">People listed here share this household.</p>
          <ul className="grid gap-2">
            <li className="flex items-center justify-between text-sm">
              <span>Alex Dean</span>
              <span className="text-muted-foreground">Owner</span>
            </li>
          </ul>
        </section>
        <InviteCodesCard codes={codes} />
      </div>

      <RedeemForm configured initialCode="" signedIn={false} />
    </div>
  )
}
