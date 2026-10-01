import type { Metadata } from "next"

import { createHousehold } from "@/lib/actions/household"
import { widgetMeta } from "@/lib/dashboard/widgets"
import { defaultLayout } from "@/lib/dashboard/layout"
import { getSessionView } from "@/lib/data/session"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export const metadata: Metadata = { title: "Home" }

export default async function HomePage() {
  const session = await getSessionView()
  const first = session.displayName.split(/\s+/)[0] || "there"

  return (
    <div className="mx-auto grid max-w-6xl gap-6">
      <header>
        <h1 className="font-display text-[28px] font-semibold tracking-tight">Welcome back, {first}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Here’s what’s happening at home.</p>
      </header>

      {!session.householdName ? (
        <form action={createHousehold} className="deanly-card grid gap-3 p-5 sm:grid-cols-[1fr_auto] sm:items-end">
          <div className="grid gap-2">
            <Label htmlFor="household-name">Start the household</Label>
            <Input id="household-name" name="name" defaultValue="DeanFamily" className="h-11 rounded-button bg-surface px-3" />
          </div>
          <Button type="submit" className="h-11 rounded-button">
            Create DeanFamily
          </Button>
        </form>
      ) : (
        <p className="text-sm text-muted-foreground">
          Household <span className="font-medium text-ink">{session.householdName}</span>
        </p>
      )}

      <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-12">
        {defaultLayout().map((item) => {
          const widget = widgetMeta[item.id]
          return (
            <li key={item.id} className={`deanly-card p-5 ${widget.span}`}>
              <p className="text-sm font-medium text-muted-foreground">{widget.title}</p>
              <h2 className="mt-1 text-lg font-semibold tracking-tight">{widget.question}</h2>
              <p className="mt-3 text-sm text-muted-foreground">{widget.empty}</p>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
