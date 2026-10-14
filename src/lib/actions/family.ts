"use server"

import { revalidatePath } from "next/cache"

import { requireHousehold } from "@/lib/data/context"
import { isHouseholdPermission, parseFamilyForm, type FamilyField } from "@/lib/family/profile"

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
  if (message.includes("cannot be reassigned") || message.includes("login link cannot be changed")) {
    return { ok: false, message: "You don’t have access to change that." }
  }
  if (message.includes("last owner")) {
    return { ok: false, message: "The household needs an owner." }
  }
  if (message.includes("stays on family")) {
    return { ok: false, message: "A household login stays on Family." }
  }
  return { ok: false, message: fallback }
}

function columnMissing(error: { message: string } | null) {
  return Boolean(error && /column/i.test(error.message) && /does not exist/i.test(error.message))
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
  const permissionRaw = text(formData.get("permission")).trim()
  const permission = permissionRaw ? (isHouseholdPermission(permissionRaw) ? permissionRaw : null) : null
  if (permissionRaw && !permission) {
    return { ok: false, message: "Choose owner or member.", field: "permission" }
  }

  const payload = {
    name: parsed.value.name,
    role: parsed.value.role,
    birthday: parsed.value.birthday,
    color: parsed.value.color,
    notes: parsed.value.notes,
  }

  let linkedUserId: string | null = null
  if (id) {
    const existing = await ctx.supabase.from("family_profiles").select("id, user_id").eq("id", id).maybeSingle()
    if (existing.error && !columnMissing(existing.error)) {
      const failed = calm(existing.error, "Couldn’t save that.")
      if (failed) return failed
    }
    if (!existing.error && existing.data && typeof existing.data.user_id === "string") {
      linkedUserId = existing.data.user_id
    }
  }

  if (permission && linkedUserId) {
    const home = await ctx.supabase.from("households").select("owner_id").eq("id", ctx.householdId).maybeSingle()
    const ownerId = !home.error && home.data && typeof home.data.owner_id === "string" ? home.data.owner_id : null
    if (ownerId !== ctx.userId) {
      return { ok: false, message: "You don’t have access to change that." }
    }

    const roleUpdate = await ctx.supabase
      .from("household_members")
      .update({ role: permission })
      .eq("household_id", ctx.householdId)
      .eq("user_id", linkedUserId)
      .select("user_id")

    const roleFailed = calm(roleUpdate.error, "Couldn’t save that.")
    if (roleFailed) return roleFailed
    if (!roleUpdate.data?.length) return { ok: false, message: "You don’t have access to change that." }
  }

  const result = id
    ? await ctx.supabase.from("family_profiles").update(payload).eq("id", id).select("id")
    : await ctx.supabase.from("family_profiles").insert(payload).select("id")

  const failed = calm(result.error, "Couldn’t save that.")
  if (failed) return failed
  if (!result.data?.length) return { ok: false, message: "You don’t have access to change that." }

  revalidatePath("/life/family")
  return { ok: true }
}

export async function archiveFamilyProfile(id: string): Promise<FamilyActionResult> {
  const profileId = id.trim()
  if (!profileId) return { ok: false, message: "Couldn’t remove that member." }

  const ctx = await requireHousehold()
  if (!ctx) return { ok: false, message: "Create your household first." }

  const existing = await ctx.supabase.from("family_profiles").select("id, user_id").eq("id", profileId).maybeSingle()
  if (existing.error && !columnMissing(existing.error)) {
    const failed = calm(existing.error, "Couldn’t remove that member.")
    if (failed) return failed
  }
  if (!existing.error && existing.data && typeof existing.data.user_id === "string") {
    return { ok: false, message: "A household login stays on Family." }
  }

  const { error, data } = await ctx.supabase
    .from("family_profiles")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", profileId)
    .is("archived_at", null)
    .select("id")

  const failed = calm(error, "Couldn’t remove that member.")
  if (failed) return failed
  if (!data?.length) return { ok: false, message: "You don’t have access to change that." }

  revalidatePath("/life/family")
  return { ok: true }
}
