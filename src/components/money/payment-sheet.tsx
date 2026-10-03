"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { ConfirmRemove, phoneSheetClass } from "@/components/money/money-chrome"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { logMoneyPayment, removeMoneyPayment } from "@/lib/actions/records"
import type { MoneyPaymentRow } from "@/lib/data/home"
import { formatMoney, formatShortDate, parseCents } from "@/lib/home/metrics"
import { DEBT_COPY, paymentToast, type PaymentParent } from "@/lib/money/board"
import { cn } from "cn"

const field = "h-11 rounded-button bg-surface px-3"

export function orderedPayments(payments: MoneyPaymentRow[]) {
  return [...payments].sort((a, b) => a.paid_on.localeCompare(b.paid_on) || a.id.localeCompare(b.id))
}

export function PaymentList({
  payments,
  currency,
  onRemove,
}: {
  payments: MoneyPaymentRow[]
  currency: string
  onRemove: (payment: MoneyPaymentRow) => void
}) {
  const ordered = orderedPayments(payments)
  if (ordered.length === 0) return null
  return (
    <div className="grid gap-2">
      <p className="text-sm text-ink">Payments</p>
      <ul className="grid gap-1">
        {ordered.map((payment) => (
          <li key={payment.id} className="flex items-center justify-between gap-3">
            <span className="text-[13px] tabular-nums text-muted-foreground">
              {formatShortDate(payment.paid_on)} · {formatMoney(payment.amount_cents, currency)}
              {payment.note ? ` · ${payment.note}` : ""}
            </span>
            <button
              type="button"
              className="inline-flex min-h-11 shrink-0 items-center text-sm font-medium text-muted-foreground"
              onClick={() => onRemove(payment)}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function LogPaymentDialog({
  open,
  onOpenChange,
  parentKind,
  parentId,
  remainingCents,
  currency,
  today,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  parentKind: PaymentParent
  parentId: string
  remainingCents: number
  currency: string
  today: string
}) {
  const router = useRouter()
  const [amount, setAmount] = useState("")
  const [message, setMessage] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const parsed = parseCents(amount)
  const over = parsed != null && parsed > remainingCents

  async function onSubmit(formData: FormData) {
    setMessage(null)
    const cents = parseCents(formData.get("amount"))
    if (cents == null || cents <= 0) {
      setMessage("Add an amount.")
      return
    }
    if (cents > remainingCents) {
      setMessage(DEBT_COPY.overpay)
      return
    }
    setPending(true)
    formData.set("parent_kind", parentKind)
    formData.set("parent_id", parentId)
    const result = await logMoneyPayment(formData)
    setPending(false)
    if (!result.ok) {
      setMessage(result.message)
      return
    }
    const paid = result.paidCents ?? cents
    const left = result.leftCents ?? remainingCents - cents
    toast(paymentToast(paid, left, currency))
    setAmount("")
    onOpenChange(false)
    router.refresh()
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setAmount("")
          setMessage(null)
        }
        onOpenChange(next)
      }}
    >
      <DialogContent className={cn("sm:max-w-[440px]", phoneSheetClass)}>
        <div aria-hidden="true" className="mx-auto h-1 w-10 rounded-full bg-border md:hidden" />
        <DialogHeader>
          <DialogTitle className="font-display">Log payment</DialogTitle>
        </DialogHeader>
        <form action={onSubmit} className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor={`${parentId}-pay-amount`}>Amount</Label>
            <Input
              id={`${parentId}-pay-amount`}
              name="amount"
              inputMode="decimal"
              placeholder="0.00"
              required
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              className={field}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${parentId}-pay-date`}>Date</Label>
            <Input id={`${parentId}-pay-date`} name="paid_on" type="date" required defaultValue={today} className={field} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${parentId}-pay-note`}>Note</Label>
            <Input id={`${parentId}-pay-note`} name="note" required={false} className={field} />
          </div>
          {over || message === DEBT_COPY.overpay ? <p className="text-sm text-muted-foreground">{DEBT_COPY.overpay}</p> : null}
          {message && message !== DEBT_COPY.overpay ? <p className="text-sm text-muted-foreground">{message}</p> : null}
          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="outline" className="h-11 rounded-button" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || over} className="h-11 rounded-button text-primary-foreground">
              {pending ? "Saving…" : "Save payment"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function usePaymentRemoval() {
  const router = useRouter()
  const [removing, setRemoving] = useState<MoneyPaymentRow | null>(null)
  const [pending, setPending] = useState(false)
  const dialog = (
    <ConfirmRemove
      sheetOnPhone
      open={Boolean(removing)}
      title={DEBT_COPY.removePayment}
      pending={pending}
      onOpenChange={(open) => {
        if (!open) setRemoving(null)
      }}
      onConfirm={async () => {
        if (!removing) return
        setPending(true)
        const result = await removeMoneyPayment(removing.id)
        setPending(false)
        if (!result.ok) {
          toast(result.message)
          return
        }
        setRemoving(null)
        router.refresh()
      }}
    />
  )
  return { setRemoving, dialog }
}
