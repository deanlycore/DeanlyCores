"use server"

import { revalidatePath } from "next/cache"

import { calmInviteError } from "@/lib/invite"
import { isSupabaseConfigured } from "@/lib/supabase/env"
import { createClient } from "@/lib/supabase/server"

export type ActionResult = { ok: true } | { ok: false; message: string }

export async function renameHousehold(formData: FormData): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return { ok: false, message: "Supabase isn’t configured yet." }
  const name = String(formData.get("name") ?? "").trim()
  if (!name) return { ok: false, message: "Enter a household name." }
  if (name.length > 80) return { ok: false, message: "Please use a shorter household name." }

  const supabase = await createClient()
  const { error } = await supabase.rpc("rename_household", { household_name: name })
  if (error) return { ok: false, message: calmInviteError(error.message) }

  revalidatePath("/home")
  revalidatePath("/settings")
  return { ok: true }
}
