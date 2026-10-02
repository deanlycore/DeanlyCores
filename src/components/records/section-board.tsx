"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { documentUrl, markBillPaid, setShoppingChecked, setTaskComplete, updateNote } from "@/lib/actions/records"
import { RecordDialog } from "@/components/create/record-dialog"
import { Button } from "@/components/ui/button"
import { StatusChip, VisibilityPill, WidgetError } from "@/components/ui/pills"
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
import { billStatus, formatMoney, formatShortDate, formatTime, relativeTime } from "@/lib/home/metrics"
import type { Visibility } from "@/lib/visibility"

function Frame({
  title,
  body,
  action,
  error,
  children,
}: {
  title: string
  body: string
  action?: React.ReactNode
  error?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="mx-auto grid max-w-[1120px] gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[28px] font-semibold tracking-tight">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{body}</p>
        </div>
        {action}
      </header>
      <section className="deanly-card p-5">
        {error ? <WidgetError /> : null}
        {children}
      </section>
    </div>
  )
}

function AddButton({ children }: { children: React.ReactNode }) {
  return <Button className="h-11 rounded-button text-primary-foreground">{children}</Button>
}

export function BillsBoard({
  rows,
  currency,
  today,
  visibility,
  error,
}: {
  rows: BillRow[]
  currency: string
  today: string
  visibility: Visibility
  error?: boolean
}) {
  const router = useRouter()
  return (
    <Frame
      title="Bills"
      body="What’s due, said calmly."
      error={error}
      action={<RecordDialog kind="bill" today={today} defaultVisibility={visibility} trigger={<AddButton>Add bill</AddButton>} />}
    >
      {rows.length === 0 ? <p className="text-sm text-muted-foreground">No bills yet. Add the next one when you know the date.</p> : null}
      <ul className="divide-y divide-border">
        {rows.map((bill) => (
          <li key={bill.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div>
              <p className="font-medium">{bill.name}</p>
              <p className="text-sm text-muted-foreground">{formatShortDate(bill.due_on)} · {formatMoney(bill.amount_cents, currency)}</p>
              <div className="mt-1 flex gap-1.5">
                <StatusChip status={billStatus(bill, today)} />
                <VisibilityPill visibility={bill.visibility} />
              </div>
            </div>
            {bill.paid_at ? null : (
              <Button
                type="button"
                variant="outline"
                className="rounded-button"
                onClick={async () => {
                  await markBillPaid(bill.id, true)
                  router.refresh()
                }}
              >
                Mark paid
              </Button>
            )}
          </li>
        ))}
      </ul>
    </Frame>
  )
}

export function TasksBoard({
  rows,
  today,
  visibility,
  error,
}: {
  rows: TaskRow[]
  today: string
  visibility: Visibility
  error?: boolean
}) {
  const router = useRouter()
  const [tasks, setTasks] = useState(rows)
  return (
    <Frame
      title="Tasks"
      body="A short list, not a pile."
      error={error}
      action={<RecordDialog kind="task" today={today} defaultVisibility={visibility} trigger={<AddButton>Add task</AddButton>} />}
    >
      {tasks.length === 0 ? <p className="text-sm text-muted-foreground">Nothing needs a nudge.</p> : null}
      <ul>
        {tasks.map((task) => (
          <li key={task.id}>
            <label className="flex min-h-11 items-center gap-3">
              <input
                type="checkbox"
                className="size-5 accent-[#249B8A]"
                checked={Boolean(task.completed_at)}
                onChange={async (event) => {
                  const complete = event.target.checked
                  setTasks((current) =>
                    current.map((row) =>
                      row.id === task.id ? { ...row, completed_at: complete ? new Date().toISOString() : null } : row,
                    ),
                  )
                  const result = await setTaskComplete(task.id, complete)
                  if (!result.ok) router.refresh()
                }}
              />
              <span className={task.completed_at ? "text-muted-foreground line-through" : ""}>{task.title}</span>
              {task.due_on ? <span className="text-xs text-muted-foreground">{formatShortDate(task.due_on)}</span> : null}
              <VisibilityPill visibility={task.visibility} />
            </label>
          </li>
        ))}
      </ul>
    </Frame>
  )
}

export function EventsBoard({
  rows,
  today,
  timeZone,
  visibility,
  error,
}: {
  rows: EventRow[]
  today: string
  timeZone: string
  visibility: Visibility
  error?: boolean
}) {
  return (
    <Frame
      title="Calendar"
      body="What’s on for the household."
      error={error}
      action={<RecordDialog kind="event" today={today} defaultVisibility={visibility} trigger={<AddButton>Add event</AddButton>} />}
    >
      {rows.length === 0 ? <p className="text-sm text-muted-foreground">The calendar is clear.</p> : null}
      <ul className="divide-y divide-border">
        {rows.map((event) => (
          <li key={event.id} className="flex items-center justify-between gap-3 py-3">
            <div>
              <p className="font-medium">{event.title}</p>
              <p className="text-sm text-muted-foreground">
                {formatTime(event.starts_at, timeZone)}
                {event.location ? ` · ${event.location}` : ""}
              </p>
            </div>
            <VisibilityPill visibility={event.visibility} />
          </li>
        ))}
      </ul>
    </Frame>
  )
}

export function MealsBoard({
  rows,
  today,
  visibility,
  error,
}: {
  rows: MealRow[]
  today: string
  visibility: Visibility
  error?: boolean
}) {
  return (
    <Frame
      title="Meals"
      body="Dinner, and the rest of the week."
      error={error}
      action={<RecordDialog kind="meal" today={today} defaultVisibility={visibility} trigger={<AddButton>Add meal</AddButton>} />}
    >
      {rows.length === 0 ? <p className="text-sm text-muted-foreground">Plan this week’s meals.</p> : null}
      <ul className="divide-y divide-border">
        {rows.map((meal) => (
          <li key={meal.id} className="flex items-center justify-between gap-3 py-3">
            <div>
              <p className="font-medium">{meal.title}</p>
              <p className="text-sm capitalize text-muted-foreground">
                {formatShortDate(meal.meal_on)} · {meal.slot}
              </p>
            </div>
            <VisibilityPill visibility={meal.visibility} />
          </li>
        ))}
      </ul>
    </Frame>
  )
}

export function ShoppingBoard({
  rows,
  today,
  error,
}: {
  rows: ShoppingRow[]
  today: string
  error?: boolean
}) {
  const router = useRouter()
  const [items, setItems] = useState(rows)
  return (
    <Frame
      title="Shopping"
      body="Shared by default. Check items off as you go."
      error={error}
      action={<RecordDialog kind="shopping" today={today} defaultVisibility="shared" trigger={<AddButton>Add item</AddButton>} />}
    >
      {items.length === 0 ? <p className="text-sm text-muted-foreground">Start a shopping list.</p> : null}
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            <label className="flex min-h-11 items-center gap-3">
              <input
                type="checkbox"
                className="size-5 accent-[#249B8A]"
                checked={Boolean(item.checked_at)}
                onChange={async (event) => {
                  const checked = event.target.checked
                  setItems((current) =>
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
    </Frame>
  )
}

export function GoalsBoard({
  rows,
  currency,
  today,
  visibility,
  error,
}: {
  rows: GoalRow[]
  currency: string
  today: string
  visibility: Visibility
  error?: boolean
}) {
  return (
    <Frame
      title="Savings"
      body="What you’re setting aside."
      error={error}
      action={<RecordDialog kind="goal" today={today} defaultVisibility={visibility} trigger={<AddButton>Add goal</AddButton>} />}
    >
      {rows.length === 0 ? <p className="text-sm text-muted-foreground">Add a savings goal.</p> : null}
      <ul className="grid gap-4">
        {rows.map((goal) => {
          const percent = Math.round(Math.min(goal.current_cents / goal.target_cents, 1) * 100)
          return (
            <li key={goal.id}>
              <div className="flex items-center justify-between">
                <p className="font-medium">{goal.name}</p>
                <VisibilityPill visibility={goal.visibility} />
              </div>
              <p className="text-sm tabular-nums text-muted-foreground">
                {formatMoney(goal.current_cents, currency)} / {formatMoney(goal.target_cents, currency)} · {percent}%
              </p>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-muted">
                <div className="h-full rounded-full bg-brand" style={{ width: `${percent}%` }} />
              </div>
            </li>
          )
        })}
      </ul>
    </Frame>
  )
}

export function MoneyBoard({
  rows,
  currency,
  today,
  visibility,
  budgetLabel,
  error,
}: {
  rows: ExpenseRow[]
  currency: string
  today: string
  visibility: Visibility
  budgetLabel: string
  error?: boolean
}) {
  const spent = rows.filter((row) => row.kind === "expense").reduce((sum, row) => sum + row.amount_cents, 0)
  return (
    <Frame
      title="Money"
      body={budgetLabel}
      error={error}
      action={
        <div className="flex flex-wrap gap-2">
          <RecordDialog kind="budget" today={today} defaultVisibility="shared" trigger={<AddButton>Set budget</AddButton>} />
          <RecordDialog kind="expense" today={today} defaultVisibility={visibility} trigger={<Button variant="outline" className="h-11 rounded-button">Log spending</Button>} />
        </div>
      }
    >
      <p className="font-display text-3xl font-semibold tabular-nums">{formatMoney(spent, currency)}</p>
      <p className="text-sm text-muted-foreground">Visible spending in this list.</p>
      <div className="mt-4 flex flex-wrap gap-3 text-sm font-medium text-brand-deep">
        <Link href="/money/bills">Bills</Link>
        <Link href="/money/income">Income</Link>
        <Link href="/money/savings">Savings</Link>
        <Link href="/life/subscriptions">Subscriptions</Link>
      </div>
      <ul className="mt-4 divide-y divide-border">
        {rows.map((row) => (
          <li key={row.id} className="flex items-center justify-between gap-3 py-3">
            <div>
              <p className="font-medium">{row.name}</p>
              <p className="text-sm text-muted-foreground">{formatShortDate(row.spent_on)}</p>
            </div>
            <div className="flex items-center gap-2">
              <VisibilityPill visibility={row.visibility} />
              <span className="tabular-nums">{formatMoney(row.amount_cents, currency)}</span>
            </div>
          </li>
        ))}
      </ul>
    </Frame>
  )
}

export function LedgerBoard({
  title,
  body,
  kind,
  rows,
  currency,
  today,
  visibility,
  error,
}: {
  title: string
  body: string
  kind: "income" | "expense"
  rows: ExpenseRow[]
  currency: string
  today: string
  visibility: Visibility
  error?: boolean
}) {
  return (
    <Frame
      title={title}
      body={body}
      error={error}
      action={<RecordDialog kind={kind} today={today} defaultVisibility={visibility} trigger={<AddButton>{kind === "income" ? "Log income" : "Log spending"}</AddButton>} />}
    >
      {rows.length === 0 ? <p className="text-sm text-muted-foreground">Nothing logged yet.</p> : null}
      <ul className="divide-y divide-border">
        {rows.map((row) => (
          <li key={row.id} className="flex items-center justify-between py-3">
            <div>
              <p className="font-medium">{row.name}</p>
              <p className="text-sm text-muted-foreground">{formatShortDate(row.spent_on)}</p>
            </div>
            <div className="flex items-center gap-2">
              <VisibilityPill visibility={row.visibility} />
              <span className="tabular-nums">{formatMoney(row.amount_cents, currency)}</span>
            </div>
          </li>
        ))}
      </ul>
    </Frame>
  )
}

export function NotesBoard({
  rows,
  today,
  visibility,
  error,
}: {
  rows: NoteRow[]
  today: string
  visibility: Visibility
  error?: boolean
}) {
  return (
    <Frame
      title="Notes"
      body="New notes can stay just yours."
      error={error}
      action={<RecordDialog kind="note" today={today} defaultVisibility={visibility === "shared" ? "private" : visibility} trigger={<AddButton>New note</AddButton>} />}
    >
      {rows.length === 0 ? <p className="text-sm text-muted-foreground">Capture something for the household, or just for you.</p> : null}
      <ul className="grid gap-3">
        {rows.map((note) => (
          <li key={note.id}>
            <Link href={`/notes/${note.id}`} className="block rounded-xl px-1 py-2 hover:bg-surface-muted">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium">{note.title}</p>
                <VisibilityPill visibility={note.visibility} />
              </div>
              <p className="line-clamp-2 text-sm text-muted-foreground">{note.body || "Empty note"}</p>
              <p className="text-xs text-muted-foreground">{relativeTime(note.updated_at)}</p>
            </Link>
          </li>
        ))}
      </ul>
    </Frame>
  )
}

export function NoteEditor({ note }: { note: NoteRow }) {
  const router = useRouter()
  const [message, setMessage] = useState<string | null>(null)
  return (
    <form
      className="mx-auto grid max-w-3xl gap-3"
      action={async (formData) => {
        const result = await updateNote(note.id, formData)
        setMessage(result.ok ? "Saved." : result.message)
        if (result.ok) router.refresh()
      }}
    >
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold">Note</h1>
        <VisibilityPill visibility={note.visibility} />
      </div>
      <input name="title" defaultValue={note.title} className="h-11 rounded-button border border-input bg-surface px-3 font-medium" />
      <textarea name="body" defaultValue={note.body} rows={12} className="rounded-2xl border border-input bg-surface px-3 py-3 text-sm" />
      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
      <Button type="submit" className="h-11 w-fit rounded-button text-primary-foreground">
        Save note
      </Button>
    </form>
  )
}

export function VaultBoard({
  rows,
  today,
  visibility,
  error,
}: {
  rows: VaultRow[]
  today: string
  visibility: Visibility
  error?: boolean
}) {
  const used = rows.reduce((sum, row) => sum + row.size_bytes, 0)
  return (
    <Frame
      title="Vault"
      body="Papers kept close. Personal files start as Just me."
      error={error}
      action={<RecordDialog kind="upload" today={today} defaultVisibility={visibility} trigger={<AddButton>Upload</AddButton>} />}
    >
      <p className="text-sm text-muted-foreground">{(used / (1024 * 1024)).toFixed(1)} MB in view</p>
      {rows.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">Upload a document to the Vault.</p> : null}
      <ul className="mt-3 divide-y divide-border">
        {rows.map((doc) => (
          <li key={doc.id} className="flex items-center justify-between gap-3 py-3">
            <div>
              <p className="font-medium">{doc.name}</p>
              <p className="text-xs text-muted-foreground">{formatShortDate(doc.created_at.slice(0, 10))}</p>
            </div>
            <div className="flex items-center gap-2">
              <VisibilityPill visibility={doc.visibility} />
              <Button
                type="button"
                variant="outline"
                className="rounded-button"
                onClick={async () => {
                  const url = await documentUrl(doc.storage_path)
                  if (url) window.open(url, "_blank", "noopener")
                }}
              >
                Open
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </Frame>
  )
}

export function SubscriptionsBoard({
  rows,
  currency,
  today,
  visibility,
  error,
}: {
  rows: SubscriptionRow[]
  currency: string
  today: string
  visibility: Visibility
  error?: boolean
}) {
  const monthly = rows.filter((row) => row.active).reduce((sum, row) => sum + row.amount_cents, 0)
  return (
    <Frame
      title="Subscriptions"
      body="The ones you still want."
      error={error}
      action={<RecordDialog kind="subscription" today={today} defaultVisibility={visibility} trigger={<AddButton>Add subscription</AddButton>} />}
    >
      <p className="font-display text-3xl font-semibold tabular-nums">{formatMoney(monthly, currency)}</p>
      <p className="text-sm text-muted-foreground">Active monthly total</p>
      {rows.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">No subscriptions yet.</p> : null}
      <ul className="mt-3 divide-y divide-border">
        {rows.map((row) => (
          <li key={row.id} className="flex items-center justify-between py-3">
            <div>
              <p className="font-medium">{row.name}</p>
              <p className="text-sm text-muted-foreground">Renews {formatShortDate(row.renews_on)}</p>
            </div>
            <div className="flex items-center gap-2">
              <VisibilityPill visibility={row.visibility} />
              <span className="tabular-nums">{formatMoney(row.amount_cents, currency)}</span>
            </div>
          </li>
        ))}
      </ul>
    </Frame>
  )
}

export function PlainBoard({ title, body }: { title: string; body: string }) {
  return (
    <Frame title={title} body={body}>
      <p className="text-sm text-muted-foreground">{body}</p>
    </Frame>
  )
}
