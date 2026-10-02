"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { RecordDialog } from "@/components/create/record-dialog"
import { CheckControl, LifeFab, useLifeVisibility } from "@/components/life/life-chrome"
import { VisibilityPill, WidgetError } from "@/components/ui/pills"
import {
  ConfirmRemove,
  EmptyState,
  FilterEmpty,
  MetricChip,
  MoneyAddButton,
  MoneyCard,
  MoneyFrame,
  RowMenu,
  useRowPatches,
  useScrollToItemHash,
} from "@/components/money/money-chrome"
import { deleteShoppingItem, setShoppingChecked, setShoppingVisibility } from "@/lib/actions/records"
import type { ShoppingRow } from "@/lib/data/home"
import {
  LIFE_COPY,
  filterLife,
  lifeSubtitle,
  shoppingMetrics,
  shoppingPulseItems,
  shoppingStores,
  sortShopping,
} from "@/lib/life/board"
import type { Visibility } from "@/lib/visibility"
import { cn } from "cn"

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
  const { filter, setFilter } = useLifeVisibility()
  const { patch, merge } = useRowPatches<ShoppingRow>()
  const [store, setStore] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<ShoppingRow | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [removing, setRemoving] = useState<ShoppingRow | null>(null)
  const [pendingRemove, setPendingRemove] = useState(false)
  useScrollToItemHash()

  const items = merge(rows)
  const visible = sortShopping(filterLife(items, filter))
  const stores = shoppingStores(visible)
  const shown = store ? visible.filter((item) => item.store === store) : visible
  const metrics = shoppingMetrics(visible)
  const pulseItems = shoppingPulseItems(visible)

  function clearFilters() {
    setFilter("all")
    setStore(null)
  }

  async function checkItem(item: ShoppingRow, checked: boolean) {
    const previous = item.checked_at
    const next = checked ? new Date().toISOString() : null
    patch(item.id, { checked_at: next })
    const result = await setShoppingChecked(item.id, checked)
    if (!result.ok) {
      patch(item.id, { checked_at: previous })
      toast(result.message)
      return
    }
    if (checked) {
      toast(LIFE_COPY.checkedOff, {
        duration: 5000,
        action: { label: "Undo", onClick: () => void checkItem(item, false) },
      })
    }
    router.refresh()
  }

  async function changeVisibility(item: ShoppingRow, visibility: Visibility) {
    const previous = item.visibility
    patch(item.id, { visibility })
    const result = await setShoppingVisibility(item.id, visibility)
    if (!result.ok) {
      patch(item.id, { visibility: previous })
      toast(result.message)
      return
    }
    router.refresh()
  }

  function openEdit(item: ShoppingRow) {
    setEditing(item)
    setEditOpen(true)
  }

  const knownStore = editing?.store === "Costco" || editing?.store === "Smith's" ? editing.store : editing?.store ? "other" : ""

  return (
    <>
      <MoneyFrame
        phoneTouch
        title="Shopping"
        subtitle={lifeSubtitle("shopping")}
        filter={filter}
        onFilter={setFilter}
        action={
          <div className="hidden md:block">
            <MoneyAddButton onClick={() => setAdding(true)}>Add item</MoneyAddButton>
          </div>
        }
        chips={
          <>
            <MetricChip tone={metrics.open > 0 ? "brand" : "muted"}>{metrics.open} open</MetricChip>
            <MetricChip tone="success">{metrics.done} done</MetricChip>
          </>
        }
        pulse={
          <section className="rounded-[12px] border border-border bg-surface p-4 shadow-soft md:p-[18px]">
            <h2 className="text-[13px] font-medium text-ink">{stores.length > 0 ? "Stores" : "Need soon"}</h2>
            {stores.length > 0 ? (
              <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                {stores.map((name) => (
                  <button
                    key={name}
                    type="button"
                    aria-pressed={store === name}
                    onClick={() => setStore((current) => (current === name ? null : name))}
                    className={cn(
                      "inline-flex min-h-11 shrink-0 items-center rounded-full border px-3 text-[13px] md:min-h-8",
                      store === name
                        ? "border-border bg-surface-muted text-ink"
                        : "border-border bg-surface text-muted-foreground",
                    )}
                  >
                    {name}
                  </button>
                ))}
              </div>
            ) : pulseItems.length > 0 ? (
              <ul className="mt-3 flex gap-2 overflow-x-auto pb-1">
                {pulseItems.map((item) => (
                  <li
                    key={item.id}
                    className="flex min-w-16 shrink-0 flex-col gap-1 rounded-[10px] bg-surface-muted px-2.5 py-2.5 text-ink"
                  >
                    <span className="truncate text-[13px] font-medium">{item.name}</span>
                    <span className="text-xs text-muted-foreground">{item.need_soon ? "Need soon" : "Open"}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">{LIFE_COPY.shoppingPulseEmpty}</p>
            )}
          </section>
        }
      >
        {error ? <WidgetError /> : null}
        {items.length === 0 ? (
          <EmptyState copy={LIFE_COPY.shoppingEmpty} action={<MoneyAddButton onClick={() => setAdding(true)}>Add item</MoneyAddButton>} />
        ) : null}
        {items.length > 0 && shown.length === 0 ? <FilterEmpty onClear={clearFilters} /> : null}
        {shown.map((item) => {
          const checked = Boolean(item.checked_at)
          return (
            <MoneyCard key={item.id} id={`item-${item.id}`} onOpen={() => openEdit(item)}>
              <div className="flex items-start gap-1">
                <CheckControl
                  checked={checked}
                  label={checked ? `Return ${item.name} to the list` : `Check off ${item.name}`}
                  onToggle={() => void checkItem(item, !checked)}
                />
                <div className="min-w-0 flex-1 pt-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className={cn("text-[15px] font-medium text-ink", checked && "text-muted-foreground line-through")}>{item.name}</p>
                    <VisibilityPill visibility={item.visibility} />
                    {item.store ? (
                      <span className="inline-flex h-6 items-center rounded-full bg-surface-muted px-2 text-xs text-muted-foreground">
                        {item.store}
                      </span>
                    ) : null}
                  </div>
                  {item.need_soon && !checked ? <p className="mt-0.5 text-[13px] text-muted-foreground">Need soon</p> : null}
                </div>
                <div className="ml-auto pt-1" onClick={(event) => event.stopPropagation()}>
                  <RowMenu
                    className="max-md:min-h-11 max-md:min-w-11"
                    label={item.name}
                    visibility={item.visibility}
                    onEdit={() => openEdit(item)}
                    onVisibility={(visibility) => void changeVisibility(item, visibility)}
                    onRemove={() => setRemoving(item)}
                  />
                </div>
              </div>
            </MoneyCard>
          )
        })}
        <RecordDialog
          key={adding ? "shopping-add" : "shopping-idle"}
          kind="shopping"
          today={today}
          defaultVisibility="shared"
          sheetOnPhone
          open={adding}
          onOpenChange={setAdding}
        />
        {editing ? (
          <RecordDialog
            key={editing.id}
            kind="shopping"
            today={today}
            defaultVisibility="shared"
            sheetOnPhone
            open={editOpen}
            onOpenChange={setEditOpen}
            initial={{
              id: editing.id,
              name: editing.name,
              store: knownStore,
              storeOther: knownStore === "other" ? editing.store ?? "" : "",
              needSoon: Boolean(editing.need_soon),
              visibility: editing.visibility,
            }}
          />
        ) : null}
        <ConfirmRemove
          sheetOnPhone
          open={Boolean(removing)}
          title="Remove this item?"
          pending={pendingRemove}
          onOpenChange={(open) => {
            if (!open) setRemoving(null)
          }}
          onConfirm={async () => {
            if (!removing) return
            setPendingRemove(true)
            const result = await deleteShoppingItem(removing.id)
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
      <LifeFab>
        <MoneyAddButton className="h-11 px-4 shadow-soft" onClick={() => setAdding(true)}>
          Add item
        </MoneyAddButton>
      </LifeFab>
    </>
  )
}
