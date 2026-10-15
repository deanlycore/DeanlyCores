import { InviteCodesCard } from "@/components/settings/invite-codes-card"
import { HouseholdNameForm } from "@/components/settings/settings-forms"
import type { InviteCodeView } from "@/lib/invite"

export function HouseholdPanel({
  name,
  canRename,
  inviteCodes = [],
  inviteCodesReady = true,
}: {
  name: string
  canRename: boolean
  inviteCodes?: InviteCodeView[]
  inviteCodesReady?: boolean
}) {
  return (
    <section id="household" className="grid gap-4">
      <div className="deanly-card grid gap-3 p-5">
        <h2 className="font-display text-[16px] font-semibold text-ink">Household</h2>
        {canRename ? (
          <HouseholdNameForm name={name} />
        ) : (
          <p className="text-sm font-medium">{name}</p>
        )}
        <p className="text-sm text-muted-foreground">People listed here share this household.</p>
      </div>
      {canRename ? <InviteCodesCard codes={inviteCodes} ready={inviteCodesReady} /> : null}
    </section>
  )
}
