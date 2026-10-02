import { requireHousehold } from "@/lib/data/context"
import { monthStart } from "@/lib/home/metrics"
import type {
  BillRow,
  EventRow,
  ExpenseRow,
  GoalRow,
  MealRow,
  NoteRow,
  ShoppingRow,
  SubscriptionRow,
  TaskRow,
  VaultRow,
} from "@/lib/data/home"

async function listed<T>(
  run: PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
) {
  const ctx = await requireHousehold()
  if (!ctx) return { rows: [] as T[], error: false, currency: "USD", visibility: "shared" as const }
  const { data, error } = await run
  return {
    rows: data ?? [],
    error: Boolean(error),
    currency: ctx.currency,
    visibility: ctx.lastVisibility,
  }
}

export async function listMonthBudget(today: string) {
  const ctx = await requireHousehold()
  if (!ctx) return { amountCents: null as number | null, error: false }
  const { data, error } = await ctx.supabase
    .from("budgets")
    .select("amount_cents, visibility, owner_id")
    .eq("household_id", ctx.householdId)
    .eq("period_month", monthStart(today))
  if (error) return { amountCents: null, error: true }
  const shared = (data ?? []).find((row) => row.visibility === "shared")
  const personal = (data ?? []).find((row) => row.visibility === "private" && row.owner_id === ctx.userId)
  const chosen = shared ?? personal ?? null
  return { amountCents: chosen ? chosen.amount_cents : null, error: false }
}

export async function listBills() {
  const ctx = await requireHousehold()
  if (!ctx) return listed<BillRow>(Promise.resolve({ data: [], error: null }))
  return listed<BillRow>(
    ctx.supabase
      .from("bills")
      .select("id, name, amount_cents, due_on, paid_at, visibility")
      .eq("household_id", ctx.householdId)
      .order("due_on", { ascending: true })
      .limit(100),
  )
}

export async function listTasks() {
  const ctx = await requireHousehold()
  if (!ctx) return listed<TaskRow>(Promise.resolve({ data: [], error: null }))
  return listed<TaskRow>(
    ctx.supabase
      .from("tasks")
      .select("id, title, due_on, completed_at, visibility")
      .eq("household_id", ctx.householdId)
      .order("due_on", { ascending: true, nullsFirst: false })
      .limit(100),
  )
}

export async function listEvents() {
  const ctx = await requireHousehold()
  if (!ctx) return listed<EventRow>(Promise.resolve({ data: [], error: null }))
  return listed<EventRow>(
    ctx.supabase
      .from("calendar_events")
      .select("id, title, starts_at, location, visibility")
      .eq("household_id", ctx.householdId)
      .order("starts_at", { ascending: true })
      .limit(80),
  )
}

export async function listMeals() {
  const ctx = await requireHousehold()
  if (!ctx) return listed<MealRow>(Promise.resolve({ data: [], error: null }))
  return listed<MealRow>(
    ctx.supabase
      .from("meals")
      .select("id, title, meal_on, slot, notes, visibility")
      .eq("household_id", ctx.householdId)
      .order("meal_on", { ascending: true })
      .limit(80),
  )
}

export async function listShopping() {
  const ctx = await requireHousehold()
  if (!ctx) return listed<ShoppingRow>(Promise.resolve({ data: [], error: null }))
  return listed<ShoppingRow>(
    ctx.supabase
      .from("shopping_items")
      .select("id, name, checked_at, visibility")
      .eq("household_id", ctx.householdId)
      .order("created_at", { ascending: false })
      .limit(80),
  )
}

export async function listGoals() {
  const ctx = await requireHousehold()
  if (!ctx) return listed<GoalRow>(Promise.resolve({ data: [], error: null }))
  return listed<GoalRow>(
    ctx.supabase
      .from("goals")
      .select("id, name, target_cents, current_cents, visibility")
      .eq("household_id", ctx.householdId)
      .order("created_at", { ascending: false })
      .limit(40),
  )
}

export async function listExpenses(kind: "expense" | "income") {
  const ctx = await requireHousehold()
  if (!ctx) return listed<ExpenseRow>(Promise.resolve({ data: [], error: null }))
  return listed<ExpenseRow>(
    ctx.supabase
      .from("expenses")
      .select("id, name, amount_cents, kind, spent_on, visibility")
      .eq("household_id", ctx.householdId)
      .eq("kind", kind)
      .order("spent_on", { ascending: false })
      .limit(60),
  )
}

export async function listNotes() {
  const ctx = await requireHousehold()
  if (!ctx) return listed<NoteRow>(Promise.resolve({ data: [], error: null }))
  return listed<NoteRow>(
    ctx.supabase
      .from("notes")
      .select("id, title, body, visibility, updated_at")
      .eq("household_id", ctx.householdId)
      .order("updated_at", { ascending: false })
      .limit(40),
  )
}

export async function listDocuments() {
  const ctx = await requireHousehold()
  if (!ctx) return listed<VaultRow>(Promise.resolve({ data: [], error: null }))
  return listed<VaultRow>(
    ctx.supabase
      .from("vault_documents")
      .select("id, name, mime_type, size_bytes, storage_path, visibility, created_at")
      .eq("household_id", ctx.householdId)
      .order("created_at", { ascending: false })
      .limit(40),
  )
}

export async function listSubscriptions() {
  const ctx = await requireHousehold()
  if (!ctx) return listed<SubscriptionRow>(Promise.resolve({ data: [], error: null }))
  return listed<SubscriptionRow>(
    ctx.supabase
      .from("subscriptions")
      .select("id, name, amount_cents, renews_on, active, visibility")
      .eq("household_id", ctx.householdId)
      .order("renews_on", { ascending: true })
      .limit(40),
  )
}

export async function getNote(id: string) {
  const ctx = await requireHousehold()
  if (!ctx) return null
  const { data } = await ctx.supabase
    .from("notes")
    .select("id, title, body, visibility, updated_at")
    .eq("id", id)
    .maybeSingle()
  return data
}
