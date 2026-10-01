"use client"

import Link from "next/link"
import { useActionState } from "react"

import { requestReset, signIn, updatePassword, type FormState } from "@/lib/actions/auth"
import { Wordmark } from "@/components/brand/wordmark"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

function AuthFrame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="grid min-h-full lg:grid-cols-2">
      <section className="hidden flex-col justify-between bg-[linear-gradient(160deg,#D5F2EC,transparent_42%),linear-gradient(#FAF8F5,#F3EFE9)] p-12 lg:flex">
        <Wordmark size="lg" />
        <div>
          <p className="font-display text-4xl font-semibold tracking-tight text-ink">
            Keep life together, effortlessly.
          </p>
          <p className="mt-4 max-w-sm text-sm text-muted-foreground">
            A private place for DeanFamily. Separate logins. Shared where it helps.
          </p>
        </div>
        <p className="text-sm text-muted-foreground">Deanly — DeanFamily</p>
      </section>
      <section className="flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Wordmark />
          </div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">{title}</h1>
          <div className="mt-6">{children}</div>
        </div>
      </section>
    </div>
  )
}

function Message({ state }: { state: FormState }) {
  if (!state?.message) return null
  return (
    <p role="status" className="rounded-xl bg-brand-soft px-3 py-2 text-sm text-brand-deep">
      {state.message}
    </p>
  )
}

const fieldClass = "h-11 rounded-button bg-surface px-3"

export function LoginForm({ configured }: { configured: boolean }) {
  const [state, action, pending] = useActionState(signIn, null)

  return (
    <AuthFrame title="Welcome back">
      {!configured ? (
        <p className="mb-4 text-sm text-muted-foreground">
          Supabase isn’t connected yet. Copy <code>.env.example</code> to <code>.env.local</code> and add your project URL and anon key.
        </p>
      ) : null}
      <p className="mb-4 text-sm text-muted-foreground">Sign in with the login you were given.</p>
      <form action={action} className="grid gap-4">
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
            autoComplete="current-password"
            className={fieldClass}
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input type="checkbox" name="remember" defaultChecked className="size-4 accent-[#249B8A]" />
          Remember this browser
        </label>
        <Message state={state} />
        <Button type="submit" disabled={pending || !configured} className="h-11 rounded-button">
          {pending ? "One moment…" : "Sign in"}
        </Button>
      </form>
      <div className="mt-4 text-sm">
        <Link href="/forgot-password" className="text-muted-foreground hover:text-ink">
          Forgot password
        </Link>
      </div>
    </AuthFrame>
  )
}

export function ForgotForm() {
  const [state, action, pending] = useActionState(requestReset, null)
  return (
    <AuthFrame title="Reset your password">
      <form action={action} className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" required autoComplete="email" className={fieldClass} />
        </div>
        <Message state={state} />
        <Button type="submit" disabled={pending} className="h-11 rounded-button">
          {pending ? "Sending…" : "Send reset link"}
        </Button>
        <Link href="/login" className="text-sm text-muted-foreground hover:text-ink">
          Back to sign in
        </Link>
      </form>
    </AuthFrame>
  )
}

export function UpdatePasswordForm() {
  const [state, action, pending] = useActionState(updatePassword, null)
  return (
    <AuthFrame title="Choose a new password">
      <form action={action} className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="password">New password</Label>
          <Input id="password" name="password" type="password" required autoComplete="new-password" className={fieldClass} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="confirm">Confirm password</Label>
          <Input id="confirm" name="confirm" type="password" required autoComplete="new-password" className={fieldClass} />
        </div>
        <Message state={state} />
        <Button type="submit" disabled={pending} className="h-11 rounded-button">
          {pending ? "Saving…" : "Update password"}
        </Button>
      </form>
    </AuthFrame>
  )
}
