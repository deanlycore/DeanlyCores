import { InviteCodesCard } from "@/components/settings/invite-codes-card"
import { HouseholdNameForm } from "@/components/settings/settings-forms"
import { accountPermissionLabel } from "@/lib/family/profile"
import type { InviteCodeView } from "@/lib/invite"
import type { MemberView } from "@/lib/data/session"

export function HouseholdPanel({
  name,
  canRename,
  members,
  inviteCodes = [],
  inviteCodesReady = true,
}: {
  name: string
  canRename: boolean
  members: MemberView[]
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
        <ul className="grid gap-2">
          {members.map((member) => (
            <li key={member.userId} className="flex items-center justify-between text-sm">
              <span>{member.displayName}</span>
              <span className="text-muted-foreground">{accountPermissionLabel(member.role)}</span>
            </li>
          ))}
        </ul>
      </div>
      {canRename ? <InviteCodesCard codes={inviteCodes} ready={inviteCodesReady} /> : null}
    </section>
  )
}
