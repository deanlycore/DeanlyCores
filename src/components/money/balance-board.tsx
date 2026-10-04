"use client"

import { useId, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { LifeFab, PhoneFabClearance } from "@/components/life/life-chrome"
import {
  CategoryLine,
  ConfirmRemove,
  EmptyState,
  FilterEmpty,
  MetricChip,
  MoneyAddButton,
  MoneyCard,
  MoneyCategoryBlock,
  MoneyFrame,
  type MoneyVisibility,
  RowMenu,
  StatusDisc,
  phoneSheetClass,
  useMoneyVisibility,
  useRowPatches,
  useScrollToItemHash,
} from "@/components/money/money-chrome"
import { CategoryField } from "@/components/money/category-field"
import { MoneyGroups } from "@/components/money/money-groups"
import { LogPaymentDialog, PaymentList, usePaymentRemoval } from "@/components/money/payment-sheet"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { VisibilityPill, WidgetError } from "@/components/ui/pills"
import {
  createMoneyCard,
  createMoneyPerson,
  deleteMoneyCard,
  deleteMoneyPerson,
  setMoneyCardVisibility,
  setMoneyPersonVisibility,
  updateMoneyCard,
  updateMoneyPerson,
} from "@/lib/actions/records"
import type { MoneyCardRow, MoneyPaymentRow, MoneyPersonRow } from "@/lib/data/home"
import { formatMoney, formatShortDate } from "@/lib/home/metrics"
import {
  DEBT_COPY,
  applyVisibility,
  balanceMetrics,
  cardLimitLine,
  centsInput,
  groupMoney,
  personGroupLabel,
  remainingCents,
  sortBalances,
} from "@/lib/money/board"
import { placeMoneyCategory } from "@/lib/money/category-match"
import type { Visibility } from "@/lib/visibility"
import { cn } from "cn"

const field = "h-11 rounded-button bg-surface px-3"

type Kind = "card" | "person"

type BalanceRow = {
  id: string
  name: string
  amount_cents: number
  due_on: string | null
  note: string | null
  visibility: Visibility
  payments: MoneyPaymentRow[]
  remaining_cents: number
  category?: string | null
  direction?: "owe" | "owed" | null
  limit_cents?: number | null
}

function attach(
  rows: (MoneyCardRow | MoneyPersonRow)[],
  payments: MoneyPaymentRow[],
  kind: Kind,
): BalanceRow[] {
  const column = kind === "card" ? "card_id" : "person_id"
  return rows.map((row) => {
    const mine = payments.filter((payment) => payment[column] === row.id)
    return {
      id: row.id,
      name: row.name,
      amount_cents: row.amount_cents,
      due_on: row.due_on,
      note: row.note,
      visibility: row.visibility,
      category: "category" in row ? row.category : null,
      direction: "direction" in row ? row.direction : null,
      limit_cents: "limit_cents" in row ? row.limit_cents : null,
      payments: mine,
      remaining_cents: remainingCents(row.amount_cents, mine),
    }
  })
}

function lastPayment(payments: MoneyPaymentRow[]) {
  return [...payments].sort((a, b) => b.paid_on.localeCompare(a.paid_on) || b.id.localeCompare(a.id))[0] ?? null
}

function rowDetail(row: BalanceRow, currency: string) {
  const parts: string[] = []
  if (row.remaining_cents > 0) parts.push(`${formatMoney(row.remaining_cents, currency)} left`)
  if (row.due_on) parts.push(formatShortDate(row.due_on))
  const last = lastPayment(row.payments)
  if (last) parts.push(`Last payment ${formatMoney(last.amount_cents, currency)} · ${formatShortDate(last.paid_on)}`)
  return parts.join(" · ")
}

export function CardsBoard(props: BoardProps<MoneyCardRow>) {
  return <BalanceBoard kind="card" {...props} />
}

export function PeopleBoard(props: BoardProps<MoneyPersonRow>) {
  return <BalanceBoard kind="person" {...props} />
}

type BoardProps<T> = {
  rows: T[]
  payments?: MoneyPaymentRow[]
  currency: string
  today: string
  error?: boolean
  scan?: boolean
  scanFilter?: MoneyVisibility
}

function BalanceBoard({
  kind,
  rows,
  payments = [],
  currency,
  today,
  error,
  scan = false,
  scanFilter,
}: BoardProps<MoneyCardRow | MoneyPersonRow> & { kind: Kind }) {
  const router = useRouter()
  const { filter: storedFilter, setFilter } = useMoneyVisibility()
  const filter = scan ? (scanFilter ?? "all") : storedFilter
  const { patch, merge } = useRowPatches<MoneyCardRow | MoneyPersonRow>()
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<BalanceRow | null>(null)
  const [paying, setPaying] = useState<BalanceRow | null>(null)
  const [removing, setRemoving] = useState<BalanceRow | null>(null)
  const [pendingRemove, setPendingRemove] = useState(false)
  const paymentRemoval = usePaymentRemoval()
  useScrollToItemHash()

  const card = kind === "card"
  const items = attach(merge(rows), payments, kind)
  const visible = sortBalances(applyVisibility(items, filter))
  const groups = card
    ? groupMoney(
        "cards",
        visible,
        (row) => placeMoneyCategory("cards", row.name, row.category),
        (groupRows) => groupRows.reduce((sum, row) => sum + row.remaining_cents, 0),
      )
    : groupMoney(
        "people",
        visible,
        (row) => personGroupLabel(row.direction),
        (groupRows) => groupRows.reduce((sum, row) => sum + row.remaining_cents, 0),
      )
  const usedCategories = items.map((row) => row.category)
  const metrics = balanceMetrics(visible)
  const closedLabel = card ? "paid" : "settled"
  const addLabel = card ? "Add card" : "Add person"
  const subtitle = card ? DEBT_COPY.cardsSubtitle : DEBT_COPY.peopleSubtitle
  const empty = card ? DEBT_COPY.cardsEmpty : DEBT_COPY.peopleEmpty
  const removeTitle = card ? DEBT_COPY.removeCard : DEBT_COPY.removePerson

  async function changeVisibility(row: BalanceRow, visibility: Visibility) {
    const previous = row.visibility
    patch(row.id, { visibility })
    const result = card ? await setMoneyCardVisibility(row.id, visibility) : await setMoneyPersonVisibility(row.id, visibility)
    if (!result.ok) {
      patch(row.id, { visibility: previous })
      toast(result.message)
      return
    }
    router.refresh()
  }

  const list = (
    <>
      {error ? <WidgetError /> : null}
      {scan ? (
        items.length === 0 ? (
          <CategoryLine>{empty}</CategoryLine>
        ) : visible.length === 0 ? (
          <CategoryLine>{DEBT_COPY.filterEmpty}</CategoryLine>
        ) : null
      ) : (
        <>
        {items.length === 0 ? (
          <EmptyState
            copy={empty}
            action={
              <div className="hidden md:block">
                <MoneyAddButton onClick={() => setAdding(true)}>{addLabel}</MoneyAddButton>
              </div>
            }
          />
        ) : null}
        {items.length > 0 && visible.length === 0 ? <FilterEmpty onClear={() => setFilter("all")} /> : null}
        </>
      )}
      {visible.length > 0 ? (
        <MoneyGroups section={card ? "cards" : "people"} sectionCount={visible.length} groups={groups} currency={currency} renderRow={(row) => {
          const open = row.remaining_cents > 0
          const status = open ? DEBT_COPY.stillOpen : card ? DEBT_COPY.paid : DEBT_COPY.settled
          const detail = rowDetail(row, currency)
          const limit = card ? cardLimitLine(row.remaining_cents, row.limit_cents, currency) : null
          return (
            <MoneyCard key={row.id} id={`item-${row.id}`} onOpen={() => setEditing(row)}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <StatusDisc tone={open ? "upcoming" : "paid"} />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[15px] font-medium text-ink">{row.name}</p>
                      <VisibilityPill visibility={row.visibility} />
                    </div>
                    {detail ? <p className="mt-0.5 text-[13px] tabular-nums text-ink">{detail}</p> : null}
                    {limit ? <p className="mt-0.5 text-[13px] tabular-nums text-muted-foreground">{limit}</p> : null}
                  </div>
                </div>
                <div className="ml-auto flex items-center gap-2" onClick={(event) => event.stopPropagation()}>
                  <p className={cn("text-[13px]", open ? "text-muted-foreground" : "text-success")}>{status}</p>
                  {open ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9 max-md:min-h-11 rounded-[12px] px-3 text-[13px] text-brand-deep"
                      onClick={() => setPaying(row)}
                    >
                      Log payment
                    </Button>
                  ) : null}
                  <RowMenu
                    className="max-md:min-h-11 max-md:min-w-11"
                    label={row.name}
                    visibility={row.visibility}
                    onEdit={() => setEditing(row)}
                    onVisibility={(visibility) => void changeVisibility(row, visibility)}
                    onRemove={() => setRemoving(row)}
                  />
                </div>
              </div>
            </MoneyCard>
          )
        }} />
      ) : null}
        <BalanceDialog
          key={adding ? `${kind}-add` : `${kind}-idle`}
          kind={kind}
          categories={usedCategories}
          open={adding}
          onOpenChange={setAdding}
        />
        {editing ? (
          <BalanceDialog
            key={editing.id}
            kind={kind}
            categories={usedCategories}
            currency={currency}
            open
            onOpenChange={(open) => {
              if (!open) setEditing(null)
            }}
            row={editing}
            onPay={() => setPaying(editing)}
            onRemovePayment={paymentRemoval.setRemoving}
            onRemove={() => setRemoving(editing)}
          />
        ) : null}
        {paying ? (
          <LogPaymentDialog
            open
            onOpenChange={(open) => {
              if (!open) setPaying(null)
            }}
            parentKind={kind}
            parentId={paying.id}
            remainingCents={paying.remaining_cents}
            currency={currency}
            today={today}
          />
        ) : null}
        <ConfirmRemove
          sheetOnPhone
          open={Boolean(removing)}
          title={removeTitle}
          pending={pendingRemove}
          onOpenChange={(open) => {
            if (!open) setRemoving(null)
          }}
          onConfirm={async () => {
            if (!removing) return
            setPendingRemove(true)
            const result = card ? await deleteMoneyCard(removing.id) : await deleteMoneyPerson(removing.id)
            setPendingRemove(false)
            if (!result.ok) {
              toast(result.message)
              return
            }
            setRemoving(null)
            setEditing(null)
            router.refresh()
          }}
        />
        {paymentRemoval.dialog}
      </>
  )

  if (scan) {
    return (
      <MoneyCategoryBlock
        id={card ? "money-cards" : "money-people"}
        title={card ? "Cards" : "People"}
        subtitle={subtitle}
        addLabel={addLabel}
        onAdd={() => setAdding(true)}
      >
        {list}
      </MoneyCategoryBlock>
    )
  }

  return (
    <>
      <MoneyFrame
        phoneLayout
        phoneTouch
        title={card ? "Cards" : "People"}
        subtitle={subtitle}
        filter={filter}
        onFilter={setFilter}
        action={
          <div className="hidden md:block">
            <MoneyAddButton onClick={() => setAdding(true)}>{addLabel}</MoneyAddButton>
          </div>
        }
        chips={
          <>
            <MetricChip tone={metrics.open > 0 ? "brand" : "muted"}>
              {metrics.open} open
            </MetricChip>
            {metrics.closed > 0 ? (
              <MetricChip tone="success">
                {metrics.closed} {closedLabel}
              </MetricChip>
            ) : null}
            {card ? <MetricChip tone="sand">{metrics.justMe} just me</MetricChip> : null}
          </>
        }
        pulse={<OpenStrip rows={visible} currency={currency} />}
      >
        {list}
      <PhoneFabClearance />
        <div aria-hidden="true" className="h-12 md:hidden" />
      </MoneyFrame>
      <LifeFab>
        <MoneyAddButton className="h-11 px-4 shadow-soft" onClick={() => setAdding(true)}>
          {addLabel}
        </MoneyAddButton>
      </LifeFab>
    </>
  )
}

function OpenStrip({ rows, currency }: { rows: BalanceRow[]; currency: string }) {
  const open = rows.filter((row) => row.remaining_cents > 0).slice(0, 7)
  return (
    <section className="min-w-0 rounded-[12px] border border-border bg-surface p-4 shadow-soft md:p-[18px]">
      <h2 className="text-[13px] font-medium text-ink">Still open</h2>
      {open.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{DEBT_COPY.pulseEmpty}</p>
      ) : (
        <ul className="mt-3 flex min-w-0 gap-2 overflow-x-auto pb-1">
          {open.map((row) => (
            <li
              key={row.id}
              className="flex min-w-[4.5rem] max-w-[120px] flex-1 flex-col gap-1 rounded-[10px] bg-surface-muted px-2.5 py-2.5 text-ink md:min-w-[80px]"
            >
              <span className="truncate text-[13px] font-medium">{row.name}</span>
              <span className="truncate text-xs tabular-nums text-muted-foreground">{formatMoney(row.remaining_cents, currency)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function BalanceDialog({
  kind,
  open,
  onOpenChange,
  row,
  currency,
  categories = [],
  onPay,
  onRemovePayment,
  onRemove,
}: {
  kind: Kind
  open: boolean
  onOpenChange: (open: boolean) => void
  row?: BalanceRow
  currency?: string
  categories?: (string | null | undefined)[]
  onPay?: () => void
  onRemovePayment?: (payment: MoneyPaymentRow) => void
  onRemove?: () => void
}) {
  const router = useRouter()
  const formId = useId()
  const [message, setMessage] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [entryName, setEntryName] = useState(row?.name ?? "")
  const card = kind === "card"
  const visibilityDefault = row?.visibility ?? "private"

  async function onSubmit(formData: FormData) {
    setPending(true)
    setMessage(null)
    const result = row
      ? card
        ? await updateMoneyCard(row.id, formData)
        : await updateMoneyPerson(row.id, formData)
      : card
        ? await createMoneyCard(formData)
        : await createMoneyPerson(formData)
    setPending(false)
    if (!result.ok) {
      setMessage(result.message)
      return
    }
    toast(DEBT_COPY.saved)
    onOpenChange(false)
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("sm:max-w-[440px]", phoneSheetClass)}>
        <div aria-hidden="true" className="mx-auto h-1 w-10 rounded-full bg-border md:hidden" />
        <DialogHeader>
          <DialogTitle className="font-display">{row ? (card ? "Edit card" : "Edit person") : card ? "Add card" : "Add person"}</DialogTitle>
        </DialogHeader>
        <form key={row?.id ?? "new"} action={onSubmit} className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor={`${formId}-name`}>Name</Label>
            <Input
              id={`${formId}-name`}
              name="name"
              required
              defaultValue={row?.name}
              onChange={card ? (event) => setEntryName(event.target.value) : undefined}
              className={field}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${formId}-amount`}>{card ? "Balance" : "Amount"}</Label>
            <Input
              id={`${formId}-amount`}
              name="amount"
              inputMode="decimal"
              placeholder="0.00"
              required
              defaultValue={row ? centsInput(row.amount_cents) : undefined}
              className={field}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${formId}-due`}>{card ? "Statement date" : "Next date"}</Label>
            <Input id={`${formId}-due`} name="due_on" type="date" required={false} defaultValue={row?.due_on ?? ""} className={field} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${formId}-note`}>Note</Label>
            <Input id={`${formId}-note`} name="note" required={false} defaultValue={row?.note ?? ""} className={field} />
          </div>
          {card ? (
            <>
              <CategoryField section="cards" used={categories} value={row?.category} name={entryName} id={`${formId}-category`} />
              <div className="grid gap-1.5">
                <Label htmlFor={`${formId}-limit`}>Limit</Label>
                <Input
                  id={`${formId}-limit`}
                  name="limit"
                  inputMode="decimal"
                  required={false}
                  defaultValue={row?.limit_cents != null ? centsInput(row.limit_cents) : ""}
                  className={field}
                />
              </div>
            </>
          ) : (
            <fieldset className="grid gap-2">
              <legend className="text-sm">Direction</legend>
              <div className="flex gap-3 text-sm">
                <label className="inline-flex min-h-11 items-center gap-2">
                  <input type="radio" name="direction" value="owe" defaultChecked={row?.direction !== "owed"} />
                  I owe
                </label>
                <label className="inline-flex min-h-11 items-center gap-2">
                  <input type="radio" name="direction" value="owed" defaultChecked={row?.direction === "owed"} />
                  They owe me
                </label>
              </div>
            </fieldset>
          )}
          <fieldset className="grid gap-2">
            <legend className="text-sm">Who can see this</legend>
            <div className="flex gap-3 text-sm">
              <label className="inline-flex min-h-11 items-center gap-2">
                <input type="radio" name="visibility" value="shared" defaultChecked={visibilityDefault === "shared"} />
                Shared
              </label>
              <label className="inline-flex min-h-11 items-center gap-2">
                <input type="radio" name="visibility" value="private" defaultChecked={visibilityDefault !== "shared"} />
                Just me
              </label>
            </div>
            {card ? <p className="text-[13px] text-muted-foreground">{DEBT_COPY.cardsVisibilityHint}</p> : null}
          </fieldset>
          {row && currency && onRemovePayment ? (
            <PaymentList payments={row.payments} currency={currency} onRemove={onRemovePayment} />
          ) : null}
          {row && row.remaining_cents > 0 && onPay ? (
            <Button type="button" variant="outline" className="h-11 rounded-[12px] text-[13px] text-brand-deep" onClick={onPay}>
              Log payment
            </Button>
          ) : null}
          {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
          <div className="flex items-center justify-between gap-2">
            {row && onRemove ? (
              <button type="button" className="inline-flex min-h-11 items-center text-sm font-medium text-danger" onClick={onRemove}>
                Remove
              </button>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" className="h-11 rounded-button" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending} className="h-11 rounded-button text-primary-foreground">
                {pending ? "Saving…" : card ? "Save card" : "Save"}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
