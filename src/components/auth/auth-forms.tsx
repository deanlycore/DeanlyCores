"use client"

import Link from "next/link"
import { useActionState, useState } from "react"

import { requestReset, signIn, signUp, updatePassword, type FormState } from "@/lib/actions/auth"
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
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in")
  const [signInState, signInAction, signingIn] = useActionState(signIn, null)
  const [signUpState, signUpAction, signingUp] = useActionState(signUp, null)
  const state = mode === "sign-in" ? signInState : signUpState
  const pending = mode === "sign-in" ? signingIn : signingUp

  return (
    <AuthFrame title={mode === "sign-in" ? "Welcome back" : "Create your login"}>
      {!configured ? (
        <p className="mb-4 text-sm text-muted-foreground">
          Supabase isn’t connected yet. Copy <code>.env.example</code> to <code>.env.local</code> and add your project URL and anon key.
        </p>
      ) : null}
      <form action={mode === "sign-in" ? signInAction : signUpAction} className="grid gap-4">
        {mode === "sign-up" ? (
          <div className="grid gap-2">
            <Label htmlFor="displayName">What should we call you?</Label>
            <Input id="displayName" name="displayName" className={fieldClass} autoComplete="name" />
          </div>
        ) : null}
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
            autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
            className={fieldClass}
          />
        </div>
        {mode === "sign-in" ? (
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" name="remember" defaultChecked className="size-4 accent-[#249B8A]" />
            Remember this browser
          </label>
        ) : null}
        <Message state={state} />
        <Button type="submit" disabled={pending || !configured} className="h-11 rounded-button">
          {pending ? "One moment…" : mode === "sign-in" ? "Sign in" : "Create account"}
        </Button>
      </form>
      <div className="mt-4 flex flex-col gap-2 text-sm">
        <button
          type="button"
          className="text-left text-brand-deep underline-offset-4 hover:underline"
          onClick={() => setMode(mode === "sign-in" ? "sign-up" : "sign-in")}
        >
          {mode === "sign-in" ? "New to Deanly? Create an account" : "Already have a login? Sign in"}
        </button>
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
