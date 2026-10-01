"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import {
  CalendarDays,
  Check,
  ListChecks,
  UtensilsCrossed,
  Wallet,
} from "lucide-react"

import { createHousehold } from "@/lib/actions/household"
import { dismissChecklist, setShoppingChecked, setTaskComplete } from "@/lib/actions/records"
import { RecordDialog } from "@/components/create/record-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { StatusChip, VisibilityPill, WidgetError } from "@/components/ui/pills"
import type { HomePayload, ShoppingRow, TaskRow } from "@/lib/data/home"
import type { SessionView } from "@/lib/data/session"
import {
  billStatus,
  billsDueThisWeek,
  budgetPulse,
  featuredMeal,
  formatMoney,
  formatShortDate,
  formatTime,
  greetingFor,
  longDate,
  relativeTime,
  spentAgainstBudget,
  taskProgress,
  upcomingBills,
} from "@/lib/home/metrics"

export function HomeDashboard({
  session,
  data,
  timeZone,
}: {
  session: SessionView
  data: HomePayload | null
  timeZone: string
}) {
  const today = data?.today ?? new Date().toISOString().slice(0, 10)
  const visibility = data?.lastVisibility ?? "shared"
  const currency = data?.currency ?? "USD"

  return (
    <div className="mx-auto grid max-w-[1180px] gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[28px] font-semibold tracking-tight text-ink sm:text-[32px]">
            {greetingFor(timeZone, session.displayName)}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Here’s what’s happening today.</p>
        </div>
        <div className="flex items-center gap-3">
          <p className="text-sm text-muted-foreground">{longDate(timeZone)}</p>
          <CustomizeHint />
        </div>
      </header>

      {!session.householdId ? (
        <form action={createHousehold} className="deanly-card grid gap-3 p-5 sm:grid-cols-[1fr_auto] sm:items-end">
          <div className="grid gap-2">
            <Label htmlFor="household-name">Name your household</Label>
            <Input id="household-name" name="name" defaultValue="DeanFamily" className="h-11 rounded-button bg-surface px-3" />
          </div>
          <Button type="submit" className="h-11 rounded-button text-primary-foreground">
            Create household
          </Button>
        </form>
      ) : null}

      {data && !data.checklistDismissed && data.bills.length === 0 ? (
        <Checklist today={today} visibility={visibility} members={session.members.length} />
      ) : null}

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <BudgetKpi data={data} currency={currency} today={today} visibility={visibility} />
        <CountKpi
          icon={<CalendarDays className="size-5" />}
          label="Upcoming Bills"
          value={data ? String(billsDueThisWeek(data.bills, data.today).length) : "—"}
          hint="due this week"
          href="/money/bills"
          link="View bills"
          error={data?.errors.bills}
          empty={data ? billsDueThisWeek(data.bills, data.today).length === 0 : false}
          emptyText="No bills due this week"
          action={<RecordDialog kind="bill" today={today} defaultVisibility={visibility} trigger={<TextLink>Add bill</TextLink>} />}
        />
        <CountKpi
          icon={<ListChecks className="size-5" />}
          label="Today’s Tasks"
          value={data ? `${taskProgress(data.tasks).done} of ${taskProgress(data.tasks).total}` : "—"}
          hint="completed"
          href="/life/tasks"
          link="View tasks"
          error={data?.errors.tasks}
          empty={data ? data.tasks.length === 0 : false}
          emptyText="Nothing due today"
          action={<RecordDialog kind="task" today={today} defaultVisibility={visibility} trigger={<TextLink>Add task</TextLink>} />}
        />
        <CountKpi
          icon={<UtensilsCrossed className="size-5" />}
          label="Meals This Week"
          value={data ? String(data.meals.length) : "—"}
          hint="planned meals"
          href="/life/meals"
          link="View meal plan"
          error={data?.errors.meals}
          empty={data ? data.meals.length === 0 : false}
          emptyText="Plan this week’s meals"
          action={<RecordDialog kind="meal" today={today} defaultVisibility={visibility} trigger={<TextLink>Add meal</TextLink>} />}
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <EventsCard data={data} timeZone={timeZone} today={today} visibility={visibility} />
        <BillsCard data={data} currency={currency} today={today} visibility={visibility} />
        <MealsCard data={data} today={today} visibility={visibility} />
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <GoalsCard data={data} currency={currency} today={today} visibility={visibility} />
        <ShoppingCard data={data} today={today} visibility={visibility} />
        <ActivityCard data={data} />
      </section>
    </div>
  )
}

function CustomizeHint() {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <Button type="button" variant="outline" className="h-10 rounded-button" onClick={() => setOpen((value) => !value)}>
        Customize
      </Button>
      {open ? (
        <p className="absolute right-0 z-10 mt-2 w-56 rounded-xl border border-border bg-surface p-3 text-sm text-muted-foreground shadow-soft">
          This home layout is set for now.
        </p>
      ) : null}
    </div>
  )
}

function Checklist({
  today,
  visibility,
  members,
}: {
  today: string
  visibility: "shared" | "private"
  members: number
}) {
  return (
    <section className="deanly-card flex flex-wrap items-center justify-between gap-3 p-5">
      <div>
        <h2 className="font-medium">A quiet start</h2>
        <p className="mt-1 text-sm text-muted-foreground">Add a bill, invite someone in, or upload a paper when you’re ready.</p>
        <div className="mt-3 flex flex-wrap gap-3 text-sm">
          <RecordDialog kind="bill" today={today} defaultVisibility={visibility} trigger={<TextLink>Add bill</TextLink>} />
          <Link href="/settings#household" className="font-medium text-brand-deep">
            {members < 2 ? "Invite partner" : "Household"}
          </Link>
          <RecordDialog kind="upload" today={today} defaultVisibility="private" trigger={<TextLink>Upload doc</TextLink>} />
        </div>
      </div>
      <DismissChecklist />
    </section>
  )
}

function DismissChecklist() {
  const router = useRouter()
  return (
    <Button
      type="button"
      variant="ghost"
      onClick={async () => {
        await dismissChecklist()
        router.refresh()
      }}
    >
      Dismiss
    </Button>
  )
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <article className={`deanly-card p-5 ${className}`}>{children}</article>
}

function CardHead({ title, href, link }: { title: string; href: string; link: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-sm font-medium text-ink">{title}</h2>
      <Link href={href} className="text-sm font-medium text-brand-deep">
        {link}
      </Link>
    </div>
  )
}

function TextLink({ children }: { children: React.ReactNode }) {
  return (
    <button type="button" className="text-sm font-medium text-brand-deep">
      {children}
    </button>
  )
}

function BudgetKpi({
  data,
  currency,
  today,
  visibility,
}: {
  data: HomePayload | null
  currency: string
  today: string
  visibility: "shared" | "private"
}) {
  const spent = data?.budget ? spentAgainstBudget(data.expenses, data.budget.visibility) : 0
  const pulse = budgetPulse(data?.budget?.amountCents ?? null, spent)
  return (
    <Card>
      <span className="grid size-10 place-items-center rounded-full bg-brand-soft text-brand-deep">
        <Wallet className="size-5" />
      </span>
      <p className="mt-3 text-sm text-muted-foreground">Household Budget</p>
      {data?.errors.budget ? <WidgetError /> : null}
      {!data?.budget ? (
        <div className="mt-2">
          <p className="text-sm text-muted-foreground">Set a monthly budget</p>
          <div className="mt-2">
            <RecordDialog kind="budget" today={today} defaultVisibility="shared" trigger={<TextLink>Set budget</TextLink>} />
          </div>
        </div>
      ) : (
        <>
          <p className="mt-1 font-display text-[26px] font-semibold tabular-nums tracking-tight">
            {pulse.over ? formatMoney(Math.abs(pulse.remaining ?? 0), currency) : formatMoney(pulse.remaining ?? 0, currency)}
          </p>
          <p className="text-sm text-muted-foreground">{pulse.over ? "over this month" : "remaining this month"}</p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-muted">
            <div
              className={`h-full rounded-full ${pulse.over ? "bg-danger" : "bg-brand"}`}
              style={{ width: `${Math.round(pulse.ratio * 100)}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground tabular-nums">
            {formatMoney(spent, currency)} of {formatMoney(data.budget.amountCents, currency)}
          </p>
        </>
      )}
      <Link href="/money" className="mt-3 inline-block text-sm font-medium text-brand-deep">
        Open money
      </Link>
      <span className="sr-only">{visibility}</span>
    </Card>
  )
}

function CountKpi({
  icon,
  label,
  value,
  hint,
  href,
  link,
  error,
  empty,
  emptyText,
  action,
}: {
  icon: React.ReactNode
  label: string
  value: string
  hint: string
  href: string
  link: string
  error?: boolean
  empty?: boolean
  emptyText: string
  action: React.ReactNode
}) {
  return (
    <Card>
      <span className="grid size-10 place-items-center rounded-full bg-brand-soft text-brand-deep">{icon}</span>
      <p className="mt-3 text-sm text-muted-foreground">{label}</p>
      {error ? <WidgetError /> : null}
      <p className="mt-1 font-display text-[26px] font-semibold tabular-nums tracking-tight">{value}</p>
      <p className="text-sm text-muted-foreground">{empty ? emptyText : hint}</p>
      <div className="mt-3 flex items-center gap-3">
        <Link href={href} className="text-sm font-medium text-brand-deep">
          {link}
        </Link>
        {empty ? action : null}
      </div>
    </Card>
  )
}

function EventsCard({
  data,
  timeZone,
  today,
  visibility,
}: {
  data: HomePayload | null
  timeZone: string
  today: string
  visibility: "shared" | "private"
}) {
  return (
    <Card>
      <CardHead title="Today’s Events" href="/life/calendar" link="Calendar" />
      {data?.errors.events ? <WidgetError /> : null}
      {!data || data.events.length === 0 ? (
        <div className="mt-4">
          <p className="text-sm text-muted-foreground">Nothing on the calendar today.</p>
          <div className="mt-2">
            <RecordDialog kind="event" today={today} defaultVisibility={visibility} trigger={<TextLink>Add event</TextLink>} />
          </div>
        </div>
      ) : (
        <ol className="mt-4 grid gap-4 border-l border-border pl-4">
          {data.events.map((event) => (
            <li key={event.id} className="relative">
              <span className="absolute -left-[21px] top-1 size-2.5 rounded-full bg-brand" />
              <p className="text-xs tabular-nums text-muted-foreground">{formatTime(event.starts_at, timeZone)}</p>
              <p className="font-medium">{event.title}</p>
              <div className="mt-1">
                <VisibilityPill visibility={event.visibility} />
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  )
}

function BillsCard({
  data,
  currency,
  today,
  visibility,
}: {
  data: HomePayload | null
  currency: string
  today: string
  visibility: "shared" | "private"
}) {
  const rows = data ? upcomingBills(data.bills, data.today) : []
  return (
    <Card>
      <CardHead title="Upcoming Bills" href="/money/bills" link="View all" />
      {data?.errors.bills ? <WidgetError /> : null}
      {rows.length === 0 ? (
        <div className="mt-4">
          <p className="text-sm text-muted-foreground">No bills due this week.</p>
          <div className="mt-2">
            <RecordDialog kind="bill" today={today} defaultVisibility={visibility} trigger={<TextLink>Add bill</TextLink>} />
          </div>
        </div>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {rows.map((bill) => (
            <li key={bill.id} className="flex items-start justify-between gap-3 py-3">
              <div>
                <p className="font-medium">{bill.name}</p>
                <p className="text-xs text-muted-foreground">{formatShortDate(bill.due_on)}</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <StatusChip status={billStatus(bill, data?.today ?? today)} />
                  <VisibilityPill visibility={bill.visibility} />
                </div>
              </div>
              <p className="tabular-nums font-medium">{formatMoney(bill.amount_cents, currency)}</p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function MealsCard({
  data,
  today,
  visibility,
}: {
  data: HomePayload | null
  today: string
  visibility: "shared" | "private"
}) {
  const meal = data ? featuredMeal(data.meals, data.today) : null
  const label =
    meal && data && meal.meal_on === data.today && meal.slot === "dinner"
      ? "Dinner tonight"
      : meal
        ? `${meal.slot[0]?.toUpperCase()}${meal.slot.slice(1)}`
        : "This week"
  return (
    <Card>
      <CardHead title="Weekly Meal Plan" href="/life/meals" link="View plan" />
      {data?.errors.meals ? <WidgetError /> : null}
      <div className="mt-4 flex min-h-36 flex-col justify-end rounded-2xl bg-surface-muted p-4">
        {meal ? (
          <>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className="font-display text-2xl font-semibold tracking-tight">{meal.title}</p>
            <div className="mt-2">
              <VisibilityPill visibility={meal.visibility} />
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">Plan this week’s meals.</p>
            <div className="mt-2">
              <RecordDialog kind="meal" today={today} defaultVisibility={visibility} trigger={<TextLink>Add meal</TextLink>} />
            </div>
          </>
        )}
      </div>
    </Card>
  )
}

function GoalsCard({
  data,
  currency,
  today,
  visibility,
}: {
  data: HomePayload | null
  currency: string
  today: string
  visibility: "shared" | "private"
}) {
  return (
    <Card>
      <CardHead title="Family Goals" href="/money/savings" link="View all" />
      {data?.errors.goals ? <WidgetError /> : null}
      {!data || data.goals.length === 0 ? (
        <div className="mt-4">
          <p className="text-sm text-muted-foreground">Add a savings goal.</p>
          <div className="mt-2">
            <RecordDialog kind="goal" today={today} defaultVisibility={visibility} trigger={<TextLink>Add goal</TextLink>} />
          </div>
        </div>
      ) : (
        <ul className="mt-4 grid gap-4">
          {data.goals.slice(0, 3).map((goal) => {
            const ratio = Math.min(goal.current_cents / goal.target_cents, 1)
            const percent = Math.round(ratio * 100)
            return (
              <li key={goal.id}>
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">{goal.name}</p>
                  <VisibilityPill visibility={goal.visibility} />
                </div>
                <p className="mt-1 text-sm tabular-nums text-muted-foreground">
                  {formatMoney(goal.current_cents, currency)} / {formatMoney(goal.target_cents, currency)} · {percent}%
                </p>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-muted">
                  <div className="h-full rounded-full bg-brand" style={{ width: `${percent}%` }} />
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

function ShoppingCard({
  data,
  today,
  visibility,
}: {
  data: HomePayload | null
  today: string
  visibility: "shared" | "private"
}) {
  const signature = (data?.shopping ?? []).map((item) => `${item.id}:${item.checked_at ?? ""}`).join("|")
  const [seen, setSeen] = useState(signature)
  const [rows, setRows] = useState<ShoppingRow[]>(data?.shopping ?? [])
  if (seen !== signature) {
    setSeen(signature)
    setRows(data?.shopping ?? [])
  }
  const router = useRouter()
  const ordered = [...rows].sort((a, b) => Number(Boolean(a.checked_at)) - Number(Boolean(b.checked_at)))

  return (
    <Card>
      <CardHead title="Shopping List" href="/life/shopping" link="View all" />
      {data?.errors.shopping ? <WidgetError /> : null}
      {ordered.length === 0 ? (
        <div className="mt-4">
          <p className="text-sm text-muted-foreground">Start a shopping list.</p>
        </div>
      ) : (
        <ul className="mt-2">
          {ordered.slice(0, 6).map((item) => (
            <li key={item.id}>
              <label className="flex min-h-11 items-center gap-3 py-1">
                <input
                  type="checkbox"
                  className="size-5 accent-[#249B8A]"
                  checked={Boolean(item.checked_at)}
                  onChange={async (event) => {
                    const checked = event.target.checked
                    setRows((current) =>
                      current.map((row) =>
                        row.id === item.id ? { ...row, checked_at: checked ? new Date().toISOString() : null } : row,
                      ),
                    )
                    const result = await setShoppingChecked(item.id, checked)
                    if (!result.ok) router.refresh()
                  }}
                />
                <span className={item.checked_at ? "text-muted-foreground line-through" : ""}>{item.name}</span>
                <VisibilityPill visibility={item.visibility} />
              </label>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2">
        <RecordDialog kind="shopping" today={today} defaultVisibility={visibility} trigger={<TextLink>Add item</TextLink>} />
      </div>
    </Card>
  )
}

function ActivityCard({ data }: { data: HomePayload | null }) {
  return (
    <Card>
      <CardHead title="Recent Activity" href="/notifications" link="View all" />
      {data?.errors.activity ? <WidgetError /> : null}
      {!data || data.activity.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">Quiet for now. Household updates will gather here.</p>
      ) : (
        <ul className="mt-3 grid gap-3">
          {data.activity.map((item) => (
            <li key={item.id} className="flex gap-3">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-soft text-brand-deep">
                <Check className="size-4" />
              </span>
              <div>
                <p className="text-sm">{item.summary}</p>
                <p className="text-xs text-muted-foreground">
                  {relativeTime(item.created_at)} · <VisibilityPill visibility={item.visibility} />
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

export function TaskChecks({ tasks, today }: { tasks: TaskRow[]; today: string }) {
  const router = useRouter()
  const [rows, setRows] = useState(tasks)
  if (rows.length === 0) return null
  return (
    <ul>
      {rows.map((task) => (
        <li key={task.id}>
          <label className="flex min-h-11 items-center gap-3">
            <input
              type="checkbox"
              className="size-5 accent-[#249B8A]"
              checked={Boolean(task.completed_at)}
              onChange={async (event) => {
                const complete = event.target.checked
                setRows((current) =>
                  current.map((row) =>
                    row.id === task.id ? { ...row, completed_at: complete ? new Date().toISOString() : null } : row,
                  ),
                )
                const result = await setTaskComplete(task.id, complete)
                if (!result.ok) router.refresh()
              }}
            />
            <span className={task.completed_at ? "text-muted-foreground line-through" : ""}>{task.title}</span>
            <VisibilityPill visibility={task.visibility} />
            <span className="sr-only">{today}</span>
          </label>
        </li>
      ))}
    </ul>
  )
}
