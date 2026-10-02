"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { RecordDialog } from "@/components/create/record-dialog"
import {
  ConfirmRemove,
  EmptyState,
  FilterEmpty,
  MetricChip,
  MoneyAddButton,
  MoneyCard,
  MoneyFrame,
  RowMenu,
  StatusDisc,
  useMoneyVisibility,
  useRowPatches,
  useScrollToItemHash,
} from "@/components/money/money-chrome"
import { VisibilityPill, WidgetError } from "@/components/ui/pills"
import { deleteExpense, setExpenseVisibility } from "@/lib/actions/records"
import type { ExpenseRow } from "@/lib/data/home"
import { formatMoney, formatShortDate } from "@/lib/home/metrics"
import {
  MONEY_COPY,
  applyVisibility,
  centsInput,
  incomeGap,
  incomeMetrics,
  moneySubtitle,
  nextPayEvents,
  sortIncome,
} from "@/lib/money/board"
import type { Visibility } from "@/lib/visibility"

export function IncomeBoard({
  rows,
  currency,
  today,
  householdName,
  error,
}: {
  rows: ExpenseRow[]
  currency: string
  today: string
  householdName?: string | null
  error?: boolean
}) {
  const router = useRouter()
  const { filter, setFilter } = useMoneyVisibility()
  const { patch, merge } = useRowPatches<ExpenseRow>()
  const [editing, setEditing] = useState<ExpenseRow | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [removing, setRemoving] = useState<ExpenseRow | null>(null)
  const [pendingRemove, setPendingRemove] = useState(false)
  useScrollToItemHash()

  const items = merge(rows)
  const visible = sortIncome(applyVisibility(items, filter), today)
  const metrics = incomeMetrics(visible, today)
  const upcoming = nextPayEvents(visible, today)

  function addDialog() {
    return (
      <RecordDialog
        kind="income"
        today={today}
        defaultVisibility="shared"
        trigger={<MoneyAddButton>Add income</MoneyAddButton>}
      />
    )
  }

  function openEdit(row: ExpenseRow) {
    setEditing(row)
    setEditOpen(true)
  }

  async function changeVisibility(row: ExpenseRow, visibility: Visibility) {
    const previous = row.visibility
    patch(row.id, { visibility })
    const result = await setExpenseVisibility(row.id, visibility)
    if (!result.ok) {
      patch(row.id, { visibility: previous })
      toast(result.message)
      return
    }
    router.refresh()
  }

  return (
    <MoneyFrame
      title="Income"
      subtitle={moneySubtitle("income", householdName)}
      action={addDialog()}
      filter={filter}
      onFilter={setFilter}
      chips={
        <>
          <MetricChip tone={metrics.nextDate ? "brand" : "muted"}>
            {metrics.nextDate ? `Next pay ${formatShortDate(metrics.nextDate)}` : "No payday yet"}
          </MetricChip>
          <MetricChip>This month {formatMoney(metrics.monthCents, currency)}</MetricChip>
        </>
      }
      pulse={
        <section className="rounded-[12px] border border-border bg-surface p-4 shadow-soft md:p-[18px]">
          <h2 className="text-[13px] font-medium text-ink">Next payday</h2>
          {upcoming.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">{MONEY_COPY.incomePulseEmpty}</p>
          ) : (
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {upcoming.map((row) => (
                <li key={row.id} className="rounded-[10px] bg-brand-soft px-3 py-3 text-on-brand-soft">
                  <p className="text-[13px] tabular-nums">{formatShortDate(row.spent_on)}</p>
                  <p className="mt-1 text-[15px] font-medium">{row.name}</p>
                  <p className="text-[13px] tabular-nums">{formatMoney(row.amount_cents, currency)}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      }
    >
      {error ? <WidgetError /> : null}
      {items.length === 0 ? <EmptyState copy={MONEY_COPY.incomeEmpty} action={addDialog()} /> : null}
      {items.length > 0 && visible.length === 0 ? <FilterEmpty onClear={() => setFilter("all")} /> : null}
      {visible.map((row) => {
        const expected = row.spent_on > today
        const gap = incomeGap(row, visible, today)
        return (
          <MoneyCard key={row.id} id={`item-${row.id}`} onOpen={() => openEdit(row)}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <StatusDisc tone={expected ? "upcoming" : "paid"} />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className="text-left text-[15px] font-medium text-ink"
                      onClick={(event) => {
                        event.stopPropagation()
                        openEdit(row)
                      }}
                    >
                      {row.name}
                    </button>
                    <VisibilityPill visibility={row.visibility} />
                  </div>
                  <p className="mt-0.5 text-[13px] tabular-nums text-muted-foreground">
                    {formatMoney(row.amount_cents, currency)} · {formatShortDate(row.spent_on)}
                  </p>
                  {gap ? <p className="mt-1 text-xs text-warn">{gap}</p> : null}
                </div>
              </div>
              <div className="ml-auto flex items-center gap-2" onClick={(event) => event.stopPropagation()}>
                <p className={expected ? "text-[13px] text-muted-foreground" : "text-[13px] text-success"}>
                  {expected ? "Expected" : "Received"}
                </p>
                <RowMenu
                  label={row.name}
                  visibility={row.visibility}
                  onEdit={() => openEdit(row)}
                  onVisibility={(visibility) => void changeVisibility(row, visibility)}
                  onRemove={() => setRemoving(row)}
                />
              </div>
            </div>
          </MoneyCard>
        )
      })}
      {editing ? (
        <RecordDialog
          key={editing.id}
          kind="income"
          today={today}
          defaultVisibility="shared"
          open={editOpen}
          onOpenChange={setEditOpen}
          initial={{
            id: editing.id,
            name: editing.name,
            amount: centsInput(editing.amount_cents),
            date: editing.spent_on,
            visibility: editing.visibility,
          }}
        />
      ) : null}
      <ConfirmRemove
        open={Boolean(removing)}
        title="Remove this income?"
        pending={pendingRemove}
        onOpenChange={(open) => {
          if (!open) setRemoving(null)
        }}
        onConfirm={async () => {
          if (!removing) return
          setPendingRemove(true)
          const result = await deleteExpense(removing.id)
          setPendingRemove(false)
          if (!result.ok) {
            toast(result.message)
            return
          }
          setRemoving(null)
          router.refresh()
        }}
      />
    </MoneyFrame>
  )
}
