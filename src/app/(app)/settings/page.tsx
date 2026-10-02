import type { Metadata } from "next"
import Link from "next/link"

import { signOut } from "@/lib/actions/auth"
import { CurrencyForm, NameForm } from "@/components/settings/settings-forms"
import { SharedPushToggle } from "@/components/settings/shared-push-toggle"
import { getSessionView } from "@/lib/data/session"
import { requireHousehold } from "@/lib/data/context"
import { getVapidPublicKey } from "@/lib/push/env"

export const metadata: Metadata = { title: "Settings" }

export default async function SettingsPage() {
  const session = await getSessionView()
  const ctx = await requireHousehold()
  const categories = ctx
    ? (
        await ctx.supabase
          .from("categories")
          .select("name")
          .eq("household_id", ctx.householdId)
          .order("sort_order", { ascending: true })
      ).data ?? []
    : []

  return (
    <div className="mx-auto grid max-w-3xl gap-4">
      <header>
        <h1 className="font-display text-[28px] font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Profile, household, notifications, and how amounts are shown.</p>
      </header>

      <section id="profile" className="deanly-card grid gap-3 p-5">
        <h2 className="font-medium">Profile</h2>
        <NameForm name={session.displayName} />
      </section>

      <section id="household" className="deanly-card grid gap-3 p-5">
        <h2 className="font-medium">{session.householdName ?? "Household"}</h2>
        <p className="text-sm text-muted-foreground">
          Deanly is invite-only. A household owner shares a login that was already created. There is no public sign-up.
        </p>
        <ul className="grid gap-2">
          {session.members.map((member) => (
            <li key={member.userId} className="flex items-center justify-between text-sm">
              <span>{member.displayName}</span>
              <span className="text-muted-foreground">{member.role === "owner" ? "Owner" : "Member"}</span>
            </li>
          ))}
        </ul>
      </section>

      <section id="categories" className="deanly-card p-5">
        <h2 className="font-medium">Categories</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {categories.length ? categories.map((category) => category.name).join(" · ") : "Categories appear after the household is created."}
        </p>
      </section>

      <section id="notifications" className="deanly-card grid gap-3 p-5">
        <h2 className="font-medium">Notifications</h2>
        <SharedPushToggle vapidPublicKey={getVapidPublicKey()} />
      </section>

      <section id="currency" className="deanly-card grid gap-3 p-5">
        <h2 className="font-medium">Currency</h2>
        <CurrencyForm currency={ctx?.currency ?? "USD"} />
        <Link href="/money/budget" className="text-sm font-medium text-brand-deep">
          Monthly budget
        </Link>
      </section>

      <section id="password" className="deanly-card p-5">
        <h2 className="font-medium">Password</h2>
        <Link href="/forgot-password" className="mt-2 inline-block text-sm font-medium text-brand-deep">
          Send a reset link
        </Link>
      </section>

      <section id="account" className="deanly-card grid gap-2 p-5">
        <h2 className="font-medium">Account</h2>
        <p className="text-sm text-muted-foreground">{session.email}</p>
        <form action={signOut}>
          <button type="submit" className="text-sm font-medium text-brand-deep">
            Log out
          </button>
        </form>
      </section>
    </div>
  )
}
