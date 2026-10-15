"use server"

import { revalidatePath } from "next/cache"

import { requireHousehold } from "@/lib/data/context"
import { firstName } from "@/lib/home/metrics"
import { STALE_SAVE } from "@/lib/life/shopping"
import { failed, finishFresh, listForVisibility, saveShoppingItemWith, writeFresh, type ShoppingActionResult } from "@/lib/life/shopping-save"
import { type Visibility } from "@/lib/visibility"

export type { ShoppingActionResult }

async function gate() {
  const ctx = await requireHousehold()
  if (!ctx) return { ok: false as const, message: "Create your household first.", ctx: null }
  return { ok: true as const, message: "", ctx }
}

function refresh() {
  revalidatePath("/home")
  revalidatePath("/life", "layout")
}

export async function saveShoppingItem(formData: FormData): Promise<ShoppingActionResult> {
  const ready = await gate()
  if (!ready.ctx) return ready
  return saveShoppingItemWith(ready.ctx, formData, refresh)
}

export async function quickAddShoppingItem(formData: FormData): Promise<ShoppingActionResult> {
  formData.set("category", "other")
  return saveShoppingItem(formData)
}

async function finishCheck(
  ctx: NonNullable<Awaited<ReturnType<typeof requireHousehold>>>,
  id: string,
  checked: boolean,
  saved: { error: { code?: string; message: string; details?: string | null } | null; data: { id: string; name: string; visibility: Visibility }[] | null },
): Promise<ShoppingActionResult> {
  const blocked = failed(saved.error, "Couldn’t update that item.")
  if (blocked) return blocked
  if (!saved.data?.length) return { ok: false, message: STALE_SAVE, conflict: true }
  if (checked) {
    await ctx.supabase.from("activity_events").insert({
      household_id: ctx.householdId,
      actor_id: ctx.userId,
      owner_id: ctx.userId,
      visibility: saved.data[0].visibility,
      summary: `${firstName(ctx.displayName)} checked off ${saved.data[0].name}`.slice(0, 240),
      entity_type: "shopping",
      entity_id: id,
    })
  }
  refresh()
  return { ok: true, id }
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
  return finishCheck(ready.ctx, id, checked, saved)
}

export async function keepShoppingItemChecked(id: string, checked: boolean): Promise<ShoppingActionResult> {
  const ready = await gate()
  if (!ready.ctx) return ready
  const saved = await writeFresh(ready.ctx, id, { checked_at: checked ? new Date().toISOString() : null })
  return finishCheck(ready.ctx, id, checked, saved)
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

export async function keepShoppingItemMove(id: string, visibility: Visibility): Promise<ShoppingActionResult> {
  const ready = await gate()
  if (!ready.ctx) return ready
  const list = await listForVisibility(ready.ctx, "", visibility)
  if (!list.id) return { ok: false, message: "Couldn’t update that item." }
  const saved = await writeFresh(ready.ctx, id, { visibility, list_id: list.id, user_edited: true })
  return finishFresh(saved, id, refresh) ?? { ok: false, message: "Couldn’t update that item." }
}
