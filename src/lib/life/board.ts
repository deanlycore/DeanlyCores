import { addDays, weekBounds, zonedDate, zonedParts } from "@/lib/home/metrics"
import { applyVisibility, type PulseCell, type VisibilityFilter } from "@/lib/money/board"
import type { Visibility } from "@/lib/visibility"

export const LIFE_COPY = {
  tasksEmpty: "No tasks yet. Add what needs doing.",
  tasksPulseEmpty: "Nothing due soon.",
  eventsEmpty: "No events yet. Add what’s on for your household.",
  eventsPulseEmpty: "Nothing on this week yet.",
  mealsEmpty: "No meals planned yet. Add what’s cooking this week.",
  mealsPulseEmpty: "No meals planned this week yet.",
  shoppingEmpty: "List is clear. Add what to pick up.",
  shoppingPulseEmpty: "List is clear. Add what to pick up.",
  filterEmpty: "Nothing matches these filters.",
  markedDone: "Marked done — Undo",
  checkedOff: "Checked off — Undo",
} as const

export type LifePage = "calendar" | "tasks" | "meals" | "shopping"

const SLOT_RANK: Record<string, number> = { breakfast: 0, lunch: 1, dinner: 2, snack: 3 }

export function lifeSubtitle(page: LifePage, householdName?: string | null) {
  if (page === "calendar") {
    const name = householdName?.trim() || "your household"
    return `What’s on for ${name}.`
  }
  if (page === "tasks") return "What needs doing."
  if (page === "meals") return "What’s cooking this week."
  return "What to pick up."
}

export function calendarEmpty(householdName?: string | null) {
  const name = householdName?.trim() || "your household"
  return `No events yet. Add what’s on for ${name}.`
}

export function mealCountLabel(kind: "cook" | "leftover", count: number) {
  const noun = kind === "cook" ? "cook" : "leftover"
  return `${count} ${noun} night${count === 1 ? "" : "s"}`
}

function sharedRank(visibility: Visibility) {
  return visibility === "shared" ? 0 : 1
}

export function eventLocalDate(iso: string, timeZone: string) {
  return zonedDate(timeZone, new Date(iso))
}

export function weekdayShort(date: string) {
  const [year, month, day] = date.split("-").map(Number)
  return new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month - 1, day)),
  )
}

export function compactTime(iso: string, timeZone: string) {
  const parts = zonedParts(new Date(iso), timeZone)
  const suffix = parts.hour >= 12 ? "p" : "a"
  const hour = parts.hour % 12 || 12
  const minute = String(parts.minute).padStart(2, "0")
  return `${hour}:${minute}${suffix}`
}

export function isAllDay(startsAt: string, endsAt: string | null | undefined, timeZone: string) {
  if (!endsAt) return false
  const start = zonedParts(new Date(startsAt), timeZone)
  const end = zonedParts(new Date(endsAt), timeZone)
  return start.hour === 0 && start.minute === 0 && end.hour === 23 && end.minute === 59
}

export function eventWhen(startsAt: string, endsAt: string | null | undefined, timeZone: string) {
  if (isAllDay(startsAt, endsAt, timeZone)) return "All day"
  return compactTime(startsAt, timeZone)
}

export type DatedEvent = {
  id: string
  title: string
  starts_at: string
  ends_at?: string | null
  location?: string | null
  visibility: Visibility
}

export function sortEvents<T extends DatedEvent>(rows: T[], today: string, timeZone: string) {
  return [...rows].sort((a, b) => {
    const aDate = eventLocalDate(a.starts_at, timeZone)
    const bDate = eventLocalDate(b.starts_at, timeZone)
    const bucket = Number(aDate < today) - Number(bDate < today)
    if (bucket !== 0) return bucket
    const date = aDate.localeCompare(bDate)
    if (date !== 0) return date
    const shared = sharedRank(a.visibility) - sharedRank(b.visibility)
    if (shared !== 0) return shared
    return a.starts_at.localeCompare(b.starts_at)
  })
}

export type WeekDayCell = {
  id: string
  date: string
  weekday: string
  labels: string[]
  more: number
  today: boolean
  quiet: boolean
}

export function calendarWeekCells(events: DatedEvent[], today: string, timeZone: string): WeekDayCell[] {
  const { start } = weekBounds(today)
  return Array.from({ length: 7 }, (_, index) => {
    const date = addDays(start, index)
    const dayEvents = events
      .filter((event) => eventLocalDate(event.starts_at, timeZone) === date)
      .sort((a, b) => sharedRank(a.visibility) - sharedRank(b.visibility) || a.starts_at.localeCompare(b.starts_at))
    const labels = dayEvents.slice(0, 2).map((event) => event.title)
    return {
      id: date,
      date,
      weekday: weekdayShort(date),
      labels,
      more: Math.max(0, dayEvents.length - labels.length),
      today: date === today,
      quiet: false,
    }
  })
}

export function calendarMetrics(events: DatedEvent[], today: string, timeZone: string) {
  const { start, end } = weekBounds(today)
  let todayCount = 0
  let weekCount = 0
  let shared = 0
  for (const event of events) {
    const date = eventLocalDate(event.starts_at, timeZone)
    if (date === today) todayCount += 1
    if (date >= start && date <= end) weekCount += 1
    if (event.visibility === "shared") shared += 1
  }
  return { todayCount, weekCount, shared }
}

export function weekHasEvents(events: DatedEvent[], today: string, timeZone: string) {
  return calendarMetrics(events, today, timeZone).weekCount > 0
}

export type LifeTask = {
  id: string
  title: string
  due_on: string | null
  completed_at: string | null
  visibility: Visibility
}

export function sortTasks<T extends LifeTask>(rows: T[], today: string) {
  return [...rows].sort((a, b) => {
    const bucket = taskBucket(a, today) - taskBucket(b, today)
    if (bucket !== 0) return bucket
    const date = (a.due_on ?? "9999-99-99").localeCompare(b.due_on ?? "9999-99-99")
    if (date !== 0) return date
    const shared = sharedRank(a.visibility) - sharedRank(b.visibility)
    if (shared !== 0) return shared
    return a.title.localeCompare(b.title)
  })
}

function taskBucket(task: LifeTask, today: string) {
  if (task.completed_at) return 3
  if (!task.due_on) return 2
  if (task.due_on < today) return 0
  return 1
}

export function taskDueCopy(task: { due_on: string | null; completed_at: string | null }, today: string) {
  if (task.completed_at) return { text: "Done", tone: "success" as const }
  if (!task.due_on) return { text: "No date", tone: "muted" as const }
  if (task.due_on < today) return { text: "Overdue", tone: "danger" as const }
  if (task.due_on === today) return { text: "Due today", tone: "muted" as const }
  const days = daysBetween(today, task.due_on)
  if (days <= 6) return { text: `Due ${weekdayShort(task.due_on)}`, tone: "muted" as const }
  return { text: `Due ${shortMonthDay(task.due_on)}`, tone: "muted" as const }
}

function daysBetween(from: string, to: string) {
  const [y1, m1, d1] = from.split("-").map(Number)
  const [y2, m2, d2] = to.split("-").map(Number)
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000)
}

function shortMonthDay(date: string) {
  const [year, month, day] = date.split("-").map(Number)
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month - 1, day)),
  )
}

export function taskMetrics(tasks: LifeTask[], today: string, timeZone: string) {
  const { start, end } = weekBounds(today)
  const open = tasks.filter((task) => !task.completed_at)
  return {
    dueToday: open.filter((task) => task.due_on === today).length,
    doneThisWeek: tasks.filter((task) => {
      if (!task.completed_at) return false
      const date = eventLocalDate(task.completed_at, timeZone)
      return date >= start && date <= end
    }).length,
  }
}

export function taskPulseCells(tasks: LifeTask[], today: string): PulseCell[] {
  const horizon = addDays(today, 6)
  return sortTasks(
    tasks.filter((task) => !task.completed_at && task.due_on && task.due_on <= horizon),
    today,
  )
    .slice(0, 7)
    .map((task) => {
      const due = task.due_on ?? today
      const overdue = due < today
      return {
        id: task.id,
        date: due,
        day: overdue ? "Due" : weekdayShort(due),
        title: task.title,
        detail: overdue ? "Overdue" : task.due_on === today ? "Due today" : weekdayShort(due),
        tone: overdue ? "overdue" : due === today ? "soon" : "idle",
      }
    })
}

export function isLeftoverMeal(meal: { title: string }) {
  return /\bleftovers?\b/i.test(meal.title)
}

export type LifeMeal = {
  id: string
  title: string
  meal_on: string
  slot: string
  notes: string | null
  visibility: Visibility
}

export function sortMeals<T extends LifeMeal>(rows: T[]) {
  return [...rows].sort((a, b) => {
    const date = a.meal_on.localeCompare(b.meal_on)
    if (date !== 0) return date
    const slot = (SLOT_RANK[a.slot] ?? 9) - (SLOT_RANK[b.slot] ?? 9)
    if (slot !== 0) return slot
    const shared = sharedRank(a.visibility) - sharedRank(b.visibility)
    if (shared !== 0) return shared
    return a.title.localeCompare(b.title)
  })
}

export function mealMetrics(meals: LifeMeal[], today: string) {
  const { start, end } = weekBounds(today)
  const dinners = meals.filter((meal) => meal.slot === "dinner" && meal.meal_on >= start && meal.meal_on <= end)
  const dates = (leftover: boolean) =>
    new Set(dinners.filter((meal) => isLeftoverMeal(meal) === leftover).map((meal) => meal.meal_on)).size
  return { cookNights: dates(false), leftoverNights: dates(true) }
}

export function mealWeekCells(meals: LifeMeal[], today: string): WeekDayCell[] {
  const { start } = weekBounds(today)
  return Array.from({ length: 7 }, (_, index) => {
    const date = addDays(start, index)
    const day = meals.filter((meal) => meal.meal_on === date)
    const dinner = sortMeals(day.filter((meal) => meal.slot === "dinner"))[0]
    const fallback = sortMeals(day)[0]
    const chosen = dinner ?? fallback
    const label = !chosen ? "—" : isLeftoverMeal(chosen) ? "Leftover" : chosen.title
    return {
      id: date,
      date,
      weekday: weekdayShort(date),
      labels: [label],
      more: 0,
      today: date === today,
      quiet: !dinner,
    }
  })
}

export function weekHasMeals(meals: LifeMeal[], today: string) {
  const { start, end } = weekBounds(today)
  return meals.some((meal) => meal.meal_on >= start && meal.meal_on <= end)
}

export type LifeShopping = {
  id: string
  name: string
  checked_at: string | null
  visibility: Visibility
  store?: string | null
  need_soon?: boolean | null
}

export function sortShopping<T extends LifeShopping>(rows: T[]) {
  return [...rows].sort((a, b) => {
    const open = Number(Boolean(a.checked_at)) - Number(Boolean(b.checked_at))
    if (open !== 0) return open
    const shared = sharedRank(a.visibility) - sharedRank(b.visibility)
    if (shared !== 0) return shared
    return a.name.localeCompare(b.name)
  })
}

export function shoppingMetrics(items: LifeShopping[]) {
  return {
    open: items.filter((item) => !item.checked_at).length,
    done: items.filter((item) => item.checked_at).length,
  }
}

export function shoppingStores(items: LifeShopping[]) {
  const names = new Set<string>()
  for (const item of items) {
    const store = item.store?.trim()
    if (store) names.add(store)
  }
  return [...names].sort((a, b) => a.localeCompare(b))
}

export function shoppingPulseItems(items: LifeShopping[]) {
  const open = items.filter((item) => !item.checked_at)
  const soon = open.filter((item) => item.need_soon)
  return sortShopping(soon.length > 0 ? soon : open).slice(0, 7)
}

export function filterLife<T extends { visibility: Visibility }>(rows: T[], filter: VisibilityFilter) {
  return applyVisibility(rows, filter)
}

export function eventFormWhen(startsAt: string, endsAt: string | null | undefined, timeZone: string) {
  const start = zonedParts(new Date(startsAt), timeZone)
  const date = eventLocalDate(startsAt, timeZone)
  const allDay = isAllDay(startsAt, endsAt, timeZone)
  const endDate = endsAt ? eventLocalDate(endsAt, timeZone) : ""
  return {
    date,
    time: `${String(start.hour).padStart(2, "0")}:${String(start.minute).padStart(2, "0")}`,
    endDate: endDate && endDate !== date ? endDate : "",
    allDay,
  }
}
