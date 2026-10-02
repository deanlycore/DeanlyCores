import assert from "node:assert/strict"
import test from "node:test"

import {
  LIFE_COPY,
  calendarEmpty,
  calendarMetrics,
  calendarWeekCells,
  eventWhen,
  filterLife,
  isLeftoverMeal,
  lifeSubtitle,
  mealCountLabel,
  mealMetrics,
  mealWeekCells,
  shoppingMetrics,
  shoppingPulseItems,
  shoppingStores,
  sortEvents,
  sortMeals,
  sortShopping,
  sortTasks,
  taskDueCopy,
  taskMetrics,
  taskPulseCells,
  weekHasEvents,
} from "./board.ts"

const today = "2026-10-02"
const zone = "America/Denver"

const events = [
  {
    id: "daycare",
    title: "Daycare rhythm",
    starts_at: "2026-09-28T06:00:00.000Z",
    ends_at: "2026-09-29T05:59:00.000Z",
    location: null,
    visibility: "shared" as const,
  },
  {
    id: "dentist",
    title: "Dentist checkup",
    starts_at: "2026-10-02T15:00:00.000Z",
    ends_at: null,
    location: "Downtown clinic",
    visibility: "shared" as const,
  },
  {
    id: "soccer",
    title: "Soccer practice",
    starts_at: "2026-10-03T21:30:00.000Z",
    ends_at: null,
    location: null,
    visibility: "shared" as const,
  },
  {
    id: "work",
    title: "Work block",
    starts_at: "2026-10-02T16:00:00.000Z",
    ends_at: null,
    location: null,
    visibility: "private" as const,
  },
]

test("calendar copy uses the household name and a calm empty line", () => {
  assert.equal(lifeSubtitle("calendar", "DeanFamily"), "What’s on for DeanFamily.")
  assert.equal(lifeSubtitle("tasks", "DeanFamily"), "What needs doing.")
  assert.equal(lifeSubtitle("meals", "DeanFamily"), "What’s cooking this week.")
  assert.equal(lifeSubtitle("shopping", "DeanFamily"), "What to pick up.")
  assert.equal(calendarEmpty("DeanFamily"), "No events yet. Add what’s on for DeanFamily.")
  assert.equal(LIFE_COPY.filterEmpty, "Nothing matches these filters.")
  assert.equal(LIFE_COPY.shoppingEmpty, LIFE_COPY.shoppingPulseEmpty)
  assert.equal(LIFE_COPY.shoppingEmpty, "List is clear. Add what to pick up.")
  assert.equal(LIFE_COPY.shoppingEmpty.toLowerCase().includes("empty"), false)
})

test("calendar week pulse marks today and keeps shared labels first", () => {
  const cells = calendarWeekCells(events, today, zone)
  assert.equal(cells.length, 7)
  assert.equal(cells[0].weekday, "Mon")
  assert.deepEqual(cells[0].labels, ["Daycare rhythm"])
  const friday = cells.find((cell) => cell.today)
  assert.equal(friday?.weekday, "Fri")
  assert.deepEqual(friday?.labels, ["Dentist checkup", "Work block"])
  assert.equal(weekHasEvents(events, today, zone), true)
  assert.equal(weekHasEvents([], today, zone), false)
  assert.equal(eventWhen(events[0].starts_at, events[0].ends_at, zone), "All day")
  assert.equal(eventWhen(events[1].starts_at, null, zone), "9:00a")
  const metrics = calendarMetrics(events, today, zone)
  assert.equal(metrics.todayCount, 2)
  assert.equal(metrics.weekCount, 4)
  assert.equal(metrics.shared, 3)
})

test("events sort upcoming first and Shared ahead on the same day", () => {
  const sorted = sortEvents(events, today, zone).map((event) => event.id)
  assert.deepEqual(sorted, ["dentist", "work", "soccer", "daycare"])
})

test("tasks put overdue first, keep due copy calm, and count done this week", () => {
  const tasks = [
    { id: "license", title: "Renew license", due_on: "2026-10-16", completed_at: null, visibility: "private" as const },
    { id: "bag", title: "Pack soccer bag", due_on: "2026-10-03", completed_at: null, visibility: "shared" as const },
    { id: "books", title: "Return books", due_on: "2026-10-01", completed_at: null, visibility: "shared" as const },
    { id: "call", title: "Call insurance", due_on: "2026-10-02", completed_at: null, visibility: "shared" as const },
    { id: "plants", title: "Water plants", due_on: "2026-09-30", completed_at: "2026-10-01T18:00:00.000Z", visibility: "shared" as const },
    { id: "same", title: "Personal note", due_on: "2026-10-02", completed_at: null, visibility: "private" as const },
  ]
  assert.deepEqual(sortTasks(tasks, today).map((task) => task.id), ["books", "call", "same", "bag", "license", "plants"])
  assert.equal(taskDueCopy(tasks[2], today).tone, "danger")
  assert.equal(taskDueCopy(tasks[2], today).text, "Overdue")
  assert.equal(taskDueCopy(tasks[3], today).text, "Due today")
  assert.equal(taskDueCopy(tasks[1], today).text, "Due Sat")
  assert.equal(taskDueCopy(tasks[4], today).text, "Done")
  const metrics = taskMetrics(tasks, today, zone)
  assert.equal(metrics.dueToday, 2)
  assert.equal(metrics.doneThisWeek, 1)
  const pulse = taskPulseCells(tasks, today)
  assert.equal(pulse[0].tone, "overdue")
  assert.equal(pulse[0].detail, "Overdue")
  assert.equal(pulse.some((cell) => cell.id === "license"), false)
})

test("meals count cook nights and leftover nights without nutrition language", () => {
  const meals = [
    { id: "mon", title: "Grill chicken", meal_on: "2026-09-28", slot: "dinner", notes: null, visibility: "shared" as const },
    { id: "tue", title: "Leftover", meal_on: "2026-09-29", slot: "dinner", notes: "From Monday", visibility: "shared" as const },
    { id: "wed", title: "Creamy pasta", meal_on: "2026-09-30", slot: "dinner", notes: "Leftovers for Thu", visibility: "shared" as const },
    { id: "thu", title: "Leftover", meal_on: "2026-10-01", slot: "dinner", notes: null, visibility: "shared" as const },
    { id: "fri", title: "Tacos", meal_on: "2026-10-02", slot: "dinner", notes: null, visibility: "shared" as const },
    { id: "breakfast", title: "Oatmeal", meal_on: "2026-10-02", slot: "breakfast", notes: null, visibility: "private" as const },
  ]
  const metrics = mealMetrics(meals, today)
  assert.equal(metrics.cookNights, 3)
  assert.equal(metrics.leftoverNights, 2)
  assert.equal(mealCountLabel("cook", 3), "3 cook nights")
  assert.equal(mealCountLabel("leftover", 2), "2 leftover nights")
  assert.equal(mealCountLabel("leftover", 1), "1 leftover night")
  assert.equal(isLeftoverMeal(meals[2]), false)
  const friday = mealWeekCells(meals, today).find((cell) => cell.today)
  assert.deepEqual(friday?.labels, ["Tacos"])
  assert.equal(friday?.quiet, false)
  const sorted = sortMeals(meals.filter((meal) => meal.meal_on === today)).map((meal) => meal.id)
  assert.deepEqual(sorted, ["breakfast", "fri"])
  const copy = JSON.stringify(LIFE_COPY)
  assert.equal(/calorie|macro|protein|height|weight/i.test(copy), false)
})

test("shopping stays open-first, Shared-first, and groups quiet stores", () => {
  const items = [
    { id: "case", name: "Headphones case", checked_at: null, visibility: "private" as const, store: null, need_soon: false },
    { id: "towels", name: "Paper towels", checked_at: null, visibility: "shared" as const, store: "Costco", need_soon: false },
    { id: "milk", name: "Milk", checked_at: null, visibility: "shared" as const, store: "Costco", need_soon: true },
    { id: "tortillas", name: "Tortillas", checked_at: null, visibility: "shared" as const, store: "Smith's", need_soon: false },
    { id: "bananas", name: "Bananas", checked_at: "2026-10-02T15:00:00.000Z", visibility: "shared" as const, store: "Costco", need_soon: false },
  ]
  assert.deepEqual(sortShopping(items).map((item) => item.id), ["milk", "towels", "tortillas", "case", "bananas"])
  assert.deepEqual(shoppingMetrics(items), { open: 4, done: 1 })
  assert.deepEqual(shoppingStores(items), ["Costco", "Smith's"])
  assert.deepEqual(shoppingPulseItems(items).map((item) => item.id), ["milk"])
  assert.deepEqual(filterLife(items, "private").map((item) => item.id), ["case"])
  assert.equal(filterLife(items, "all").length, 5)
})
