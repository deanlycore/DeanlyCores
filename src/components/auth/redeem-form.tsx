"use client"

import Link from "next/link"
import { useState } from "react"
import { useActionState } from "react"

import { checkInviteCode, createAccountWithInvite, redeemInviteCode, type InviteFormState } from "@/lib/actions/invite"
import { DEFAULT_HOUSEHOLD_NAME, normalizeInviteCode } from "@/lib/invite"
import { LoopMark } from "@/components/brand/loop-mark"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

function AuthFrame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="relative grid min-h-full place-items-center overflow-hidden bg-background px-4 py-10">
      <div aria-hidden="true" className="deanly-wash-strong pointer-events-none absolute -left-16 -top-20 h-72 w-72" />
      <div className="relative w-full max-w-[400px]">
        <div className="mb-8 grid justify-items-center text-center">
          <LoopMark size={48} />
          <p className="mt-2.5 font-display text-[15px] font-semibold tracking-tight text-ink">Deanly Tracking</p>
          <p className="mt-3 text-sm text-muted-foreground">Keep life together, effortlessly.</p>
        </div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">{title}</h1>
        <div className="mt-6">{children}</div>
      </div>
    </div>
  )
}

function Message({ state }: { state: InviteFormState }) {
  if (!state?.message) return null
  return (
    <p role="status" className="rounded-xl bg-brand-soft px-3 py-2 text-sm text-on-brand-soft">
      {state.message}
    </p>
  )
}

const fieldClass = "h-11 rounded-button bg-surface px-3"

export function RedeemForm({
  configured,
  signedIn,
  initialCode,
}: {
  configured: boolean
  signedIn: boolean
  initialCode: string
}) {
  const [code, setCode] = useState(initialCode)
  const [codeState, checkCode, checking] = useActionState(checkInviteCode, null)
  const [accountState, createAccount, creating] = useActionState(createAccountWithInvite, null)
  const [nameState, redeem, naming] = useActionState(redeemInviteCode, null)

  const phase = accountState?.ok || (codeState?.ok && signedIn) ? "name" : codeState?.ok ? "account" : "code"

  if (phase === "name") {
    return (
      <AuthFrame title="Name your household">
        <p className="mb-4 text-sm text-muted-foreground">
          This name is yours. It stays separate from anyone else’s household.
        </p>
        <form action={redeem} className="grid gap-4">
          <input type="hidden" name="code" value={code} />
          <div className="grid gap-2">
            <Label htmlFor="household-name">Household name</Label>
            <Input
              id="household-name"
              name="name"
              required
              maxLength={80}
              defaultValue={DEFAULT_HOUSEHOLD_NAME}
              className={fieldClass}
            />
          </div>
          <Message state={nameState} />
          <Button type="submit" disabled={naming || !configured} className="h-11 rounded-button text-primary-foreground">
            {naming ? "One moment…" : "Done"}
          </Button>
        </form>
      </AuthFrame>
    )
  }

  if (phase === "account") {
    return (
      <AuthFrame title="Create your account">
        <p className="mb-4 text-sm text-muted-foreground">This login is for your new household.</p>
        <form action={createAccount} className="grid gap-4">
          <input type="hidden" name="code" value={code} />
          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required autoComplete="email" className={fieldClass} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="new-password"
              minLength={8}
              maxLength={72}
              className={fieldClass}
            />
          </div>
          <Message state={accountState} />
          <Button type="submit" disabled={creating || !configured} className="h-11 rounded-button text-primary-foreground">
            {creating ? "One moment…" : "Create account"}
          </Button>
        </form>
      </AuthFrame>
    )
  }

  return (
    <AuthFrame title="Have a code?">
      <p className="mb-4 text-sm text-muted-foreground">
        This code starts a new home for you — separate from anyone else’s.
      </p>
      <form action={checkCode} className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="code">Code</Label>
          <Input
            id="code"
            name="code"
            required
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            value={code}
            onChange={(event) => setCode(normalizeInviteCode(event.target.value))}
            className={`${fieldClass} font-mono tracking-wide`}
          />
        </div>
        <Message state={codeState} />
        <Button type="submit" disabled={checking || !configured} className="h-11 rounded-button text-primary-foreground">
          {checking ? "One moment…" : "Continue"}
        </Button>
        <Link href="/login" className="text-sm text-muted-foreground hover:text-ink">
          Back to sign in
        </Link>
      </form>
    </AuthFrame>
  )
}
