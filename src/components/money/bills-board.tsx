"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { RecordDialog } from "@/components/create/record-dialog"
import { LifeFab, PhoneFabClearance } from "@/components/life/life-chrome"
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
import { LogPaymentDialog, PaymentList, orderedPayments, usePaymentRemoval } from "@/components/money/payment-sheet"
import { deleteBill, markBillPaid, setBillVisibility } from "@/lib/actions/records"
import { formatMoney, formatShortDate } from "@/lib/home/metrics"
import type { BillRow, MoneyPaymentRow } from "@/lib/data/home"
import {
  MONEY_COPY,
  PHONE_MONEY_COPY,
  amountLabel,
  applyVisibility,
  billAmountLeft,
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
  payments = [],
  currency,
  today,
  householdName,
  budgetCents = null,
  paydayDates = [],
  error,
}: {
  rows: BillRow[]
  payments?: MoneyPaymentRow[]
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
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<DecoratedBill | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [paying, setPaying] = useState<DecoratedBill | null>(null)
  const [removing, setRemoving] = useState<BillRow | null>(null)
  const [pendingRemove, setPendingRemove] = useState(false)
  const paymentRemoval = usePaymentRemoval()
  useScrollToItemHash()

  const items = merge(rows).map((bill) => decorateBill(bill, payments, today))
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

  function openEdit(bill: DecoratedBill) {
    setEditing(bill)
    setEditOpen(true)
  }

  return (
    <>
    <MoneyFrame
      phoneLayout
      phoneTouch
      phoneSubtitle={PHONE_MONEY_COPY.bills}
      title="Bills"
      subtitle={moneySubtitle("bills", householdName)}
      action={
        <div className="hidden md:block">
          <MoneyAddButton onClick={() => setAdding(true)}>Add bill</MoneyAddButton>
        </div>
      }
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
      {items.length === 0 ? (
        <EmptyState
          copy={MONEY_COPY.billsEmpty}
          action={
            <div className="hidden md:block">
              <MoneyAddButton onClick={() => setAdding(true)}>Add bill</MoneyAddButton>
            </div>
          }
        />
      ) : null}
      {items.length > 0 && shown.length === 0 ? <FilterEmpty onClear={clearFilters} /> : null}
      {shown.map((bill) => {
        const due = billDueCopy(bill, today)
        const paid = Boolean(bill.paid_at)
        return (
          <MoneyCard key={bill.id} id={`item-${bill.id}`} onOpen={() => openEdit(bill)}>
            <div className="flex min-w-0 max-w-full flex-wrap items-start justify-between gap-3">
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
                  <BillAmount bill={bill} currency={currency} />
                </div>
              </div>
              <div className="ml-auto flex max-w-full flex-wrap items-center justify-end gap-2 max-md:w-full" onClick={(event) => event.stopPropagation()}>
                <p className={cn("whitespace-nowrap text-[13px] tabular-nums", paid ? "text-muted-foreground" : dueTone[due.tone])}>
                  {paid ? formatShortDate(bill.due_on) : due.text}
                </p>
                {paid ? (
                  <span className="inline-flex h-8 items-center rounded-full bg-[color-mix(in_srgb,var(--success)_16%,var(--surface))] px-2.5 text-[13px] font-medium text-success">
                    Paid
                  </span>
                ) : (
                  <>
                    {bill.mine.length === 0 ? (
                      <Button
                        type="button"
                        variant="outline"
                        className="h-9 rounded-[12px] px-3 text-[13px] text-brand-deep max-md:hidden"
                        onClick={() => void markPaid(bill, true)}
                      >
                        Mark paid
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9 max-md:min-h-11 rounded-[12px] px-3 text-[13px] text-brand-deep"
                      onClick={() => setPaying(bill)}
                    >
                      Log payment
                    </Button>
                  </>
                )}
                <RowMenu
                  className="max-md:min-h-11 max-md:min-w-11"
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
      <RecordDialog
        key={adding ? "bill-add" : "bill-idle"}
        kind="bill"
        today={today}
        defaultVisibility="shared"
        sheetOnPhone
        open={adding}
        onOpenChange={setAdding}
      />
      {editing ? (
        <RecordDialog
          key={editing.id}
          kind="bill"
          today={today}
          defaultVisibility="shared"
          sheetOnPhone
          open={editOpen}
          onOpenChange={setEditOpen}
          initial={{
            id: editing.id,
            name: editing.name,
            amount: centsInput(editing.amount_cents),
            date: editing.due_on,
            visibility: editing.visibility,
          }}
          extra={
            <PaymentList payments={editing.mine} currency={currency} onRemove={paymentRemoval.setRemoving} />
          }
        />
      ) : null}
      {paying ? (
        <LogPaymentDialog
          open
          onOpenChange={(open) => {
            if (!open) setPaying(null)
          }}
          parentKind="bill"
          parentId={paying.id}
          remainingCents={paying.left}
          currency={currency}
          today={today}
        />
      ) : null}
      <ConfirmRemove
        sheetOnPhone
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
      {paymentRemoval.dialog}
      <PhoneFabClearance />
    </MoneyFrame>
    <LifeFab>
      <MoneyAddButton className="h-11 px-4 shadow-soft" onClick={() => setAdding(true)}>
        Add bill
      </MoneyAddButton>
    </LifeFab>
    </>
  )
}

type DecoratedBill = BillRow & { mine: MoneyPaymentRow[]; left: number; settled: boolean }

function decorateBill(bill: BillRow, payments: MoneyPaymentRow[], today: string): DecoratedBill {
  const mine = payments.filter((payment) => payment.bill_id === bill.id)
  const left = billAmountLeft(bill, mine)
  const settled = mine.length > 0 ? left === 0 : Boolean(bill.paid_at)
  const paid_at = mine.length === 0 ? bill.paid_at : settled ? (bill.paid_at ?? `${today}T12:00:00.000Z`) : null
  return { ...bill, paid_at, mine, left, settled }
}

function BillAmount({ bill, currency }: { bill: DecoratedBill; currency: string }) {
  const last = orderedPayments(bill.mine).at(-1)
  const lastText = last ? `Last payment ${formatMoney(last.amount_cents, currency)} · ${formatShortDate(last.paid_on)}` : ""
  if (bill.mine.length === 0) {
    return (
      <p className="mt-0.5 text-[13px] tabular-nums text-muted-foreground">
        <span className="md:hidden">{bill.settled ? amountLabel(bill.amount_cents, currency) : `${formatMoney(bill.left, currency)} left`}</span>
        <span className="hidden md:inline">{amountLabel(bill.amount_cents, currency)}</span>
      </p>
    )
  }
  const text = bill.left > 0 ? `${formatMoney(bill.left, currency)} left${lastText ? ` · ${lastText}` : ""}` : lastText
  return <p className="mt-0.5 text-[13px] tabular-nums text-ink">{text}</p>
}
