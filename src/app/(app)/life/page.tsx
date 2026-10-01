import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = { title: "Life" }

const links = [
  { href: "/life/calendar", label: "Calendar", body: "Today’s plans and what’s next." },
  { href: "/life/tasks", label: "Tasks", body: "Check off what’s due." },
  { href: "/life/meals", label: "Meals", body: "Dinner tonight and the week ahead." },
  { href: "/life/shopping", label: "Shopping", body: "A shared list for the next shop." },
  { href: "/life/subscriptions", label: "Subscriptions", body: "Renewals and the monthly total." },
]

export default function Page() {
  return (
    <div className="mx-auto grid max-w-[1180px] gap-4">
      <header>
        <h1 className="font-display text-[28px] font-semibold tracking-tight">Life</h1>
        <p className="mt-1 text-sm text-muted-foreground">The days, the meals, and the list on the fridge.</p>
      </header>
      <ul className="grid gap-4 sm:grid-cols-2">
        {links.map((link) => (
          <li key={link.href}>
            <Link href={link.href} className="deanly-card block p-5 hover:bg-surface-muted">
              <p className="font-medium">{link.label}</p>
              <p className="mt-1 text-sm text-muted-foreground">{link.body}</p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
