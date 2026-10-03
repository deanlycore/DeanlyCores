import assert from "node:assert/strict"
import test from "node:test"

import { commandLinks, primaryNav, railChildren, shellPathname } from "./navigation.ts"

test("money expands to bills, income, savings, subscriptions, cards, and people", () => {
  const money = primaryNav.find((item) => item.href === "/money")
  assert.equal(money?.expandOnly, true)
  assert.deepEqual(
    railChildren(money!).map((child) => [child.label, child.href]),
    [
      ["Bills", "/money/bills"],
      ["Income", "/money/income"],
      ["Savings", "/money/savings"],
      ["Subscriptions", "/money/subscriptions"],
      ["Cards", "/money/cards"],
      ["People", "/money/people"],
    ],
  )
  assert.equal(money?.children?.some((child) => child.href === "/money/budget" && child.rail), false)
  assert.equal(money?.children?.some((child) => child.href === "/money/owed"), false)
  const cards = money?.children?.find((child) => child.href === "/money/cards")
  const people = money?.children?.find((child) => child.href === "/money/people")
  assert.equal(cards?.emptyTitle, "No cards yet.")
  assert.equal(cards?.emptyBody, "No cards yet.")
  assert.equal(people?.emptyTitle, "Nothing owed to anyone yet.")
  assert.equal(people?.emptyBody, "Nothing owed to anyone yet.")
})

test("life expands to calendar, tasks, meals, and shopping", () => {
  const life = primaryNav.find((item) => item.href === "/life")
  assert.equal(life?.expandOnly, true)
  assert.deepEqual(
    railChildren(life!).map((child) => child.href),
    ["/life/calendar", "/life/tasks", "/life/meals", "/life/shopping"],
  )
})

test("rail children are unique and skip budget, debt, and vault", () => {
  const hrefs = primaryNav.flatMap((item) => railChildren(item).map((child) => child.href))
  assert.deepEqual(hrefs, [
    "/money/bills",
    "/money/income",
    "/money/savings",
    "/money/subscriptions",
    "/money/cards",
    "/money/people",
    "/life/calendar",
    "/life/tasks",
    "/life/meals",
    "/life/shopping",
  ])
  assert.equal(new Set(hrefs).size, hrefs.length)
  assert.equal(hrefs.includes("/money/budget"), false)
  assert.equal(hrefs.includes("/money/debt"), false)
  assert.equal(hrefs.includes("/money/owed"), false)
})

test("search skips the life hub and keeps the money summary", () => {
  const links = commandLinks()
  assert.equal(links.some((link) => link.href === "/money" && link.label === "Money"), true)
  assert.equal(links.some((link) => link.href === "/life"), false)
  assert.equal(links.some((link) => link.href === "/money/subscriptions"), true)
  assert.equal(links.some((link) => link.href === "/life/subscriptions"), false)
})

test("preview routes map onto the signed-in shell", () => {
  assert.equal(shellPathname("/preview/home"), "/home")
  assert.equal(shellPathname("/preview"), "/home")
  assert.equal(shellPathname("/preview/money/bills"), "/money/bills")
  assert.equal(shellPathname("/life/calendar"), "/life/calendar")
})
