"use client"

import Link from "next/link"
import { useActionState } from "react"

import { requestReset, signIn, updatePassword, type FormState } from "@/lib/actions/auth"
import { LoopMark } from "@/components/brand/loop-mark"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

function AuthFrame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="relative grid min-h-full place-items-center overflow-hidden bg-background px-4 py-10">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-16 -top-20 h-72 w-72"
        style={{ background: "radial-gradient(closest-side, rgb(213 242 236 / 0.55), transparent 72%)" }}
      />
      <div className="relative w-full max-w-[400px]">
        <div className="mb-8 grid justify-items-center text-center">
          <LoopMark size={48} />
          <p className="mt-3 text-sm text-muted-foreground">Keep life together, effortlessly.</p>
        </div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">{title}</h1>
        <div className="mt-6">{children}</div>
      </div>
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
        <Button type="submit" disabled={pending || !configured} className="h-11 rounded-button text-primary-foreground">
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
        <Button type="submit" disabled={pending} className="h-11 rounded-button text-primary-foreground">
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
        <Button type="submit" disabled={pending} className="h-11 rounded-button text-primary-foreground">
          {pending ? "Saving…" : "Update password"}
        </Button>
      </form>
    </AuthFrame>
  )
}
