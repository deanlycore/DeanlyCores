import { requireHousehold } from "@/lib/data/context"
import {
  addDays,
  monthStart,
  nextMonthStart,
  startOfZonedDay,
  weekBounds,
  zonedDate,
} from "@/lib/home/metrics"
import type { Visibility } from "@/lib/visibility"

export type BillRow = {
  id: string
  name: string
  amount_cents: number
  due_on: string
  paid_at: string | null
  visibility: Visibility
}

export type TaskRow = {
  id: string
  title: string
  due_on: string | null
  completed_at: string | null
  visibility: Visibility
}

export type MealRow = {
  id: string
  title: string
  meal_on: string
  slot: string
  notes: string | null
  visibility: Visibility
}

export type EventRow = {
  id: string
  title: string
  starts_at: string
  ends_at?: string | null
  location: string | null
  visibility: Visibility
}

export type GoalRow = {
  id: string
  name: string
  target_cents: number
  current_cents: number
  visibility: Visibility
}

export type ShoppingRow = {
  id: string
  name: string
  checked_at: string | null
  visibility: Visibility
  store?: string | null
  need_soon?: boolean | null
}

export type ActivityRow = {
  id: string
  summary: string
  created_at: string
  visibility: Visibility
  actor_id: string
}

export type ExpenseRow = {
  id: string
  name: string
  amount_cents: number
  kind: string
  spent_on: string
  visibility: Visibility
}

export type NoteRow = {
  id: string
  title: string
  body: string
  visibility: Visibility
  updated_at: string
}

export type VaultRow = {
  id: string
  name: string
  mime_type: string | null
  size_bytes: number
  storage_path: string
  visibility: Visibility
  created_at: string
}

export type SubscriptionRow = {
  id: string
  name: string
  amount_cents: number
  renews_on: string
  active: boolean
  visibility: Visibility
}

export type HomePayload = {
  today: string
  currency: string
  lastVisibility: Visibility
  checklistDismissed: boolean
  budget: { amountCents: number; visibility: Visibility } | null
  expenses: ExpenseRow[]
  bills: BillRow[]
  tasks: TaskRow[]
  meals: MealRow[]
  events: EventRow[]
  goals: GoalRow[]
  shopping: ShoppingRow[]
  activity: ActivityRow[]
  errors: Partial<Record<"budget" | "bills" | "tasks" | "meals" | "events" | "goals" | "shopping" | "activity", boolean>>
}

async function rows<T>(
  run: PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<{ data: T[]; error: boolean }> {
  try {
    const { data, error } = await run
    if (error) return { data: [], error: true }
    return { data: data ?? [], error: false }
  } catch {
    return { data: [], error: true }
  }
}

export async function loadHome(timeZone: string): Promise<HomePayload | null> {
  const ctx = await requireHousehold()
  if (!ctx) return null
  const today = zonedDate(timeZone)
  const week = weekBounds(today)
  const start = monthStart(today)
  const end = nextMonthStart(today)
  const dayStart = startOfZonedDay(today, timeZone)
  const dayEnd = startOfZonedDay(addDays(today, 1), timeZone)
  const { supabase, householdId } = ctx

  const [budgetResult, expenses, bills, tasks, meals, events, goals, shopping, activity] = await Promise.all([
    supabase
      .from("budgets")
      .select("amount_cents, visibility, owner_id")
      .eq("household_id", householdId)
      .eq("period_month", start),
    rows<ExpenseRow>(
      supabase
        .from("expenses")
        .select("id, name, amount_cents, kind, spent_on, visibility")
        .eq("household_id", householdId)
        .gte("spent_on", start)
        .lt("spent_on", end),
    ),
    rows<BillRow>(
      supabase
        .from("bills")
        .select("id, name, amount_cents, due_on, paid_at, visibility")
        .eq("household_id", householdId)
        .lte("due_on", addDays(today, 21))
        .order("due_on", { ascending: true })
        .limit(30),
    ),
    rows<TaskRow>(
      supabase
        .from("tasks")
        .select("id, title, due_on, completed_at, visibility")
        .eq("household_id", householdId)
        .eq("due_on", today)
        .order("created_at", { ascending: true }),
    ),
    rows<MealRow>(
      supabase
        .from("meals")
        .select("id, title, meal_on, slot, notes, visibility")
        .eq("household_id", householdId)
        .gte("meal_on", week.start)
        .lte("meal_on", week.end)
        .order("meal_on", { ascending: true }),
    ),
    rows<EventRow>(
      dayStart && dayEnd
        ? supabase
            .from("calendar_events")
            .select("id, title, starts_at, location, visibility")
            .eq("household_id", householdId)
            .gte("starts_at", dayStart)
            .lt("starts_at", dayEnd)
            .order("starts_at", { ascending: true })
        : Promise.resolve({ data: [], error: { message: "timezone" } }),
    ),
    rows<GoalRow>(
      supabase
        .from("goals")
        .select("id, name, target_cents, current_cents, visibility")
        .eq("household_id", householdId)
        .order("created_at", { ascending: false })
        .limit(4),
    ),
    rows<ShoppingRow>(
      supabase
        .from("shopping_items")
        .select("id, name, checked_at, visibility")
        .eq("household_id", householdId)
        .order("created_at", { ascending: false })
        .limit(12),
    ),
    rows<ActivityRow>(
      supabase
        .from("activity_events")
        .select("id, summary, created_at, visibility, actor_id")
        .eq("household_id", householdId)
        .order("created_at", { ascending: false })
        .limit(8),
    ),
  ])

  const budgetRows = budgetResult.error ? [] : (budgetResult.data ?? [])
  const shared = budgetRows.find((row) => row.visibility === "shared")
  const personal = budgetRows.find((row) => row.visibility === "private" && row.owner_id === ctx.userId)
  const chosen = shared ?? personal ?? null

  return {
    today,
    currency: ctx.currency,
    lastVisibility: ctx.lastVisibility,
    checklistDismissed: ctx.checklistDismissed,
    budget: chosen ? { amountCents: chosen.amount_cents, visibility: chosen.visibility } : null,
    expenses: expenses.data,
    bills: bills.data,
    tasks: tasks.data,
    meals: meals.data,
    events: events.data,
    goals: goals.data,
    shopping: shopping.data,
    activity: activity.data,
    errors: {
      budget: Boolean(budgetResult.error),
      bills: bills.error,
      tasks: tasks.error,
      meals: meals.error,
      events: events.error,
      goals: goals.error,
      shopping: shopping.error,
      activity: activity.error,
    },
  }
}
