"use server"

import { revalidatePath } from "next/cache"

import { requireHousehold } from "@/lib/data/context"
import { parseFamilyForm, type FamilyField } from "@/lib/family/profile"

export type FamilyActionResult = { ok: true } | { ok: false; message: string; field?: FamilyField }

function text(value: FormDataEntryValue | null) {
  return String(value ?? "")
}

function calm(error: { message: string } | null, fallback: string): FamilyActionResult | null {
  if (!error) return null
  const message = error.message.toLowerCase()
  if (message.includes("family_profiles") && message.includes("does not exist")) {
    return { ok: false, message: "Family isn’t ready yet." }
  }
  if (message.includes("row-level") || message.includes("permission") || message.includes("only the household owner")) {
    return { ok: false, message: "You don’t have access to change that." }
  }
  if (message.includes("cannot be reassigned")) {
    return { ok: false, message: "You don’t have access to change that." }
  }
  return { ok: false, message: fallback }
}

export async function saveFamilyProfile(formData: FormData): Promise<FamilyActionResult> {
  const parsed = parseFamilyForm({
    name: text(formData.get("name")),
    role: text(formData.get("role")),
    birthday: text(formData.get("birthday")),
    color: text(formData.get("color")),
    notes: text(formData.get("notes")),
  })
  if (!parsed.ok) return parsed

  const ctx = await requireHousehold()
  if (!ctx) return { ok: false, message: "Create your household first." }

  const id = text(formData.get("id")).trim()
  const payload = {
    name: parsed.value.name,
    role: parsed.value.role,
    birthday: parsed.value.birthday,
    color: parsed.value.color,
    notes: parsed.value.notes,
  }

  const result = id
    ? await ctx.supabase.from("family_profiles").update(payload).eq("id", id)
    : await ctx.supabase.from("family_profiles").insert(payload)

  const failed = calm(result.error, "Couldn’t save that.")
  if (failed) return failed

  revalidatePath("/life/family")
  return { ok: true }
}

export async function archiveFamilyProfile(id: string): Promise<FamilyActionResult> {
  const profileId = id.trim()
  if (!profileId) return { ok: false, message: "Couldn’t remove that member." }

  const ctx = await requireHousehold()
  if (!ctx) return { ok: false, message: "Create your household first." }

  const { error } = await ctx.supabase
    .from("family_profiles")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", profileId)
    .is("archived_at", null)

  const failed = calm(error, "Couldn’t remove that member.")
  if (failed) return failed

  revalidatePath("/life/family")
  return { ok: true }
}
