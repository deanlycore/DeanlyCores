"use server"

import { revalidatePath } from "next/cache"

import { requireHousehold } from "@/lib/data/context"
import { firstName, parseCents, parseDate, zonedDate, zonedDateTimeToIso } from "@/lib/home/metrics"
import { notifySharedCreate } from "@/lib/push/send"
import { shouldNotifySharedCreate, type SharedPushKind } from "@/lib/push/shared"
import { defaultVisibilityFor, type Visibility } from "@/lib/visibility"
import { createClient } from "@/lib/supabase/server"

export type ActionResult = { ok: true } | { ok: false; message: string }

function visibilityOf(value: FormDataEntryValue | null, fallback: Visibility): Visibility {
  return value === "private" || value === "shared" ? value : fallback
}

function textOf(value: FormDataEntryValue | null, max: number) {
  const text = String(value ?? "").trim()
  if (!text || text.length > max) return null
  return text
}

function calm(error: { message: string } | null, fallback: string): ActionResult | null {
  if (!error) return null
  const message = error.message.toLowerCase()
  if (message.includes("duplicate") || message.includes("budgets_shared") || message.includes("budgets_private")) {
    return { ok: false, message: "That budget is already set for this month." }
  }
  if (message.includes("row-level") || message.includes("permission")) {
    return { ok: false, message: "You don’t have access to change that." }
  }
  return { ok: false, message: fallback }
}

function refresh() {
  revalidatePath("/home")
  revalidatePath("/money", "layout")
  revalidatePath("/life", "layout")
  revalidatePath("/notes")
  revalidatePath("/vault", "layout")
  revalidatePath("/reports")
  revalidatePath("/notifications")
  revalidatePath("/settings")
}

async function gate() {
  const ctx = await requireHousehold()
  if (!ctx) return { ok: false as const, message: "Create your household first.", ctx: null }
  return { ok: true as const, message: "", ctx }
}

async function remember(ctx: NonNullable<Awaited<ReturnType<typeof requireHousehold>>>, visibility: Visibility) {
  await ctx.supabase.from("user_preferences").update({ last_visibility: visibility }).eq("user_id", ctx.userId)
}

async function notifyShared(
  ctx: NonNullable<Awaited<ReturnType<typeof requireHousehold>>>,
  input: { kind: SharedPushKind; visibility: Visibility; entityId: string; label: string },
) {
  if (!shouldNotifySharedCreate(input.kind, input.visibility)) return
  await notifySharedCreate({
    householdId: ctx.householdId,
    actorId: ctx.userId,
    actorName: ctx.displayName,
    kind: input.kind,
    entityId: input.entityId,
    label: input.label,
  })
}

async function log(
  ctx: NonNullable<Awaited<ReturnType<typeof requireHousehold>>>,
  input: { visibility: Visibility; summary: string; entityType: string; entityId?: string },
) {
  await ctx.supabase.from("activity_events").insert({
    household_id: ctx.householdId,
    actor_id: ctx.userId,
    owner_id: ctx.userId,
    visibility: input.visibility,
    summary: input.summary.slice(0, 240),
    entity_type: input.entityType,
    entity_id: input.entityId ?? null,
  })
}

export async function createBill(formData: FormData): Promise<ActionResult> {
  const ready = await gate()
  if (!ready.ctx) return ready
  const name = textOf(formData.get("name"), 120)
  const amount = parseCents(formData.get("amount"))
  const due = parseDate(formData.get("due_on"))
  if (!name || amount == null || !due) return { ok: false, message: "Add a name, amount, and due date." }
  const visibility = visibilityOf(formData.get("visibility"), defaultVisibilityFor("bill", ready.ctx.lastVisibility))
  const { data, error } = await ready.ctx.supabase
    .from("bills")
    .insert({
      household_id: ready.ctx.householdId,
      owner_id: ready.ctx.userId,
      visibility,
      name,
      amount_cents: amount,
      due_on: due,
    })
    .select("id")
    .single()
  const failed = calm(error, "Couldn’t save that bill.")
  if (failed || !data) return failed ?? { ok: false, message: "Couldn’t save that bill." }
  await remember(ready.ctx, visibility)
  await log(ready.ctx, {
    visibility,
    entityType: "bill",
    entityId: data.id,
    summary: `${firstName(ready.ctx.displayName)} added ${name}`,
  })
  await notifyShared(ready.ctx, { kind: "bill", visibility, entityId: data.id, label: name })
  refresh()
  return { ok: true }
}

export async function markBillPaid(id: string, paid: boolean): Promise<ActionResult> {
  const ready = await gate()
  if (!ready.ctx) return ready
  const { data, error } = await ready.ctx.supabase
    .from("bills")
    .update({ paid_at: paid ? new Date().toISOString() : null })
    .eq("id", id)
    .select("name, visibility")
    .single()
  const failed = calm(error, "Couldn’t update that bill.")
  if (failed || !data) return failed ?? { ok: false, message: "Couldn’t update that bill." }
  if (paid) {
    await log(ready.ctx, {
      visibility: data.visibility,
      entityType: "bill",
      entityId: id,
      summary: `${firstName(ready.ctx.displayName)} paid ${data.name}`,
    })
  }
  refresh()
  return { ok: true }
}

export async function createTask(formData: FormData): Promise<ActionResult> {
  const ready = await gate()
  if (!ready.ctx) return ready
  const title = textOf(formData.get("title"), 160)
  const due = parseDate(formData.get("due_on"))
  if (!title) return { ok: false, message: "Add a task title." }
  const visibility = visibilityOf(formData.get("visibility"), defaultVisibilityFor("task", ready.ctx.lastVisibility))
  const { data, error } = await ready.ctx.supabase
    .from("tasks")
    .insert({
      household_id: ready.ctx.householdId,
      owner_id: ready.ctx.userId,
      visibility,
      title,
      due_on: due,
    })
    .select("id")
    .single()
  const failed = calm(error, "Couldn’t save that task.")
  if (failed || !data) return failed ?? { ok: false, message: "Couldn’t save that task." }
  await remember(ready.ctx, visibility)
  await log(ready.ctx, {
    visibility,
    entityType: "task",
    entityId: data.id,
    summary: `${firstName(ready.ctx.displayName)} added “${title}”`,
  })
  await notifyShared(ready.ctx, { kind: "task", visibility, entityId: data.id, label: title })
  refresh()
  return { ok: true }
}

export async function setTaskComplete(id: string, complete: boolean): Promise<ActionResult> {
  const ready = await gate()
  if (!ready.ctx) return ready
  const { data, error } = await ready.ctx.supabase
    .from("tasks")
    .update({ completed_at: complete ? new Date().toISOString() : null })
    .eq("id", id)
    .select("title, visibility")
    .single()
  const failed = calm(error, "Couldn’t update that task.")
  if (failed || !data) return failed ?? { ok: false, message: "Couldn’t update that task." }
  if (complete) {
    await log(ready.ctx, {
      visibility: data.visibility,
      entityType: "task",
      entityId: id,
      summary: `${firstName(ready.ctx.displayName)} completed ${data.title}`,
    })
  }
  refresh()
  return { ok: true }
}

export async function createEvent(formData: FormData): Promise<ActionResult> {
  const ready = await gate()
  if (!ready.ctx) return ready
  const title = textOf(formData.get("title"), 140)
  const date = parseDate(formData.get("date"))
  const time = String(formData.get("time") ?? "")
  const timeZone = String(formData.get("timeZone") ?? "UTC")
  const starts = date ? zonedDateTimeToIso(date, /^\d{2}:\d{2}$/.test(time) ? time : "09:00", timeZone) : null
  if (!title || !starts) return { ok: false, message: "Add a title and a date." }
  const visibility = visibilityOf(formData.get("visibility"), defaultVisibilityFor("event", ready.ctx.lastVisibility))
  const location = textOf(formData.get("location"), 160)
  const { data, error } = await ready.ctx.supabase
    .from("calendar_events")
    .insert({
      household_id: ready.ctx.householdId,
      owner_id: ready.ctx.userId,
      visibility,
      title,
      starts_at: starts,
      location,
    })
    .select("id")
    .single()
  const failed = calm(error, "Couldn’t save that event.")
  if (failed || !data) return failed ?? { ok: false, message: "Couldn’t save that event." }
  await remember(ready.ctx, visibility)
  await log(ready.ctx, {
    visibility,
    entityType: "event",
    entityId: data.id,
    summary: `${firstName(ready.ctx.displayName)} added ${title}`,
  })
  await notifyShared(ready.ctx, { kind: "event", visibility, entityId: data.id, label: title })
  refresh()
  return { ok: true }
}

export async function createMeal(formData: FormData): Promise<ActionResult> {
  const ready = await gate()
  if (!ready.ctx) return ready
  const title = textOf(formData.get("title"), 140)
  const mealOn = parseDate(formData.get("meal_on"))
  const slot = String(formData.get("slot") ?? "dinner")
  if (!title || !mealOn) return { ok: false, message: "Add a meal and a day." }
  if (!["breakfast", "lunch", "dinner", "snack"].includes(slot)) {
    return { ok: false, message: "Choose breakfast, lunch, dinner, or a snack." }
  }
  const visibility = visibilityOf(formData.get("visibility"), defaultVisibilityFor("meal", ready.ctx.lastVisibility))
  const notes = textOf(formData.get("notes"), 2000)
  const { data, error } = await ready.ctx.supabase
    .from("meals")
    .insert({
      household_id: ready.ctx.householdId,
      owner_id: ready.ctx.userId,
      visibility,
      title,
      meal_on: mealOn,
      slot,
      notes,
    })
    .select("id")
    .single()
  const failed = calm(error, "Couldn’t save that meal.")
  if (failed || !data) return failed ?? { ok: false, message: "Couldn’t save that meal." }
  await remember(ready.ctx, visibility)
  await log(ready.ctx, {
    visibility,
    entityType: "meal",
    entityId: data.id,
    summary: `${firstName(ready.ctx.displayName)} planned ${title}`,
  })
  await notifyShared(ready.ctx, { kind: "meal", visibility, entityId: data.id, label: title })
  refresh()
  return { ok: true }
}

export async function createShoppingItem(formData: FormData): Promise<ActionResult> {
  const ready = await gate()
  if (!ready.ctx) return ready
  const name = textOf(formData.get("name"), 140)
  if (!name) return { ok: false, message: "Add an item." }
  const visibility = visibilityOf(formData.get("visibility"), defaultVisibilityFor("shopping", ready.ctx.lastVisibility))
  const { data, error } = await ready.ctx.supabase
    .from("shopping_items")
    .insert({
      household_id: ready.ctx.householdId,
      owner_id: ready.ctx.userId,
      visibility,
      name,
    })
    .select("id")
    .single()
  const failed = calm(error, "Couldn’t add that item.")
  if (failed || !data) return failed ?? { ok: false, message: "Couldn’t add that item." }
  await log(ready.ctx, {
    visibility,
    entityType: "shopping",
    entityId: data.id,
    summary: `${firstName(ready.ctx.displayName)} added ${name} to the shopping list`,
  })
  await notifyShared(ready.ctx, { kind: "shopping", visibility, entityId: data.id, label: name })
  refresh()
  return { ok: true }
}

export async function setShoppingChecked(id: string, checked: boolean): Promise<ActionResult> {
  const ready = await gate()
  if (!ready.ctx) return ready
  const { data, error } = await ready.ctx.supabase
    .from("shopping_items")
    .update({ checked_at: checked ? new Date().toISOString() : null })
    .eq("id", id)
    .select("name, visibility")
    .single()
  const failed = calm(error, "Couldn’t update that item.")
  if (failed || !data) return failed ?? { ok: false, message: "Couldn’t update that item." }
  if (checked) {
    await log(ready.ctx, {
      visibility: data.visibility,
      entityType: "shopping",
      entityId: id,
      summary: `${firstName(ready.ctx.displayName)} checked off ${data.name}`,
    })
  }
  refresh()
  return { ok: true }
}

export async function createGoal(formData: FormData): Promise<ActionResult> {
  const ready = await gate()
  if (!ready.ctx) return ready
  const name = textOf(formData.get("name"), 120)
  const target = parseCents(formData.get("target"))
  const current = parseCents(formData.get("current")) ?? 0
  if (!name || target == null || target <= 0) return { ok: false, message: "Add a name and a target amount." }
  const visibility = visibilityOf(formData.get("visibility"), defaultVisibilityFor("goal", ready.ctx.lastVisibility))
  const { data, error } = await ready.ctx.supabase
    .from("goals")
    .insert({
      household_id: ready.ctx.householdId,
      owner_id: ready.ctx.userId,
      visibility,
      name,
      target_cents: target,
      current_cents: current,
    })
    .select("id")
    .single()
  const failed = calm(error, "Couldn’t save that goal.")
  if (failed || !data) return failed ?? { ok: false, message: "Couldn’t save that goal." }
  await remember(ready.ctx, visibility)
  await log(ready.ctx, {
    visibility,
    entityType: "goal",
    entityId: data.id,
    summary: `${firstName(ready.ctx.displayName)} added the ${name} goal`,
  })
  refresh()
  return { ok: true }
}

export async function saveBudget(formData: FormData): Promise<ActionResult> {
  const ready = await gate()
  if (!ready.ctx) return ready
  const amount = parseCents(formData.get("amount"))
  if (amount == null) return { ok: false, message: "Enter a monthly budget." }
  const visibility = visibilityOf(formData.get("visibility"), defaultVisibilityFor("budget", ready.ctx.lastVisibility))
  const timeZone = String(formData.get("timeZone") ?? "UTC")
  const period = `${zonedDate(timeZone).slice(0, 8)}01`
  const existing = await ready.ctx.supabase
    .from("budgets")
    .select("id")
    .eq("household_id", ready.ctx.householdId)
    .eq("period_month", period)
    .eq("visibility", visibility)
    .limit(1)
    .maybeSingle()
  const write = existing.data
    ? ready.ctx.supabase.from("budgets").update({ amount_cents: amount }).eq("id", existing.data.id)
    : ready.ctx.supabase.from("budgets").insert({
        household_id: ready.ctx.householdId,
        owner_id: ready.ctx.userId,
        visibility,
        period_month: period,
        amount_cents: amount,
      })
  const { error } = await write
  const failed = calm(error, "Couldn’t save the budget.")
  if (failed) return failed
  await log(ready.ctx, {
    visibility,
    entityType: "budget",
    summary: `${firstName(ready.ctx.displayName)} set this month’s budget`,
  })
  refresh()
  return { ok: true }
}

export async function createExpense(formData: FormData): Promise<ActionResult> {
  const ready = await gate()
  if (!ready.ctx) return ready
  const name = textOf(formData.get("name"), 120)
  const amount = parseCents(formData.get("amount"))
  const spent = parseDate(formData.get("spent_on"))
  const kind = formData.get("kind") === "income" ? "income" : "expense"
  if (!name || amount == null || amount <= 0 || !spent) {
    return { ok: false, message: "Add a name, amount, and date." }
  }
  const visibility = visibilityOf(formData.get("visibility"), defaultVisibilityFor("expense", ready.ctx.lastVisibility))
  const { data, error } = await ready.ctx.supabase
    .from("expenses")
    .insert({
      household_id: ready.ctx.householdId,
      owner_id: ready.ctx.userId,
      visibility,
      name,
      amount_cents: amount,
      kind,
      spent_on: spent,
    })
    .select("id")
    .single()
  const failed = calm(error, "Couldn’t save that.")
  if (failed || !data) return failed ?? { ok: false, message: "Couldn’t save that." }
  await remember(ready.ctx, visibility)
  await log(ready.ctx, {
    visibility,
    entityType: "expense",
    entityId: data.id,
    summary: `${firstName(ready.ctx.displayName)} logged ${name}`,
  })
  refresh()
  return { ok: true }
}

export async function createNote(formData: FormData): Promise<ActionResult> {
  const ready = await gate()
  if (!ready.ctx) return ready
  const title = textOf(formData.get("title"), 160)
  const body = String(formData.get("body") ?? "").slice(0, 20000)
  if (!title) return { ok: false, message: "Add a title." }
  const visibility = visibilityOf(formData.get("visibility"), defaultVisibilityFor("note", ready.ctx.lastVisibility))
  const { data, error } = await ready.ctx.supabase
    .from("notes")
    .insert({
      household_id: ready.ctx.householdId,
      owner_id: ready.ctx.userId,
      visibility,
      title,
      body,
    })
    .select("id")
    .single()
  const failed = calm(error, "Couldn’t save that note.")
  if (failed || !data) return failed ?? { ok: false, message: "Couldn’t save that note." }
  await remember(ready.ctx, visibility)
  await log(ready.ctx, {
    visibility,
    entityType: "note",
    entityId: data.id,
    summary: `${firstName(ready.ctx.displayName)} wrote “${title}”`,
  })
  refresh()
  return { ok: true }
}

export async function updateNote(id: string, formData: FormData): Promise<ActionResult> {
  const ready = await gate()
  if (!ready.ctx) return ready
  const title = textOf(formData.get("title"), 160)
  const body = String(formData.get("body") ?? "").slice(0, 20000)
  if (!title) return { ok: false, message: "Add a title." }
  const { error } = await ready.ctx.supabase.from("notes").update({ title, body }).eq("id", id)
  const failed = calm(error, "Couldn’t save that note.")
  if (failed) return failed
  refresh()
  return { ok: true }
}

export async function createSubscription(formData: FormData): Promise<ActionResult> {
  const ready = await gate()
  if (!ready.ctx) return ready
  const name = textOf(formData.get("name"), 120)
  const amount = parseCents(formData.get("amount"))
  const renews = parseDate(formData.get("renews_on"))
  if (!name || amount == null || !renews) return { ok: false, message: "Add a name, amount, and renewal date." }
  const visibility = visibilityOf(formData.get("visibility"), defaultVisibilityFor("subscription", ready.ctx.lastVisibility))
  const { data, error } = await ready.ctx.supabase
    .from("subscriptions")
    .insert({
      household_id: ready.ctx.householdId,
      owner_id: ready.ctx.userId,
      visibility,
      name,
      amount_cents: amount,
      renews_on: renews,
    })
    .select("id")
    .single()
  const failed = calm(error, "Couldn’t save that subscription.")
  if (failed || !data) return failed ?? { ok: false, message: "Couldn’t save that subscription." }
  await remember(ready.ctx, visibility)
  await log(ready.ctx, {
    visibility,
    entityType: "subscription",
    entityId: data.id,
    summary: `${firstName(ready.ctx.displayName)} added ${name}`,
  })
  refresh()
  return { ok: true }
}

export async function updateBill(id: string, formData: FormData): Promise<ActionResult> {
  const ready = await gate()
  if (!ready.ctx) return ready
  const name = textOf(formData.get("name"), 120)
  const amount = parseCents(formData.get("amount"))
  const due = parseDate(formData.get("due_on"))
  if (!name || amount == null || !due) return { ok: false, message: "Add a name, amount, and due date." }
  const visibility = visibilityOf(formData.get("visibility"), "shared")
  const { error } = await ready.ctx.supabase
    .from("bills")
    .update({ name, amount_cents: amount, due_on: due, visibility })
    .eq("id", id)
  const failed = calm(error, "Couldn’t save that bill.")
  if (failed) return failed
  await remember(ready.ctx, visibility)
  refresh()
  return { ok: true }
}

export async function deleteBill(id: string) {
  return removeRecord("bills", id, "Couldn’t remove that bill.")
}

export async function setBillVisibility(id: string, visibility: Visibility) {
  return setRecordVisibility("bills", id, visibility, "Couldn’t update that bill.")
}

export async function updateExpense(id: string, formData: FormData): Promise<ActionResult> {
  const ready = await gate()
  if (!ready.ctx) return ready
  const name = textOf(formData.get("name"), 120)
  const amount = parseCents(formData.get("amount"))
  const spent = parseDate(formData.get("spent_on"))
  if (!name || amount == null || amount <= 0 || !spent) return { ok: false, message: "Add a name, amount, and date." }
  const visibility = visibilityOf(formData.get("visibility"), "shared")
  const { error } = await ready.ctx.supabase
    .from("expenses")
    .update({ name, amount_cents: amount, spent_on: spent, visibility })
    .eq("id", id)
  const failed = calm(error, "Couldn’t save that.")
  if (failed) return failed
  await remember(ready.ctx, visibility)
  refresh()
  return { ok: true }
}

export async function deleteExpense(id: string) {
  return removeRecord("expenses", id, "Couldn’t remove that.")
}

export async function setExpenseVisibility(id: string, visibility: Visibility) {
  return setRecordVisibility("expenses", id, visibility, "Couldn’t update that.")
}

export async function updateGoal(id: string, formData: FormData): Promise<ActionResult> {
  const ready = await gate()
  if (!ready.ctx) return ready
  const name = textOf(formData.get("name"), 120)
  const target = parseCents(formData.get("target"))
  const current = parseCents(formData.get("current")) ?? 0
  if (!name || target == null || target <= 0) return { ok: false, message: "Add a name and a target amount." }
  const visibility = visibilityOf(formData.get("visibility"), "shared")
  const { error } = await ready.ctx.supabase
    .from("goals")
    .update({ name, target_cents: target, current_cents: current, visibility })
    .eq("id", id)
  const failed = calm(error, "Couldn’t save that goal.")
  if (failed) return failed
  await remember(ready.ctx, visibility)
  refresh()
  return { ok: true }
}

export async function deleteGoal(id: string) {
  return removeRecord("goals", id, "Couldn’t remove that goal.")
}

export async function setGoalVisibility(id: string, visibility: Visibility) {
  return setRecordVisibility("goals", id, visibility, "Couldn’t update that goal.")
}

export async function updateSubscription(id: string, formData: FormData): Promise<ActionResult> {
  const ready = await gate()
  if (!ready.ctx) return ready
  const name = textOf(formData.get("name"), 120)
  const amount = parseCents(formData.get("amount"))
  const renews = parseDate(formData.get("renews_on"))
  if (!name || amount == null || !renews) return { ok: false, message: "Add a name, amount, and renewal date." }
  const visibility = visibilityOf(formData.get("visibility"), "shared")
  const { error } = await ready.ctx.supabase
    .from("subscriptions")
    .update({ name, amount_cents: amount, renews_on: renews, visibility })
    .eq("id", id)
  const failed = calm(error, "Couldn’t save that subscription.")
  if (failed) return failed
  await remember(ready.ctx, visibility)
  refresh()
  return { ok: true }
}

export async function deleteSubscription(id: string) {
  return removeRecord("subscriptions", id, "Couldn’t remove that subscription.")
}

export async function setSubscriptionVisibility(id: string, visibility: Visibility) {
  return setRecordVisibility("subscriptions", id, visibility, "Couldn’t update that subscription.")
}

export async function setSubscriptionActive(id: string, active: boolean): Promise<ActionResult> {
  const ready = await gate()
  if (!ready.ctx) return ready
  const { error } = await ready.ctx.supabase.from("subscriptions").update({ active }).eq("id", id)
  const failed = calm(error, "Couldn’t update that subscription.")
  if (failed) return failed
  refresh()
  return { ok: true }
}

async function removeRecord(
  table: "bills" | "expenses" | "goals" | "subscriptions",
  id: string,
  fallback: string,
): Promise<ActionResult> {
  const ready = await gate()
  if (!ready.ctx) return ready
  const { error } = await ready.ctx.supabase.from(table).delete().eq("id", id)
  const failed = calm(error, fallback)
  if (failed) return failed
  refresh()
  return { ok: true }
}

async function setRecordVisibility(
  table: "bills" | "expenses" | "goals" | "subscriptions",
  id: string,
  visibility: Visibility,
  fallback: string,
): Promise<ActionResult> {
  const ready = await gate()
  if (!ready.ctx) return ready
  const { error } = await ready.ctx.supabase.from(table).update({ visibility }).eq("id", id)
  const failed = calm(error, fallback)
  if (failed) return failed
  await remember(ready.ctx, visibility)
  refresh()
  return { ok: true }
}

export async function uploadDocument(formData: FormData): Promise<ActionResult> {
  const ready = await gate()
  if (!ready.ctx) return ready
  const file = formData.get("file")
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Choose a file to upload." }
  if (file.size > 26_214_400) return { ok: false, message: "Choose a file under 25 MB." }
  const visibility = visibilityOf(formData.get("visibility"), defaultVisibilityFor("upload", ready.ctx.lastVisibility))
  const id = crypto.randomUUID()
  const safeName = file.name.replace(/[^\w.\- ]+/g, "").trim().slice(0, 160) || "document"
  const path = `${ready.ctx.householdId}/${visibility}/${ready.ctx.userId}/${id}/${safeName}`
  const bytes = new Uint8Array(await file.arrayBuffer())
  const uploaded = await ready.ctx.supabase.storage.from("vault").upload(path, bytes, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  })
  if (uploaded.error) return { ok: false, message: "Couldn’t upload that file." }
  const { error } = await ready.ctx.supabase.from("vault_documents").insert({
    id,
    household_id: ready.ctx.householdId,
    owner_id: ready.ctx.userId,
    visibility,
    name: safeName,
    mime_type: file.type || null,
    size_bytes: file.size,
    storage_path: path,
  })
  const failed = calm(error, "Couldn’t save that document.")
  if (failed) {
    await ready.ctx.supabase.storage.from("vault").remove([path])
    return failed
  }
  await remember(ready.ctx, visibility)
  await log(ready.ctx, {
    visibility,
    entityType: "vault",
    entityId: id,
    summary: `${firstName(ready.ctx.displayName)} uploaded ${safeName}`,
  })
  refresh()
  return { ok: true }
}

export async function documentUrl(path: string) {
  const ready = await gate()
  if (!ready.ctx) return null
  const { data, error } = await ready.ctx.supabase.storage.from("vault").createSignedUrl(path, 60)
  if (error || !data?.signedUrl) return null
  return data.signedUrl
}

export async function dismissChecklist(): Promise<ActionResult> {
  const ready = await gate()
  if (!ready.ctx) return ready
  const { data } = await ready.ctx.supabase
    .from("user_preferences")
    .select("notification_prefs")
    .eq("user_id", ready.ctx.userId)
    .maybeSingle()
  const next = { ...((data?.notification_prefs ?? {}) as object), home_checklist_dismissed: true }
  const { error } = await ready.ctx.supabase
    .from("user_preferences")
    .update({ notification_prefs: next })
    .eq("user_id", ready.ctx.userId)
  if (error) return { ok: false, message: "Couldn’t dismiss that yet." }
  refresh()
  return { ok: true }
}

export async function updateDisplayName(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) return { ok: false, message: "Sign in to continue." }
  const name = textOf(formData.get("display_name"), 80)
  if (!name) return { ok: false, message: "Add the name your household should see." }
  const { error } = await supabase.from("profiles").update({ display_name: name }).eq("id", data.user.id)
  if (error) return { ok: false, message: "Couldn’t save your name." }
  refresh()
  return { ok: true }
}

export async function updateCurrency(formData: FormData): Promise<ActionResult> {
  const ready = await gate()
  if (!ready.ctx) return ready
  const currency = String(formData.get("currency") ?? "USD").trim().toUpperCase()
  if (!/^[A-Z]{3}$/.test(currency)) return { ok: false, message: "Use a 3-letter currency code." }
  const { error } = await ready.ctx.supabase
    .from("user_preferences")
    .update({ currency })
    .eq("user_id", ready.ctx.userId)
  if (error) return { ok: false, message: "Couldn’t save that currency." }
  refresh()
  return { ok: true }
}

export type SearchHit = { href: string; label: string; group: string }

export async function searchRecords(query: string): Promise<SearchHit[]> {
  const ready = await gate()
  if (!ready.ctx) return []
  const needle = query.trim().slice(0, 80)
  if (needle.length < 2) return []
  const pattern = `%${needle.replace(/[%_]/g, "")}%`
  const { supabase, householdId } = ready.ctx
  const [bills, tasks, notes, meals, events] = await Promise.all([
    supabase.from("bills").select("id, name").eq("household_id", householdId).ilike("name", pattern).limit(5),
    supabase.from("tasks").select("id, title").eq("household_id", householdId).ilike("title", pattern).limit(5),
    supabase.from("notes").select("id, title").eq("household_id", householdId).ilike("title", pattern).limit(5),
    supabase.from("meals").select("id, title").eq("household_id", householdId).ilike("title", pattern).limit(5),
    supabase.from("calendar_events").select("id, title").eq("household_id", householdId).ilike("title", pattern).limit(5),
  ])
  return [
    ...(bills.data ?? []).map((row) => ({ href: "/money/bills", label: row.name, group: "Bills" })),
    ...(tasks.data ?? []).map((row) => ({ href: "/life/tasks", label: row.title, group: "Tasks" })),
    ...(notes.data ?? []).map((row) => ({ href: `/notes/${row.id}`, label: row.title, group: "Notes" })),
    ...(meals.data ?? []).map((row) => ({ href: "/life/meals", label: row.title, group: "Meals" })),
    ...(events.data ?? []).map((row) => ({ href: "/life/calendar", label: row.title, group: "Calendar" })),
  ]
}

export async function recentActivity() {
  const ready = await gate()
  if (!ready.ctx) return []
  const { data } = await ready.ctx.supabase
    .from("activity_events")
    .select("id, summary, created_at, visibility")
    .eq("household_id", ready.ctx.householdId)
    .order("created_at", { ascending: false })
    .limit(6)
  return data ?? []
}
