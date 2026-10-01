import type { Metadata } from "next"

import { VisibilityPill } from "@/components/ui/pills"
import { recentActivity } from "@/lib/actions/records"
import { relativeTime } from "@/lib/home/metrics"

export const metadata: Metadata = { title: "Notifications" }

export default async function Page() {
  const items = await recentActivity()
  return (
    <div className="mx-auto grid max-w-3xl gap-4">
      <header>
        <h1 className="font-display text-[28px] font-semibold tracking-tight">Activity</h1>
        <p className="mt-1 text-sm text-muted-foreground">A calm record of what changed at home.</p>
      </header>
      <section className="deanly-card p-5">
        {items.length === 0 ? <p className="text-sm text-muted-foreground">You’re all caught up.</p> : null}
        <ul className="divide-y divide-border">
          {items.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3 py-3">
              <div>
                <p>{item.summary}</p>
                <p className="text-xs text-muted-foreground">{relativeTime(item.created_at)}</p>
              </div>
              <VisibilityPill visibility={item.visibility === "private" ? "private" : "shared"} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
