"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { documentUrl, updateNote } from "@/lib/actions/records"
import { RecordDialog } from "@/components/create/record-dialog"
import { Button } from "@/components/ui/button"
import { VisibilityPill, WidgetError } from "@/components/ui/pills"
import type { ExpenseRow, NoteRow, VaultRow } from "@/lib/data/home"
import { formatMoney, formatShortDate, relativeTime } from "@/lib/home/metrics"
import type { Visibility } from "@/lib/visibility"
import { cn } from "cn"

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

function AddButton({ children, className, type = "button", ...props }: React.ComponentProps<"button">) {
  return (
    <Button type={type} className={cn("h-11 rounded-button text-primary-foreground", className)} {...props}>
      {children}
    </Button>
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
        <Link href="/money/subscriptions">Subscriptions</Link>
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

export function PlainBoard({ title, body }: { title: string; body: string }) {
  return (
    <Frame title={title} body={body}>
      <p className="text-sm text-muted-foreground">{body}</p>
    </Frame>
  )
}
