"use server"

import { revalidatePath } from "next/cache"

import { requireHousehold } from "@/lib/data/context"
import { firstName } from "@/lib/home/metrics"
import { STALE_SAVE, shoppingCategory, shoppingDbMessage, type ShoppingCategory } from "@/lib/life/shopping"
import { normalizeTypedAmount } from "@/lib/life/units"
import { defaultVisibilityFor, type Visibility } from "@/lib/visibility"

export type ShoppingActionResult = { ok: true; id?: string } | { ok: false; message: string; conflict?: boolean }

function visibilityOf(value: FormDataEntryValue | null, fallback: Visibility): Visibility {
  return value === "private" || value === "shared" ? value : fallback
}

function textOf(value: FormDataEntryValue | null, max: number) {
  const text = String(value ?? "").trim()
  if (!text || text.length > max) return null
  return text
}

function amountFields(formData: FormData) {
  const manual_amount_raw = textOf(formData.get("manual_amount_raw"), 40)
  const manual_unit_raw = textOf(formData.get("manual_unit_raw"), 24)
  const normalized = normalizeTypedAmount(manual_amount_raw, manual_unit_raw)
  return {
    manual_amount_raw,
    manual_unit_raw,
    manual_qty: normalized.qty,
    manual_unit: normalized.unit,
  }
}

function centsOf(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim()
  if (!raw) return null
  const amount = Number(raw)
  if (!Number.isFinite(amount) || amount < 0 || amount > 1000000) return Number.NaN
  return Math.round(amount * 100)
}

function categoryOf(value: FormDataEntryValue | null): ShoppingCategory {
  return shoppingCategory(String(value ?? ""))
}

async function gate() {
  const ctx = await requireHousehold()
  if (!ctx) return { ok: false as const, message: "Create your household first.", ctx: null }
  return { ok: true as const, message: "", ctx }
}

function refresh() {
  revalidatePath("/home")
  revalidatePath("/life", "layout")
}

function stale(error: { code?: string; message: string } | null, count: number | null) {
  if (error) return false
  return count === 0
}

function schemaMissing(error: { message: string } | null) {
  return Boolean(error && /does not exist|schema cache/i.test(error.message))
}

function failed(
  error: { code?: string; message: string; details?: string | null } | null,
  fallback: string,
): { ok: false; message: string } | null {
  if (!error) return null
  return { ok: false, message: shoppingDbMessage(error, fallback) }
}

async function listForVisibility(
  ctx: NonNullable<Awaited<ReturnType<typeof requireHousehold>>>,
  listId: string,
  visibility: Visibility,
) {
  if (listId) {
    const list = await ctx.supabase.from("shopping_lists").select("id, visibility").eq("id", listId).maybeSingle()
    if (list.error && schemaMissing(list.error)) return { id: null as string | null, missing: true }
    if (list.data?.visibility === visibility) return { id: list.data.id, missing: false }
  }
  let query = ctx.supabase
    .from("shopping_lists")
    .select("id")
    .eq("household_id", ctx.householdId)
    .eq("visibility", visibility)
    .eq("is_default", true)
  if (visibility === "private") query = query.eq("created_by", ctx.userId)
  const found = await query.maybeSingle()
  if (found.error && schemaMissing(found.error)) return { id: null, missing: true }
  if (found.data?.id) return { id: found.data.id, missing: false }
  const created = await ctx.supabase
    .from("shopping_lists")
    .insert({
      household_id: ctx.householdId,
      created_by: ctx.userId,
      visibility,
      name: "Groceries",
      is_default: true,
    })
    .select("id")
    .single()
  if (created.error && schemaMissing(created.error)) return { id: null, missing: true }
  return { id: created.data?.id ?? null, missing: false }
}

async function loadStamp(
  ctx: NonNullable<Awaited<ReturnType<typeof requireHousehold>>>,
  id: string | null,
  updatedAt: string | null,
): Promise<null | { ok: false; message: string; conflict?: boolean } | { ok: true; id: string; updatedAt: string }> {
  if (!id) return null
  if (!updatedAt) return { ok: false, message: STALE_SAVE, conflict: true }
  const current = await ctx.supabase.from("shopping_items").select("id").eq("id", id).eq("updated_at", updatedAt).maybeSingle()
  if (current.error && schemaMissing(current.error)) return { ok: true, id, updatedAt }
  const blocked = failed(current.error, "Couldn’t save that item.")
  if (blocked) return blocked
  if (!current.data) return { ok: false, message: STALE_SAVE, conflict: true }
  return { ok: true, id, updatedAt }
}

export async function saveShoppingItem(formData: FormData): Promise<ShoppingActionResult> {
  const ready = await gate()
  if (!ready.ctx) return ready
  const name = textOf(formData.get("name"), 140)
  if (!name) return { ok: false, message: "Add an item." }
  const price = centsOf(formData.get("price"))
  if (Number.isNaN(price)) return { ok: false, message: "Use a price of zero or more." }
  const id = textOf(formData.get("id"), 80)
  const updatedAt = textOf(formData.get("updated_at"), 80)
  const stamp = await loadStamp(ready.ctx, id, updatedAt)
  if (stamp && !stamp.ok) return stamp
  const visibility = visibilityOf(formData.get("visibility"), defaultVisibilityFor("shopping", ready.ctx.lastVisibility))
  const requestedList = textOf(formData.get("list_id"), 80) ?? ""
  const list = await listForVisibility(ready.ctx, requestedList, visibility)
  if (list.missing) {
    if (stamp?.ok) {
      const saved = await ready.ctx.supabase
        .from("shopping_items")
        .update({ name, visibility })
        .eq("id", stamp.id)
        .eq("updated_at", stamp.updatedAt)
        .select("id")
      const blocked = failed(saved.error, "Couldn’t save that item.")
      if (blocked) return blocked
      if (!saved.data?.length) return { ok: false, message: STALE_SAVE, conflict: true }
      refresh()
      return { ok: true, id: stamp.id }
    }
    const legacy = await ready.ctx.supabase
      .from("shopping_items")
      .insert({
        household_id: ready.ctx.householdId,
        owner_id: ready.ctx.userId,
        visibility,
        name,
      })
      .select("id")
      .single()
    const blocked = failed(legacy.error, "Couldn’t add that item.")
    if (blocked || !legacy.data) return blocked ?? { ok: false, message: "Couldn’t add that item." }
    refresh()
    return { ok: true, id: legacy.data.id }
  }
  if (!list.id) return { ok: false, message: "Choose a list." }
  const fields = {
    name,
    ...amountFields(formData),
    price_cents: price,
    notes: textOf(formData.get("notes"), 500),
    category: categoryOf(formData.get("category")),
    visibility,
    list_id: list.id,
    user_edited: true,
  }
  if (!stamp?.ok) {
    const created = await ready.ctx.supabase
      .from("shopping_items")
      .insert({
        household_id: ready.ctx.householdId,
        owner_id: ready.ctx.userId,
        source: "manual",
        ...fields,
      })
      .select("id")
      .single()
    const blocked = failed(created.error, "Couldn’t add that item.")
    if (blocked || !created.data) return blocked ?? { ok: false, message: "Couldn’t add that item." }
    refresh()
    return { ok: true, id: created.data.id }
  }
  const saved = await ready.ctx.supabase
    .from("shopping_items")
    .update(fields)
    .eq("id", stamp.id)
    .eq("updated_at", stamp.updatedAt)
    .select("id")
  const blocked = failed(saved.error, "Couldn’t save that item.")
  if (blocked) return blocked
  if (stale(saved.error, saved.data?.length ?? 0)) return { ok: false, message: STALE_SAVE, conflict: true }
  refresh()
  return { ok: true, id: stamp.id }
}

export async function quickAddShoppingItem(formData: FormData): Promise<ShoppingActionResult> {
  formData.set("category", "other")
  return saveShoppingItem(formData)
}

export async function setShoppingItemChecked(id: string, checked: boolean, updatedAt: string): Promise<ShoppingActionResult> {
  const ready = await gate()
  if (!ready.ctx) return ready
  const saved = await ready.ctx.supabase
    .from("shopping_items")
    .update({ checked_at: checked ? new Date().toISOString() : null })
    .eq("id", id)
    .eq("updated_at", updatedAt)
    .select("id, name, visibility")
  const blocked = failed(saved.error, "Couldn’t update that item.")
  if (blocked) return blocked
  if (!saved.data?.length) return { ok: false, message: STALE_SAVE, conflict: true }
  if (checked) {
    await ready.ctx.supabase.from("activity_events").insert({
      household_id: ready.ctx.householdId,
      actor_id: ready.ctx.userId,
      owner_id: ready.ctx.userId,
      visibility: saved.data[0].visibility,
      summary: `${firstName(ready.ctx.displayName)} checked off ${saved.data[0].name}`.slice(0, 240),
      entity_type: "shopping",
      entity_id: id,
    })
  }
  refresh()
  return { ok: true, id }
}

export async function markShoppingAtHome(id: string): Promise<ShoppingActionResult> {
  const ready = await gate()
  if (!ready.ctx) return ready
  const item = await ready.ctx.supabase
    .from("shopping_items")
    .select("id, name, manual_amount_raw, manual_unit_raw, manual_qty, manual_unit, auto_qty, auto_unit, category, notes, visibility, household_id")
    .eq("id", id)
    .maybeSingle()
  const missing = failed(item.error, "Couldn’t update that item.")
  if (missing || !item.data) return missing ?? { ok: false, message: "Couldn’t update that item." }
  const saved = await ready.ctx.supabase
    .from("pantry_items")
    .insert({
      household_id: item.data.household_id,
      created_by: ready.ctx.userId,
      visibility: item.data.visibility,
      name: item.data.name,
      manual_amount_raw: item.data.manual_amount_raw,
      manual_unit_raw: item.data.manual_unit_raw,
      manual_qty: item.data.manual_qty,
      manual_unit: item.data.manual_unit,
      auto_qty: item.data.auto_qty,
      auto_unit: item.data.auto_unit,
      category: item.data.category,
      notes: item.data.notes,
      shopping_item_id: item.data.id,
    })
    .select("id")
    .single()
  const blocked = failed(saved.error, "Couldn’t mark that at home.")
  if (blocked || !saved.data) return blocked ?? { ok: false, message: "Couldn’t mark that at home." }
  refresh()
  return { ok: true, id: saved.data.id }
}

export async function setShoppingListVisibility(id: string, visibility: Visibility, updatedAt: string): Promise<ShoppingActionResult> {
  const ready = await gate()
  if (!ready.ctx) return ready
  const saved = await ready.ctx.supabase
    .from("shopping_lists")
    .update({ visibility })
    .eq("id", id)
    .eq("updated_at", updatedAt)
    .select("id")
  const blocked = failed(saved.error, "Couldn’t update that list.")
  if (blocked) return blocked
  if (!saved.data?.length) return { ok: false, message: STALE_SAVE, conflict: true }
  refresh()
  return { ok: true, id }
}

export async function updateShoppingList(id: string, name: string, updatedAt: string): Promise<ShoppingActionResult> {
  const ready = await gate()
  if (!ready.ctx) return ready
  const clean = name.trim()
  if (!clean || clean.length > 40) return { ok: false, message: "Name that list." }
  const saved = await ready.ctx.supabase
    .from("shopping_lists")
    .update({ name: clean })
    .eq("id", id)
    .eq("updated_at", updatedAt)
    .select("id")
  const blocked = failed(saved.error, "Couldn’t save that list.")
  if (blocked) return blocked
  if (!saved.data?.length) return { ok: false, message: STALE_SAVE, conflict: true }
  refresh()
  return { ok: true, id }
}

export async function createShoppingList(name: string, visibility: Visibility): Promise<ShoppingActionResult> {
  const ready = await gate()
  if (!ready.ctx) return ready
  const clean = name.trim()
  if (!clean || clean.length > 40) return { ok: false, message: "Name that list." }
  const saved = await ready.ctx.supabase
    .from("shopping_lists")
    .insert({
      household_id: ready.ctx.householdId,
      created_by: ready.ctx.userId,
      visibility,
      name: clean,
      is_default: false,
    })
    .select("id")
    .single()
  const blocked = failed(saved.error, "Couldn’t add that list.")
  if (blocked || !saved.data) return blocked ?? { ok: false, message: "Couldn’t add that list." }
  refresh()
  return { ok: true, id: saved.data.id }
}

export async function moveShoppingItem(id: string, visibility: Visibility, updatedAt: string): Promise<ShoppingActionResult> {
  const ready = await gate()
  if (!ready.ctx) return ready
  let existing = ready.ctx.supabase
    .from("shopping_lists")
    .select("id")
    .eq("household_id", ready.ctx.householdId)
    .eq("visibility", visibility)
    .eq("is_default", true)
  if (visibility === "private") existing = existing.eq("created_by", ready.ctx.userId)
  const found = await existing.maybeSingle()
  let listId = found.data?.id
  if (!listId) {
    const created = await ready.ctx.supabase
      .from("shopping_lists")
      .insert({
        household_id: ready.ctx.householdId,
        created_by: ready.ctx.userId,
        visibility,
        name: "Groceries",
        is_default: true,
      })
      .select("id")
      .single()
    const blocked = failed(created.error, "Couldn’t update that item.")
    if (blocked || !created.data) return blocked ?? { ok: false, message: "Couldn’t update that item." }
    listId = created.data.id
  }
  const saved = await ready.ctx.supabase
    .from("shopping_items")
    .update({ visibility, list_id: listId, user_edited: true })
    .eq("id", id)
    .eq("updated_at", updatedAt)
    .select("id")
  const blocked = failed(saved.error, "Couldn’t update that item.")
  if (blocked) return blocked
  if (!saved.data?.length) return { ok: false, message: STALE_SAVE, conflict: true }
  refresh()
  return { ok: true, id }
}
