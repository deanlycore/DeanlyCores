"use server"

import { createClient as createAdminClient } from "@supabase/supabase-js"
import { revalidatePath } from "next/cache"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import {
  DEFAULT_HOUSEHOLD_NAME,
  INVALID_CODE_MESSAGE,
  calmAccountError,
  calmInviteError,
  expiryFromChoice,
  normalizeInviteCode,
  parseMaxUses,
  validInviteCodeShape,
} from "@/lib/invite"
import { getServiceRoleKey } from "@/lib/push/env"
import { REMEMBER_COOKIE } from "@/lib/supabase/cookies"
import { getSupabaseUrl, isSupabaseConfigured } from "@/lib/supabase/env"
import { createClient } from "@/lib/supabase/server"

export type InviteFormState = { message: string; ok?: boolean } | null
export type CreateCodeState = { message: string; code?: string } | null
export type ActionResult = { ok: true } | { ok: false; message: string }

function adminAuth() {
  const url = getSupabaseUrl()
  const key = getServiceRoleKey()
  if (!url || !key) return null
  return createAdminClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

async function rememberThisBrowser() {
  const cookieStore = await cookies()
  cookieStore.set(REMEMBER_COOKIE, "1", {
    path: "/",
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 400,
  })
}

export async function checkInviteCode(_state: InviteFormState, formData: FormData): Promise<InviteFormState> {
  if (!isSupabaseConfigured()) {
    return { message: "Add your Supabase URL and anon key to .env.local, then restart." }
  }
  const code = normalizeInviteCode(String(formData.get("code") ?? ""))
  if (!validInviteCodeShape(code)) return { message: INVALID_CODE_MESSAGE }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc("peek_household_invite_code", { p_code: code })
  if (error || data !== true) return { message: INVALID_CODE_MESSAGE }
  return { message: "", ok: true }
}

export async function createAccountWithInvite(
  _state: InviteFormState,
  formData: FormData,
): Promise<InviteFormState> {
  if (!isSupabaseConfigured()) return { message: "Supabase isn’t configured yet." }
  const code = normalizeInviteCode(String(formData.get("code") ?? ""))
  const email = String(formData.get("email") ?? "").trim().toLowerCase()
  const password = String(formData.get("password") ?? "")
  if (!validInviteCodeShape(code)) return { message: INVALID_CODE_MESSAGE }
  if (!email.includes("@")) return { message: "Enter the email you’ll use to sign in." }
  if (password.length < 8 || password.length > 72) {
    return { message: "Use a password between 8 and 72 characters." }
  }

  const supabase = await createClient()
  const { data: stillValid, error: peekError } = await supabase.rpc("peek_household_invite_code", { p_code: code })
  if (peekError || stillValid !== true) return { message: INVALID_CODE_MESSAGE }

  const admin = adminAuth()
  if (!admin) {
    console.warn("Invite signup skipped: set SUPABASE_SERVICE_ROLE_KEY. Leave public sign-up off.")
    return { message: "Something got in the way. Please try again." }
  }

  const { error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (createError) return { message: calmAccountError(createError.message) }

  await rememberThisBrowser()
  const signedIn = await createClient({ remember: true })
  const { error: signInError } = await signedIn.auth.signInWithPassword({ email, password })
  if (signInError) {
    return { message: "Your login is ready. Sign in, then come back to Have a code? to name your household." }
  }
  return { message: "", ok: true }
}

export async function redeemInviteCode(_state: InviteFormState, formData: FormData): Promise<InviteFormState> {
  if (!isSupabaseConfigured()) return { message: "Supabase isn’t configured yet." }
  const code = normalizeInviteCode(String(formData.get("code") ?? ""))
  const name = String(formData.get("name") ?? "").trim() || DEFAULT_HOUSEHOLD_NAME
  if (!validInviteCodeShape(code)) return { message: INVALID_CODE_MESSAGE }
  if (name.length > 80) return { message: "Please use a shorter household name." }

  const supabase = await createClient()
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) return { message: "Sign in to continue." }

  const { error } = await supabase.rpc("redeem_household_invite_code", {
    p_code: code,
    p_household_name: name,
  })
  if (error) return { message: calmInviteError(error.message) }

  revalidatePath("/home")
  revalidatePath("/settings")
  redirect("/home")
}

export async function createInviteCode(_state: CreateCodeState, formData: FormData): Promise<CreateCodeState> {
  if (!isSupabaseConfigured()) return { message: "Supabase isn’t configured yet." }
  const maxUses = parseMaxUses(String(formData.get("max_uses") ?? "1"))
  if (!maxUses) return { message: "Choose between 1 and 20 uses." }
  const choice = String(formData.get("expiry") ?? "7")
  const expiresAt = expiryFromChoice(choice)
  if (expiresAt === undefined) return { message: "Choose 7 days or Never." }

  const supabase = await createClient()
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) return { message: "Sign in to continue." }

  const { data, error } = await supabase.rpc("create_household_invite_code", {
    p_max_uses: maxUses,
    p_expires_at: expiresAt,
  })
  if (error || !data) return { message: calmInviteError(error?.message ?? "Something got in the way. Please try again.") }

  revalidatePath("/settings")
  return { message: "Code ready — send it to your friend.", code: String(data) }
}

export async function revokeInviteCode(codeId: string): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return { ok: false, message: "Supabase isn’t configured yet." }
  if (!codeId) return { ok: false, message: "That code isn’t valid anymore. Ask for a new one." }
  const supabase = await createClient()
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) return { ok: false, message: "Sign in to continue." }
  const { error } = await supabase.rpc("revoke_household_invite_code", { p_code_id: codeId })
  if (error) return { ok: false, message: calmInviteError(error.message) }
  revalidatePath("/settings")
  return { ok: true }
}
