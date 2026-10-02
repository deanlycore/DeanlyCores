"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { RecordDialog } from "@/components/create/record-dialog"
import { VisibilityPill, WidgetError } from "@/components/ui/pills"
import { Button } from "@/components/ui/button"
import {
  ConfirmRemove,
  EmptyState,
  FilterEmpty,
  MetricChip,
  MoneyAddButton,
  MoneyCard,
  MoneyFrame,
  RhythmStrip,
  RowMenu,
  StatusDisc,
  useMoneyVisibility,
  useRowPatches,
  useScrollToItemHash,
} from "@/components/money/money-chrome"
import { deleteBill, markBillPaid, setBillVisibility } from "@/lib/actions/records"
import { formatShortDate } from "@/lib/home/metrics"
import type { BillRow } from "@/lib/data/home"
import {
  MONEY_COPY,
  amountLabel,
  applyVisibility,
  billDueCopy,
  billMatchesChip,
  billMetrics,
  billPulseCells,
  bufferAmount,
  centsInput,
  moneySubtitle,
  sortBills,
  type BillChip,
} from "@/lib/money/board"
import type { Visibility } from "@/lib/visibility"
import { cn } from "cn"

const dueTone = {
  success: "text-success",
  danger: "text-danger",
  warn: "text-warn",
  muted: "text-muted-foreground",
} as const

export function BillsBoard({
  rows,
  currency,
  today,
  householdName,
  budgetCents = null,
  paydayDates = [],
  error,
}: {
  rows: BillRow[]
  currency: string
  today: string
  householdName?: string | null
  budgetCents?: number | null
  paydayDates?: string[]
  error?: boolean
}) {
  const router = useRouter()
  const { filter, setFilter } = useMoneyVisibility()
  const { patch, merge } = useRowPatches<BillRow>()
  const [chip, setChip] = useState<BillChip | null>(null)
  const [editing, setEditing] = useState<BillRow | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [removing, setRemoving] = useState<BillRow | null>(null)
  const [pendingRemove, setPendingRemove] = useState(false)
  useScrollToItemHash()

  const items = merge(rows)
  const visible = sortBills(applyVisibility(items, filter), today)
  const shown = visible.filter((bill) => billMatchesChip(bill, today, chip))
  const metrics = billMetrics(visible, today, budgetCents)
  const pulse = billPulseCells(visible, today, paydayDates, currency)

  function toggleChip(next: BillChip) {
    setChip((current) => (current === next ? null : next))
  }

  function clearFilters() {
    setFilter("all")
    setChip(null)
  }

  async function markPaid(bill: BillRow, paid: boolean) {
    const previous = bill.paid_at
    const nextPaid = paid ? new Date().toISOString() : null
    patch(bill.id, { paid_at: nextPaid })
    const result = await markBillPaid(bill.id, paid)
    if (!result.ok) {
      patch(bill.id, { paid_at: previous })
      toast(result.message)
      return
    }
    if (paid) {
      toast("Marked paid", {
        duration: 5000,
        action: { label: "Undo", onClick: () => void markPaid(bill, false) },
      })
    }
    router.refresh()
  }

  async function changeVisibility(bill: BillRow, visibility: Visibility) {
    const previous = bill.visibility
    patch(bill.id, { visibility })
    const result = await setBillVisibility(bill.id, visibility)
    if (!result.ok) {
      patch(bill.id, { visibility: previous })
      toast(result.message)
      return
    }
    router.refresh()
  }

  function openEdit(bill: BillRow) {
    setEditing(bill)
    setEditOpen(true)
  }

  function addDialog() {
    return (
      <RecordDialog
        kind="bill"
        today={today}
        defaultVisibility="shared"
        trigger={<MoneyAddButton>Add bill</MoneyAddButton>}
      />
    )
  }

  return (
    <MoneyFrame
      title="Bills"
      subtitle={moneySubtitle("bills", householdName)}
      action={addDialog()}
      filter={filter}
      onFilter={setFilter}
      chips={
        <>
          <MetricChip
            tone={metrics.dueThisWeek > 0 ? "brand" : "muted"}
            pressed={chip === "due"}
            onClick={() => toggleChip("due")}
          >
            {metrics.dueThisWeek} due this week
          </MetricChip>
          {metrics.overdue > 0 ? (
            <MetricChip tone="danger" pressed={chip === "overdue"} onClick={() => toggleChip("overdue")}>
              {metrics.overdue} overdue
            </MetricChip>
          ) : null}
          <MetricChip tone="success" pressed={chip === "paid"} onClick={() => toggleChip("paid")}>
            {metrics.paid} paid
          </MetricChip>
          {metrics.bufferCents == null ? null : (
            <MetricChip>
              {MONEY_COPY.buffer} {bufferAmount(metrics.bufferCents, currency)}
            </MetricChip>
          )}
        </>
      }
      pulse={<RhythmStrip title="Due this week" cells={pulse} empty={MONEY_COPY.billsPulseEmpty} />}
    >
      {error ? <WidgetError /> : null}
      {items.length === 0 ? <EmptyState copy={MONEY_COPY.billsEmpty} action={addDialog()} /> : null}
      {items.length > 0 && shown.length === 0 ? <FilterEmpty onClear={clearFilters} /> : null}
      {shown.map((bill) => {
        const due = billDueCopy(bill, today)
        const paid = Boolean(bill.paid_at)
        return (
          <MoneyCard key={bill.id} id={`item-${bill.id}`} onOpen={() => openEdit(bill)}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <StatusDisc tone={paid ? "paid" : due.tone === "danger" ? "overdue" : "upcoming"} />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className="text-left text-[15px] font-medium text-ink"
                      onClick={(event) => {
                        event.stopPropagation()
                        openEdit(bill)
                      }}
                    >
                      {bill.name}
                    </button>
                    <VisibilityPill visibility={bill.visibility} />
                  </div>
                  <p className="mt-0.5 text-[13px] tabular-nums text-muted-foreground">{amountLabel(bill.amount_cents, currency)}</p>
                </div>
              </div>
              <div className="ml-auto flex items-center gap-2" onClick={(event) => event.stopPropagation()}>
                <p className={cn("text-[13px] tabular-nums", paid ? "text-muted-foreground" : dueTone[due.tone])}>
                  {paid ? formatShortDate(bill.due_on) : due.text}
                </p>
                {paid ? (
                  <span className="inline-flex h-8 items-center rounded-full bg-[color-mix(in_srgb,var(--success)_16%,var(--surface))] px-2.5 text-[13px] font-medium text-success">
                    Paid
                  </span>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 rounded-[12px] px-3 text-[13px] text-brand-deep"
                    onClick={() => void markPaid(bill, true)}
                  >
                    Mark paid
                  </Button>
                )}
                <RowMenu
                  label={bill.name}
                  visibility={bill.visibility}
                  onEdit={() => openEdit(bill)}
                  onVisibility={(visibility) => void changeVisibility(bill, visibility)}
                  onRemove={() => setRemoving(bill)}
                />
              </div>
            </div>
          </MoneyCard>
        )
      })}
      {editing ? (
        <RecordDialog
          key={editing.id}
          kind="bill"
          today={today}
          defaultVisibility="shared"
          open={editOpen}
          onOpenChange={setEditOpen}
          initial={{
            id: editing.id,
            name: editing.name,
            amount: centsInput(editing.amount_cents),
            date: editing.due_on,
            visibility: editing.visibility,
          }}
        />
      ) : null}
      <ConfirmRemove
        open={Boolean(removing)}
        title="Remove this bill?"
        pending={pendingRemove}
        onOpenChange={(open) => {
          if (!open) setRemoving(null)
        }}
        onConfirm={async () => {
          if (!removing) return
          setPendingRemove(true)
          const result = await deleteBill(removing.id)
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
