"use server"

import { cookies, headers } from "next/headers"
import { redirect } from "next/navigation"

import { REMEMBER_COOKIE } from "@/lib/supabase/cookies"
import { getConfiguredSiteUrl, isSupabaseConfigured } from "@/lib/supabase/env"
import { createClient } from "@/lib/supabase/server"

export type FormState = { message: string } | null

function calmAuthError(message: string) {
  const lower = message.toLowerCase()
  if (lower.includes("invalid login") || lower.includes("invalid credentials")) {
    return "That email and password didn’t match. Try again, or reset your password."
  }
  if (lower.includes("email not confirmed")) {
    return "Confirm your email first. The link is in your inbox."
  }
  if (lower.includes("password")) return "Use a password between 8 and 72 characters."
  return "Something got in the way. Please try again."
}

async function origin() {
  const headerList = await headers()
  return (
    getConfiguredSiteUrl() ??
    headerList.get("origin") ??
    "http://127.0.0.1:43123"
  )
}

function rememberCookie(remember: boolean) {
  return {
    path: "/",
    sameSite: "lax" as const,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    ...(remember ? { maxAge: 60 * 60 * 24 * 400 } : {}),
  }
}

export async function signIn(_state: FormState, formData: FormData): Promise<FormState> {
  if (!isSupabaseConfigured()) {
    return { message: "Add your Supabase URL and anon key to .env.local, then restart." }
  }
  const email = String(formData.get("email") ?? "").trim()
  const password = String(formData.get("password") ?? "")
  const remember = formData.get("remember") === "on"
  if (!email || !password) return { message: "Enter your email and password." }

  const cookieStore = await cookies()
  cookieStore.set(REMEMBER_COOKIE, remember ? "1" : "0", rememberCookie(remember))

  const supabase = await createClient({ remember })
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) return { message: calmAuthError(error.message) }
  redirect("/home")
}

export async function requestReset(_state: FormState, formData: FormData): Promise<FormState> {
  if (!isSupabaseConfigured()) {
    return { message: "Supabase isn’t configured yet." }
  }
  const email = String(formData.get("email") ?? "").trim()
  if (!email) return { message: "Enter the email you use for Deanly Tracking." }
  const supabase = await createClient()
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${await origin()}/auth/callback?next=/auth/update-password`,
  })
  return { message: "If an account exists for that email, a reset link is on its way." }
}

export async function updatePassword(_state: FormState, formData: FormData): Promise<FormState> {
  if (!isSupabaseConfigured()) return { message: "Supabase isn’t configured yet." }
  const password = String(formData.get("password") ?? "")
  const confirm = String(formData.get("confirm") ?? "")
  if (password.length < 8 || password.length > 72) {
    return { message: "Use a password between 8 and 72 characters." }
  }
  if (password !== confirm) return { message: "Those passwords don’t match." }
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) return { message: "This reset link has expired. Request a new one." }
  const { error } = await supabase.auth.updateUser({ password })
  if (error) return { message: calmAuthError(error.message) }
  redirect("/home")
}

export async function signOut() {
  if (isSupabaseConfigured()) {
    const supabase = await createClient()
    await supabase.auth.signOut()
  }
  redirect("/login")
}
