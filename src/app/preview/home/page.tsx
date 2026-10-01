import { notFound } from "next/navigation"

import { HomeDashboard } from "@/components/home/home-dashboard"
import { AppShell } from "@/components/shell/app-shell"
import type { HomePayload } from "@/lib/data/home"
import type { SessionView } from "@/lib/data/session"

export const dynamic = "force-dynamic"

const session: SessionView = {
  configured: true,
  email: "alex@deanly.test",
  userId: "00000000-0000-0000-0000-000000000001",
  displayName: "Alex Dean",
  avatarUrl: null,
  householdId: "00000000-0000-0000-0000-000000000010",
  householdName: "DeanFamily",
  role: "owner",
  members: [
    { userId: "1", role: "owner", displayName: "Alex Dean", avatarUrl: null },
    { userId: "2", role: "member", displayName: "Sam Dean", avatarUrl: null },
  ],
}

const data: HomePayload = {
  today: "2026-10-01",
  currency: "USD",
  lastVisibility: "shared",
  checklistDismissed: true,
  budget: { amountCents: 365000, visibility: "shared" },
  expenses: [
    { id: "e1", name: "Groceries", amount_cents: 120000, kind: "expense", spent_on: "2026-10-01", visibility: "shared" },
  ],
  bills: [
    { id: "b1", name: "Electric", amount_cents: 8500, due_on: "2026-10-03", paid_at: null, visibility: "shared" },
    { id: "b2", name: "Internet", amount_cents: 6000, due_on: "2026-10-08", paid_at: null, visibility: "shared" },
    { id: "b3", name: "Water", amount_cents: 4200, due_on: "2026-09-28", paid_at: null, visibility: "private" },
  ],
  tasks: [
    { id: "t1", title: "Laundry", due_on: "2026-10-01", completed_at: "2026-10-01T12:00:00Z", visibility: "shared" },
    { id: "t2", title: "School forms", due_on: "2026-10-01", completed_at: null, visibility: "shared" },
    { id: "t3", title: "Call the dentist", due_on: "2026-10-01", completed_at: null, visibility: "private" },
  ],
  meals: [
    { id: "m1", title: "Lemon chicken", meal_on: "2026-10-01", slot: "dinner", notes: null, visibility: "shared" },
    { id: "m2", title: "Oatmeal", meal_on: "2026-10-01", slot: "breakfast", notes: null, visibility: "shared" },
    { id: "m3", title: "Soup", meal_on: "2026-10-02", slot: "dinner", notes: null, visibility: "shared" },
  ],
  events: [
    { id: "c1", title: "School pickup", starts_at: "2026-10-01T19:15:00Z", location: null, visibility: "shared" },
    { id: "c2", title: "Grocery run", starts_at: "2026-10-01T22:00:00Z", location: null, visibility: "private" },
  ],
  goals: [
    { id: "g1", name: "Emergency fund", target_cents: 500000, current_cents: 180000, visibility: "shared" },
    { id: "g2", name: "Weekend away", target_cents: 120000, current_cents: 40000, visibility: "shared" },
  ],
  shopping: [
    { id: "s1", name: "Milk", checked_at: null, visibility: "shared" },
    { id: "s2", name: "Bread", checked_at: null, visibility: "shared" },
    { id: "s3", name: "Apples", checked_at: "2026-10-01T15:00:00Z", visibility: "shared" },
  ],
  activity: [
    { id: "a1", summary: "Alex paid the water bill", created_at: "2026-10-01T15:00:00Z", visibility: "shared", actor_id: "1" },
    { id: "a2", summary: "Sam completed Laundry", created_at: "2026-10-01T14:00:00Z", visibility: "shared", actor_id: "2" },
  ],
  errors: {},
}

export default function PreviewHome() {
  if (process.env.NODE_ENV === "production") notFound()
  return (
    <AppShell session={session}>
      <HomeDashboard session={session} data={data} timeZone="America/New_York" />
    </AppShell>
  )
}
