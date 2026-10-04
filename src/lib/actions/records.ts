"use server"

import { revalidatePath } from "next/cache"

import { requireHousehold } from "@/lib/data/context"
import { firstName, parseCents, parseDate, zonedDate, zonedDateTimeToIso } from "@/lib/home/metrics"
import { notifySharedCreate } from "@/lib/push/send"
import { shouldNotifySharedCreate, type SharedPushKind } from "@/lib/push/shared"
import { categoryToStore } from "@/lib/money/category-match"
import {
  DEBT_COPY,
  cleanCategory,
  personDirection,
  remainingCents,
  subscriptionCadence,
  type PaymentParent,
} from "@/lib/money/board"
import { defaultVisibilityFor, type Visibility } from "@/lib/visibility"
import { createClient } from "@/lib/supabase/server"

export type ActionResult = { ok: true; id?: string; paidCents?: number; leftCents?: number } | { ok: false; message: string }

function visibilityOf(value: FormDataEntryValue | null, fallback: Visibility): Visibility {
  return value === "private" || value === "shared" ? value : fallback
}

function textOf(value: FormDataEntryValue | null, max: number) {
  const text = String(value ?? "").trim()
  if (!text || text.length > max) return null
  return text
}

function columnMissing(error: { message: string } | null) {
  return Boolean(error && /column/i.test(error.message) && /does not exist/i.test(error.message))
}

function optionalLimit(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim()
  if (!raw) return { ok: true as const, cents: null as number | null }
  const cents = parseCents(raw)
  if (cents == null) return { ok: false as const, message: "Enter a limit, or leave it blank." }
  return { ok: true as const, cents }
}

function storeOf(formData: FormData) {
  const choice = String(formData.get("store") ?? "").trim()
  if (!choice) return null
  if (choice === "other") return textOf(formData.get("store_other"), 40)
  return textOf(choice, 40)
}

function needSoonOf(formData: FormData) {
  const value = formData.get("need_soon")
  return value === "on" || value === "1" || value === "true"
}

function eventSchedule(formData: FormData) {
  const timeZone = String(formData.get("timeZone") ?? "UTC")
  const date = parseDate(formData.get("date"))
  const endDate = parseDate(formData.get("end_date"))
  const allDay = formData.get("all_day") === "on" || formData.get("all_day") === "1"
  const time = String(formData.get("time") ?? "")
  const clock = allDay ? "00:00" : /^\d{2}:\d{2}$/.test(time) ? time : "09:00"
  if (date && endDate && endDate < date) return { starts: null, ends: null, invalidEnd: true }
  const starts = date ? zonedDateTimeToIso(date, clock, timeZone) : null
  const endDay = endDate ?? (allDay ? date : null)
  const ends = endDay ? zonedDateTimeToIso(endDay, allDay ? "23:59" : clock, timeZone) : null
  return { starts, ends: allDay || endDate ? ends : null, invalidEnd: false }
}

function categoryFor(
  section: "bills" | "income" | "savings" | "subscriptions" | "cards",
  name: string,
  formData: FormData,
) {
  return categoryToStore(section, name, formData.get("category"), formData.get("category_mode"))
}

function calm(error: { message: string } | null, fallback: string): ActionResult | null {
  if (!error) return null
  const message = error.message.toLowerCase()
  if (message.includes("duplicate") || message.includes("budgets_shared") || message.includes("budgets_private")) {
    return { ok: false, message: "That budget is already set for this month." }
  }
  if (message.includes("only the person who added this")) {
    return { ok: false, message: "Only the person who added this can change who sees it." }
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
  const row = {
    household_id: ready.ctx.householdId,
    owner_id: ready.ctx.userId,
    visibility,
    name,
    amount_cents: amount,
    due_on: due,
  }
  let result = await ready.ctx.supabase.from("bills").insert({ ...row, category: categoryFor("bills", name, formData) }).select("id").single()
  if (columnMissing(result.error)) result = await ready.ctx.supabase.from("bills").insert(row).select("id").single()
  const { data, error } = result
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

export async function updateTask(id: string, formData: FormData): Promise<ActionResult> {
  const ready = await gate()
  if (!ready.ctx) return ready
  const title = textOf(formData.get("title"), 160)
  if (!title) return { ok: false, message: "Add a task title." }
  const visibility = visibilityOf(formData.get("visibility"), "shared")
  const { error } = await ready.ctx.supabase
    .from("tasks")
    .update({ title, due_on: parseDate(formData.get("due_on")), visibility })
    .eq("id", id)
  const failed = calm(error, "Couldn’t save that task.")
  if (failed) return failed
  await remember(ready.ctx, visibility)
  refresh()
  return { ok: true }
}

export async function deleteTask(id: string) {
  return removeRecord("tasks", id, "Couldn’t remove that task.")
}

export async function setTaskVisibility(id: string, visibility: Visibility) {
  return setRecordVisibility("tasks", id, visibility, "Couldn’t update that task.")
}

export async function createEvent(formData: FormData): Promise<ActionResult> {
  const ready = await gate()
  if (!ready.ctx) return ready
  const title = textOf(formData.get("title"), 140)
  const schedule = eventSchedule(formData)
  if (schedule.invalidEnd) return { ok: false, message: "End date needs to follow the start." }
  if (!title || !schedule.starts) return { ok: false, message: "Add a title and a date." }
  const visibility = visibilityOf(formData.get("visibility"), defaultVisibilityFor("event", ready.ctx.lastVisibility))
  const location = textOf(formData.get("location"), 160)
  const { data, error } = await ready.ctx.supabase
    .from("calendar_events")
    .insert({
      household_id: ready.ctx.householdId,
      owner_id: ready.ctx.userId,
      visibility,
      title,
      starts_at: schedule.starts,
      ends_at: schedule.ends,
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

export async function updateEvent(id: string, formData: FormData): Promise<ActionResult> {
  const ready = await gate()
  if (!ready.ctx) return ready
  const title = textOf(formData.get("title"), 140)
  const schedule = eventSchedule(formData)
  if (schedule.invalidEnd) return { ok: false, message: "End date needs to follow the start." }
  if (!title || !schedule.starts) return { ok: false, message: "Add a title and a date." }
  const visibility = visibilityOf(formData.get("visibility"), "shared")
  const location = textOf(formData.get("location"), 160)
  const { error } = await ready.ctx.supabase
    .from("calendar_events")
    .update({
      title,
      starts_at: schedule.starts,
      ends_at: schedule.ends,
      location,
      visibility,
    })
    .eq("id", id)
  const failed = calm(error, "Couldn’t save that event.")
  if (failed) return failed
  await remember(ready.ctx, visibility)
  refresh()
  return { ok: true }
}

export async function deleteEvent(id: string) {
  return removeRecord("calendar_events", id, "Couldn’t remove that event.")
}

export async function setEventVisibility(id: string, visibility: Visibility) {
  return setRecordVisibility("calendar_events", id, visibility, "Couldn’t update that event.")
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

export async function updateMeal(id: string, formData: FormData): Promise<ActionResult> {
  const ready = await gate()
  if (!ready.ctx) return ready
  const title = textOf(formData.get("title"), 140)
  const mealOn = parseDate(formData.get("meal_on"))
  const slot = String(formData.get("slot") ?? "dinner")
  if (!title || !mealOn) return { ok: false, message: "Add a meal and a day." }
  if (!["breakfast", "lunch", "dinner", "snack"].includes(slot)) {
    return { ok: false, message: "Choose breakfast, lunch, dinner, or a snack." }
  }
  const visibility = visibilityOf(formData.get("visibility"), "shared")
  const { error } = await ready.ctx.supabase
    .from("meals")
    .update({ title, meal_on: mealOn, slot, notes: textOf(formData.get("notes"), 2000), visibility })
    .eq("id", id)
  const failed = calm(error, "Couldn’t save that meal.")
  if (failed) return failed
  await remember(ready.ctx, visibility)
  refresh()
  return { ok: true }
}

export async function deleteMeal(id: string) {
  return removeRecord("meals", id, "Couldn’t remove that meal.")
}

export async function setMealVisibility(id: string, visibility: Visibility) {
  return setRecordVisibility("meals", id, visibility, "Couldn’t update that meal.")
}

export async function createShoppingItem(formData: FormData): Promise<ActionResult> {
  const ready = await gate()
  if (!ready.ctx) return ready
  const name = textOf(formData.get("name"), 140)
  if (!name) return { ok: false, message: "Add an item." }
  const visibility = visibilityOf(formData.get("visibility"), defaultVisibilityFor("shopping", ready.ctx.lastVisibility))
  const extras = { store: storeOf(formData), need_soon: needSoonOf(formData) }
  let result = await ready.ctx.supabase
    .from("shopping_items")
    .insert({
      household_id: ready.ctx.householdId,
      owner_id: ready.ctx.userId,
      visibility,
      name,
      ...extras,
    })
    .select("id")
    .single()
  if (columnMissing(result.error)) {
    result = await ready.ctx.supabase
      .from("shopping_items")
      .insert({
        household_id: ready.ctx.householdId,
        owner_id: ready.ctx.userId,
        visibility,
        name,
      })
      .select("id")
      .single()
  }
  const { data, error } = result
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

export async function updateShoppingItem(id: string, formData: FormData): Promise<ActionResult> {
  const ready = await gate()
  if (!ready.ctx) return ready
  const name = textOf(formData.get("name"), 140)
  if (!name) return { ok: false, message: "Add an item." }
  const visibility = visibilityOf(formData.get("visibility"), "shared")
  const extras = { store: storeOf(formData), need_soon: needSoonOf(formData) }
  let { error } = await ready.ctx.supabase.from("shopping_items").update({ name, visibility, ...extras }).eq("id", id)
  if (columnMissing(error)) {
    const retry = await ready.ctx.supabase.from("shopping_items").update({ name, visibility }).eq("id", id)
    error = retry.error
  }
  const failed = calm(error, "Couldn’t save that item.")
  if (failed) return failed
  await remember(ready.ctx, visibility)
  refresh()
  return { ok: true }
}

export async function deleteShoppingItem(id: string) {
  return removeRecord("shopping_items", id, "Couldn’t remove that item.")
}

export async function setShoppingVisibility(id: string, visibility: Visibility) {
  return setRecordVisibility("shopping_items", id, visibility, "Couldn’t update that item.")
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
  const row = {
    household_id: ready.ctx.householdId,
    owner_id: ready.ctx.userId,
    visibility,
    name,
    target_cents: target,
    current_cents: current,
  }
  let result = await ready.ctx.supabase.from("goals").insert({ ...row, category: categoryFor("savings", name, formData) }).select("id").single()
  if (columnMissing(result.error)) result = await ready.ctx.supabase.from("goals").insert(row).select("id").single()
  const { data, error } = result
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
  const row = {
    household_id: ready.ctx.householdId,
    owner_id: ready.ctx.userId,
    visibility,
    name,
    amount_cents: amount,
    kind,
    spent_on: spent,
  }
  const category = kind === "income" ? categoryFor("income", name, formData) : null
  let result = await ready.ctx.supabase.from("expenses").insert({ ...row, category }).select("id").single()
  if (columnMissing(result.error)) result = await ready.ctx.supabase.from("expenses").insert(row).select("id").single()
  const { data, error } = result
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
  const visibility = visibilityOf(formData.get("visibility"), defaultVisibilityFor("note"))
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
  revalidatePath(`/notes/${data.id}`)
  return { ok: true, id: data.id }
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
  revalidatePath(`/notes/${id}`)
  return { ok: true }
}

export async function deleteNote(id: string) {
  return removeRecord("notes", id, "Couldn’t remove that note.")
}

export async function setNoteVisibility(id: string, visibility: Visibility) {
  const result = await setRecordVisibility("notes", id, visibility, "Couldn’t update that note.")
  if (result.ok) revalidatePath(`/notes/${id}`)
  return result
}

export async function createSubscription(formData: FormData): Promise<ActionResult> {
  const ready = await gate()
  if (!ready.ctx) return ready
  const name = textOf(formData.get("name"), 120)
  const amount = parseCents(formData.get("amount"))
  const renews = parseDate(formData.get("renews_on"))
  if (!name || amount == null || !renews) return { ok: false, message: "Add a name, amount, and renewal date." }
  const visibility = visibilityOf(formData.get("visibility"), defaultVisibilityFor("subscription", ready.ctx.lastVisibility))
  const row = {
    household_id: ready.ctx.householdId,
    owner_id: ready.ctx.userId,
    visibility,
    name,
    amount_cents: amount,
    renews_on: renews,
  }
  let result = await ready.ctx.supabase
    .from("subscriptions")
    .insert({
      ...row,
      category: categoryFor("subscriptions", name, formData),
      cadence: subscriptionCadence(formData.get("cadence")),
    })
    .select("id")
    .single()
  if (columnMissing(result.error)) result = await ready.ctx.supabase.from("subscriptions").insert(row).select("id").single()
  const { data, error } = result
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
  const row = { name, amount_cents: amount, due_on: due, visibility }
  let { error } = await ready.ctx.supabase
    .from("bills")
    .update({ ...row, category: categoryFor("bills", name, formData) })
    .eq("id", id)
  if (columnMissing(error)) {
    const retry = await ready.ctx.supabase.from("bills").update(row).eq("id", id)
    error = retry.error
  }
  const failed = calm(error, "Couldn’t save that bill.")
  if (failed) return failed
  await syncBillPaid(ready.ctx, id, amount, false)
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
  const row = { name, amount_cents: amount, spent_on: spent, visibility }
  const withCategory = formData.get("kind") === "income" || formData.has("category")
  const category =
    formData.get("kind") === "income" ? categoryFor("income", name, formData) : cleanCategory(formData.get("category"))
  let { error } = await ready.ctx.supabase
    .from("expenses")
    .update(withCategory ? { ...row, category } : row)
    .eq("id", id)
  if (columnMissing(error)) {
    const retry = await ready.ctx.supabase.from("expenses").update(row).eq("id", id)
    error = retry.error
  }
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
  const row = { name, target_cents: target, current_cents: current, visibility }
  let { error } = await ready.ctx.supabase
    .from("goals")
    .update({ ...row, category: categoryFor("savings", name, formData) })
    .eq("id", id)
  if (columnMissing(error)) {
    const retry = await ready.ctx.supabase.from("goals").update(row).eq("id", id)
    error = retry.error
  }
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
  const row = { name, amount_cents: amount, renews_on: renews, visibility }
  let { error } = await ready.ctx.supabase
    .from("subscriptions")
    .update({
      ...row,
      category: categoryFor("subscriptions", name, formData),
      cadence: subscriptionCadence(formData.get("cadence")),
    })
    .eq("id", id)
  if (columnMissing(error)) {
    const retry = await ready.ctx.supabase.from("subscriptions").update(row).eq("id", id)
    error = retry.error
  }
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

const PARENT_TABLE = {
  bill: "bills",
  card: "money_cards",
  person: "money_people",
} as const

const PARENT_COLUMN = {
  bill: "bill_id",
  card: "card_id",
  person: "person_id",
} as const

function parentKindOf(value: FormDataEntryValue | null): PaymentParent | null {
  return value === "bill" || value === "card" || value === "person" ? value : null
}

function recordId(value: FormDataEntryValue | null) {
  const id = String(value ?? "")
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) ? id : null
}

async function syncBillPaid(
  ctx: NonNullable<Awaited<ReturnType<typeof requireHousehold>>>,
  billId: string,
  amountCents: number,
  clearWhenOpen: boolean,
) {
  const payments = await ctx.supabase.from("money_payments").select("amount_cents").eq("bill_id", billId)
  if (payments.error) return
  const rows = payments.data ?? []
  if (rows.length === 0 && !clearWhenOpen) return
  const left = remainingCents(amountCents, rows)
  await ctx.supabase
    .from("bills")
    .update({ paid_at: left === 0 ? new Date().toISOString() : null })
    .eq("id", billId)
}

export async function createMoneyCard(formData: FormData): Promise<ActionResult> {
  const ready = await gate()
  if (!ready.ctx) return ready
  const name = textOf(formData.get("name"), 120)
  const amount = parseCents(formData.get("amount"))
  if (!name || amount == null) return { ok: false, message: "Add a name and a balance." }
  const limit = optionalLimit(formData.get("limit"))
  if (!limit.ok) return limit
  const visibility = visibilityOf(formData.get("visibility"), defaultVisibilityFor("card"))
  const row = {
    household_id: ready.ctx.householdId,
    owner_id: ready.ctx.userId,
    visibility,
    name,
    amount_cents: amount,
    due_on: parseDate(formData.get("due_on")),
    note: textOf(formData.get("note"), 280),
  }
  let { error } = await ready.ctx.supabase.from("money_cards").insert({
    ...row,
    category: categoryFor("cards", name, formData),
    limit_cents: limit.cents,
  })
  if (columnMissing(error)) {
    const retry = await ready.ctx.supabase.from("money_cards").insert(row)
    error = retry.error
  }
  const failed = calm(error, "Couldn’t save that card.")
  if (failed) return failed
  await remember(ready.ctx, visibility)
  refresh()
  return { ok: true }
}

export async function updateMoneyCard(id: string, formData: FormData): Promise<ActionResult> {
  const ready = await gate()
  if (!ready.ctx) return ready
  const name = textOf(formData.get("name"), 120)
  const amount = parseCents(formData.get("amount"))
  if (!name || amount == null) return { ok: false, message: "Add a name and a balance." }
  const limit = optionalLimit(formData.get("limit"))
  if (!limit.ok) return limit
  const visibility = visibilityOf(formData.get("visibility"), "private")
  const row = {
    name,
    amount_cents: amount,
    due_on: parseDate(formData.get("due_on")),
    note: textOf(formData.get("note"), 280),
    visibility,
  }
  let { error } = await ready.ctx.supabase
    .from("money_cards")
    .update({ ...row, category: categoryFor("cards", name, formData), limit_cents: limit.cents })
    .eq("id", id)
  if (columnMissing(error)) {
    const retry = await ready.ctx.supabase.from("money_cards").update(row).eq("id", id)
    error = retry.error
  }
  const failed = calm(error, "Couldn’t save that card.")
  if (failed) return failed
  await remember(ready.ctx, visibility)
  refresh()
  return { ok: true }
}

export async function deleteMoneyCard(id: string) {
  return removeRecord("money_cards", id, "Couldn’t remove that card.")
}

export async function setMoneyCardVisibility(id: string, visibility: Visibility) {
  return setRecordVisibility("money_cards", id, visibility, "Couldn’t update that card.")
}

export async function createMoneyPerson(formData: FormData): Promise<ActionResult> {
  const ready = await gate()
  if (!ready.ctx) return ready
  const name = textOf(formData.get("name"), 120)
  const amount = parseCents(formData.get("amount"))
  if (!name || amount == null) return { ok: false, message: "Add a name and an amount." }
  const visibility = visibilityOf(formData.get("visibility"), defaultVisibilityFor("person"))
  const row = {
    household_id: ready.ctx.householdId,
    owner_id: ready.ctx.userId,
    visibility,
    name,
    amount_cents: amount,
    due_on: parseDate(formData.get("due_on")),
    note: textOf(formData.get("note"), 280),
  }
  let { error } = await ready.ctx.supabase.from("money_people").insert({
    ...row,
    direction: personDirection(formData.get("direction")),
  })
  if (columnMissing(error)) {
    const retry = await ready.ctx.supabase.from("money_people").insert(row)
    error = retry.error
  }
  const failed = calm(error, "Couldn’t save that.")
  if (failed) return failed
  await remember(ready.ctx, visibility)
  refresh()
  return { ok: true }
}

export async function updateMoneyPerson(id: string, formData: FormData): Promise<ActionResult> {
  const ready = await gate()
  if (!ready.ctx) return ready
  const name = textOf(formData.get("name"), 120)
  const amount = parseCents(formData.get("amount"))
  if (!name || amount == null) return { ok: false, message: "Add a name and an amount." }
  const visibility = visibilityOf(formData.get("visibility"), "private")
  const row = {
    name,
    amount_cents: amount,
    due_on: parseDate(formData.get("due_on")),
    note: textOf(formData.get("note"), 280),
    visibility,
  }
  let { error } = await ready.ctx.supabase
    .from("money_people")
    .update({ ...row, direction: personDirection(formData.get("direction")) })
    .eq("id", id)
  if (columnMissing(error)) {
    const retry = await ready.ctx.supabase.from("money_people").update(row).eq("id", id)
    error = retry.error
  }
  const failed = calm(error, "Couldn’t save that.")
  if (failed) return failed
  await remember(ready.ctx, visibility)
  refresh()
  return { ok: true }
}

export async function deleteMoneyPerson(id: string) {
  return removeRecord("money_people", id, "Couldn’t remove that person.")
}

export async function setMoneyPersonVisibility(id: string, visibility: Visibility) {
  return setRecordVisibility("money_people", id, visibility, "Couldn’t update that person.")
}

export async function logMoneyPayment(formData: FormData): Promise<ActionResult> {
  const ready = await gate()
  if (!ready.ctx) return ready
  const kind = parentKindOf(formData.get("parent_kind"))
  const parentId = recordId(formData.get("parent_id"))
  const amount = parseCents(formData.get("amount"))
  const paidOn = parseDate(formData.get("paid_on"))
  if (!kind || !parentId) return { ok: false, message: "Couldn’t find that record." }
  if (amount == null || amount <= 0 || !paidOn) return { ok: false, message: "Add an amount and a date." }
  const table = PARENT_TABLE[kind]
  const { data: parent, error: parentError } = await ready.ctx.supabase
    .from(table)
    .select("id, amount_cents, visibility, name")
    .eq("id", parentId)
    .maybeSingle()
  if (parentError || !parent) return { ok: false, message: "You don’t have access to change that." }
  const column = PARENT_COLUMN[kind]
  const existing = await ready.ctx.supabase.from("money_payments").select("amount_cents").eq(column, parentId)
  if (existing.error) return calm(existing.error, "Couldn’t save that payment.") ?? { ok: false, message: "Couldn’t save that payment." }
  const left = remainingCents(parent.amount_cents, existing.data ?? [])
  if (amount > left) return { ok: false, message: DEBT_COPY.overpay }
  const { error } = await ready.ctx.supabase.from("money_payments").insert({
    household_id: ready.ctx.householdId,
    owner_id: ready.ctx.userId,
    [column]: parentId,
    amount_cents: amount,
    paid_on: paidOn,
    note: textOf(formData.get("note"), 280),
  })
  const failed = calm(error, "Couldn’t save that payment.")
  if (failed) return failed
  const nextLeft = left - amount
  if (kind === "bill") await syncBillPaid(ready.ctx, parentId, parent.amount_cents, true)
  if (kind === "bill" && nextLeft === 0 && parent.visibility === "shared") {
    await log(ready.ctx, {
      visibility: "shared",
      entityType: "bill",
      entityId: parentId,
      summary: `${firstName(ready.ctx.displayName)} paid ${parent.name}`,
    })
  }
  refresh()
  return { ok: true, paidCents: amount, leftCents: nextLeft }
}

export async function removeMoneyPayment(id: string): Promise<ActionResult> {
  const ready = await gate()
  if (!ready.ctx) return ready
  const { data: payment, error: readError } = await ready.ctx.supabase
    .from("money_payments")
    .select("id, bill_id")
    .eq("id", id)
    .maybeSingle()
  if (readError || !payment) return { ok: false, message: "Couldn’t remove that payment." }
  const { error } = await ready.ctx.supabase.from("money_payments").delete().eq("id", id)
  const failed = calm(error, "Couldn’t remove that payment.")
  if (failed) return failed
  if (payment.bill_id) {
    const bill = await ready.ctx.supabase.from("bills").select("amount_cents").eq("id", payment.bill_id).maybeSingle()
    if (bill.data) await syncBillPaid(ready.ctx, payment.bill_id, bill.data.amount_cents, true)
  }
  refresh()
  return { ok: true }
}

async function removeRecord(
  table: "bills" | "expenses" | "goals" | "subscriptions" | "tasks" | "calendar_events" | "meals" | "shopping_items" | "notes" | "money_cards" | "money_people",
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
  table: "bills" | "expenses" | "goals" | "subscriptions" | "tasks" | "calendar_events" | "meals" | "shopping_items" | "notes" | "money_cards" | "money_people",
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
  const [bills, cards, people, tasks, notes, meals, events] = await Promise.all([
    supabase.from("bills").select("id, name").eq("household_id", householdId).ilike("name", pattern).limit(5),
    supabase.from("money_cards").select("id, name").eq("household_id", householdId).ilike("name", pattern).limit(5),
    supabase.from("money_people").select("id, name").eq("household_id", householdId).ilike("name", pattern).limit(5),
    supabase.from("tasks").select("id, title").eq("household_id", householdId).ilike("title", pattern).limit(5),
    supabase.from("notes").select("id, title").eq("household_id", householdId).ilike("title", pattern).limit(5),
    supabase.from("meals").select("id, title").eq("household_id", householdId).ilike("title", pattern).limit(5),
    supabase.from("calendar_events").select("id, title").eq("household_id", householdId).ilike("title", pattern).limit(5),
  ])
  return [
    ...(bills.data ?? []).map((row) => ({ href: "/money/bills", label: row.name, group: "Bills" })),
    ...(cards.data ?? []).map((row) => ({ href: "/money/cards", label: row.name, group: "Cards" })),
    ...(people.data ?? []).map((row) => ({ href: "/money/people", label: row.name, group: "People" })),
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
