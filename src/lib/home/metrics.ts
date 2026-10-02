import type { Visibility } from "@/lib/visibility"

export function firstName(displayName: string) {
  return displayName.trim().split(/\s+/)[0] || "there"
}

export function zonedDate(timeZone: string, now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now)
}

export function greetingFor(timeZone: string, name: string, now = new Date()) {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hourCycle: "h23" }).format(now),
  )
  const hello = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"
  return `${hello}, ${firstName(name)}`
}

export function headerDate(timeZone: string, now = new Date()) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(now)
}

export function longDate(timeZone: string, now = new Date()) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(now)
}

export function addDays(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number)
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10)
}

export function monthStart(date: string) {
  return `${date.slice(0, 8)}01`
}

export function nextMonthStart(date: string) {
  const [year, month] = date.split("-").map(Number)
  return new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10)
}

export function weekBounds(today: string) {
  const [year, month, day] = today.split("-").map(Number)
  const utc = new Date(Date.UTC(year, month - 1, day))
  const weekday = utc.getUTCDay()
  const start = addDays(today, weekday === 0 ? -6 : 1 - weekday)
  return { start, end: addDays(start, 6) }
}

type ZonedParts = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

export function zonedParts(date: Date, timeZone: string): ZonedParts {
  const map: Record<string, string> = {}
  for (const part of new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date)) {
    if (part.type !== "literal") map[part.type] = part.value
  }
  const hour = Number(map.hour)
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: hour === 24 ? 0 : hour,
    minute: Number(map.minute),
    second: Number(map.second),
  }
}

export function zonedDateTimeToIso(date: string, time: string, timeZone: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null
  const [year, month, day] = date.split("-").map(Number)
  const [hour, minute] = time.split(":").map(Number)
  if (hour > 23 || minute > 59) return null
  let utc = Date.UTC(year, month - 1, day, hour, minute, 0)
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = zonedParts(new Date(utc), timeZone)
    const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
    const target = Date.UTC(year, month - 1, day, hour, minute, 0)
    const diff = asUtc - target
    if (diff === 0) break
    utc -= diff
  }
  return new Date(utc).toISOString()
}

export function startOfZonedDay(date: string, timeZone: string) {
  return zonedDateTimeToIso(date, "00:00", timeZone)
}

export function formatMoney(cents: number, currency = "USD") {
  const hasCents = cents % 100 !== 0
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: hasCents ? 2 : 0,
  }).format(cents / 100)
}

export function formatShortDate(date: string) {
  const [year, month, day] = date.split("-").map(Number)
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)))
}

export function formatTime(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso))
}

export function relativeTime(iso: string, now = Date.now()) {
  const minutes = Math.round((now - new Date(iso).getTime()) / 60000)
  if (minutes < 1) return "Just now"
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(iso))
}

export type BillStatus = "paid" | "overdue" | "due_soon" | "on_time"

export function billStatus(bill: { paid_at: string | null; due_on: string }, today: string): BillStatus {
  if (bill.paid_at) return "paid"
  if (bill.due_on < today) return "overdue"
  if (bill.due_on <= addDays(today, 3)) return "due_soon"
  return "on_time"
}

export function billStatusLabel(status: BillStatus) {
  if (status === "paid") return "Paid"
  if (status === "overdue") return "Overdue"
  if (status === "due_soon") return "Due soon"
  return "On time"
}

export function billsDueThisWeek<T extends { due_on: string; paid_at: string | null }>(bills: T[], today: string) {
  const end = addDays(today, 6)
  return bills.filter((bill) => !bill.paid_at && bill.due_on >= today && bill.due_on <= end)
}

export function upcomingBills<T extends { due_on: string; paid_at: string | null; name: string }>(bills: T[], today: string) {
  const horizon = addDays(today, 14)
  return bills
    .filter((bill) => !bill.paid_at && bill.due_on <= horizon)
    .sort((a, b) => a.due_on.localeCompare(b.due_on) || a.name.localeCompare(b.name))
    .slice(0, 5)
}

export function taskProgress(tasks: { completed_at: string | null }[]) {
  return {
    done: tasks.filter((task) => task.completed_at).length,
    total: tasks.length,
  }
}

export function budgetPulse(amountCents: number | null, spentCents: number) {
  if (amountCents == null) return { remaining: null, ratio: 0, over: false }
  return {
    remaining: amountCents - spentCents,
    ratio: amountCents === 0 ? (spentCents > 0 ? 1 : 0) : Math.min(spentCents / amountCents, 1),
    over: spentCents > amountCents,
  }
}

export function spentAgainstBudget(
  expenses: { amount_cents: number; kind: string; visibility: Visibility }[],
  budgetVisibility: Visibility,
) {
  return expenses
    .filter((expense) => expense.kind === "expense" && expense.visibility === budgetVisibility)
    .reduce((sum, expense) => sum + expense.amount_cents, 0)
}

export function featuredMeal<T extends { meal_on: string; slot: string }>(meals: T[], today: string) {
  const todayMeals = meals.filter((meal) => meal.meal_on === today)
  for (const slot of ["dinner", "lunch", "breakfast", "snack"]) {
    const found = todayMeals.find((meal) => meal.slot === slot)
    if (found) return found
  }
  return meals.find((meal) => meal.meal_on > today) ?? null
}

export function parseCents(value: unknown) {
  const raw = String(value ?? "").replace(/[$,\s]/g, "")
  if (!raw || !/^\d+(\.\d{1,2})?$/.test(raw)) return null
  const cents = Math.round(Number(raw) * 100)
  if (!Number.isFinite(cents) || cents < 0 || cents > 100_000_000) return null
  return cents
}

export function parseDate(value: unknown) {
  const date = String(value ?? "")
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null
}
