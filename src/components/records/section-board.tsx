"use client"

import Link from "next/link"

import { documentUrl } from "@/lib/actions/records"
import { RecordDialog } from "@/components/create/record-dialog"
import { Button } from "@/components/ui/button"
import { VisibilityPill, WidgetError } from "@/components/ui/pills"
import type { ExpenseRow, VaultRow } from "@/lib/data/home"
import { formatMoney, formatShortDate } from "@/lib/home/metrics"
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
