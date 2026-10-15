"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { CheckControl, LifeFab, PhoneFabClearance, useLifeVisibility } from "@/components/life/life-chrome"
import { ConfirmRemove, EmptyState, FilterEmpty, MoneyAddButton, MoneyCard, MoneyFrame, RowMenu } from "@/components/money/money-chrome"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { VisibilityPill, WidgetError } from "@/components/ui/pills"
import { deleteShoppingItem, setShoppingChecked } from "@/lib/actions/records"
import {
  createShoppingList,
  markShoppingAtHome,
  moveShoppingItem,
  quickAddShoppingItem,
  saveShoppingItem,
  setShoppingItemChecked,
  setShoppingListVisibility,
} from "@/lib/actions/shopping"
import type { ShoppingRow } from "@/lib/data/home"
import { formatMoney } from "@/lib/home/metrics"
import { filterLife, LIFE_COPY, lifeSubtitle } from "@/lib/life/board"
import {
  LIST_JUST_ME_BLOCKED,
  SHOPPING_CATEGORIES,
  filterShoppingItems,
  formatQty,
  groupShopping,
  shoppingCategory,
  shoppingCategoryLabel,
  shoppingTiles,
  type PantryRow,
  type ShoppingListRow,
  type ShoppingSort,
} from "@/lib/life/shopping"
import type { Visibility } from "@/lib/visibility"
import { cn } from "cn"
import { ChevronDown } from "lucide-react"

export function ShoppingBoard({
  rows,
  lists,
  pantry,
  today,
  currency = "USD",
  error,
}: {
  rows: ShoppingRow[]
  lists: ShoppingListRow[]
  pantry: PantryRow[]
  today: string
  currency?: string
  error?: boolean
}) {
  const router = useRouter()
  const { filter, setFilter } = useLifeVisibility()
  const [listId, setListId] = useState<string | null>(null)
  const [tab, setTab] = useState<"buy" | "home">("buy")
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState<(typeof SHOPPING_CATEGORIES)[number]["id"] | "all">("all")
  const [sort, setSort] = useState<ShoppingSort>("category")
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<ShoppingRow | null>(null)
  const [removing, setRemoving] = useState<ShoppingRow | null>(null)
  const [pendingRemove, setPendingRemove] = useState(false)
  const [offer, setOffer] = useState<ShoppingRow | null>(null)
  const [listNote, setListNote] = useState("")
  const [quick, setQuick] = useState("")
  const [desktop, setDesktop] = useState(false)
  const [newList, setNewList] = useState(false)
  const [listName, setListName] = useState("")

  useEffect(() => {
    const media = window.matchMedia("(min-width: 768px)")
    const apply = () => setDesktop(media.matches)
    apply()
    media.addEventListener("change", apply)
    return () => media.removeEventListener("change", apply)
  }, [])

  const visibleLists = lists.filter((list) => filter === "all" || list.visibility === filter)
  const active = visibleLists.find((list) => list.id === listId) ?? visibleLists[0] ?? null
  const onList = rows.filter((item) => (active ? item.list_id === active.id : true))
  const visible = filterLife(onList, filter)
  const shown = filterShoppingItems(visible, { query, category, sort })
  const tiles = shoppingTiles(visible)
  const grouped = useMemo(() => groupShopping(shown), [shown])
  const homeRows = filterLife(pantry, filter).filter((item) => {
    const needle = query.trim().toLowerCase()
    if (category !== "all" && shoppingCategory(item.category) !== category) return false
    return !needle || item.name.toLowerCase().includes(needle)
  })

  function clearFilters() {
    setFilter("all")
    setQuery("")
    setCategory("all")
  }

  async function checkItem(item: ShoppingRow, checked: boolean) {
    const result = item.updated_at
      ? await setShoppingItemChecked(item.id, checked, item.updated_at)
      : await setShoppingChecked(item.id, checked)
    if (!result.ok) {
      toast(result.message)
      if ("conflict" in result && result.conflict) router.refresh()
      return
    }
    if (checked) setOffer(item)
    else if (offer?.id === item.id) setOffer(null)
    router.refresh()
  }

  async function changeListVisibility(visibility: Visibility) {
    if (!active) return
    setListNote("")
    if (visibility === active.visibility) return
    const result = await setShoppingListVisibility(active.id, visibility, active.updated_at)
    if (!result.ok) {
      if (result.message === LIST_JUST_ME_BLOCKED) setListNote(LIST_JUST_ME_BLOCKED)
      else toast(result.message)
      return
    }
    router.refresh()
  }

  const formOpen = adding || Boolean(editing)

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
            <MoneyAddButton onClick={() => { setEditing(null); setAdding(true) }}>Add item</MoneyAddButton>
          </div>
        }
        chips={
          <>
            <Tile label="Progress" value={tiles.progressTotal === 0 ? "—" : `${tiles.progressBought} of ${tiles.progressTotal}`} />
            <Tile label="Need to buy" value={String(tiles.needToBuy)} />
            <Tile label="Estimated total" value={tiles.pricedCount === 0 ? "—" : formatMoney(tiles.estimatedCents, currency)} />
          </>
        }
        pulse={
          <div className="grid gap-3">
            <div className="flex gap-2 overflow-x-auto">
              {visibleLists.map((list) => (
                <button
                  key={list.id}
                  type="button"
                  aria-pressed={active?.id === list.id}
                  onClick={() => { setListId(list.id); setListNote("") }}
                  className={cn(
                    "inline-flex min-h-11 shrink-0 items-center rounded-full border px-3 text-[13px]",
                    active?.id === list.id ? "border-border bg-surface-muted text-ink" : "border-border bg-surface text-muted-foreground",
                  )}
                >
                  {list.name}
                </button>
              ))}
              <button type="button" className="inline-flex min-h-11 shrink-0 items-center rounded-full border border-border bg-surface px-3 text-[13px] text-muted-foreground" onClick={() => setNewList(true)}>
                New list
              </button>
            </div>
            {active ? (
              <div>
                <div role="radiogroup" aria-label="List visibility" className="inline-flex rounded-full border border-border bg-surface p-0.5">
                  {(["shared", "private"] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={active.visibility === value}
                      onClick={() => void changeListVisibility(value)}
                      className={cn(
                        "min-h-11 rounded-full px-3 text-[13px]",
                        active.visibility === value ? "bg-brand-soft text-on-brand-soft" : "text-muted-foreground",
                      )}
                    >
                      {value === "shared" ? "Shared" : "Just me"}
                    </button>
                  ))}
                </div>
                {listNote ? <p className="mt-2 text-[13px] text-muted-foreground">{listNote}</p> : null}
              </div>
            ) : null}
            <div className="flex gap-2">
              {(["buy", "home"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={tab === value}
                  onClick={() => setTab(value)}
                  className={cn(
                    "min-h-11 rounded-full border px-3 text-[13px]",
                    tab === value ? "border-border bg-surface-muted text-ink" : "border-border bg-surface text-muted-foreground",
                  )}
                >
                  {value === "buy" ? "Need to buy" : "Have at home"}
                </button>
              ))}
            </div>
            <form
              className="flex gap-2"
              onSubmit={(event) => {
                event.preventDefault()
                const body = new FormData()
                body.set("name", quick)
                body.set("list_id", active?.id ?? "")
                body.set("visibility", active?.visibility ?? "shared")
                void quickAddShoppingItem(body).then((result) => {
                  if (!result.ok) toast(result.message)
                  else {
                    setQuick("")
                    router.refresh()
                  }
                })
              }}
            >
              <input
                value={quick}
                onChange={(event) => setQuick(event.target.value)}
                placeholder="Quick add"
                aria-label="Quick add"
                className="h-11 min-w-0 flex-1 rounded-[10px] border border-border bg-surface px-3 text-sm text-ink"
              />
              <button type="submit" className="inline-flex min-h-11 items-center rounded-full bg-brand px-3 text-[13px] text-primary-foreground">
                Add
              </button>
            </form>
            <div className="grid gap-2 md:grid-cols-3">
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search" aria-label="Search items" className="h-11 rounded-[10px] border border-border bg-surface px-3 text-sm text-ink" />
              <select value={category} aria-label="Category" onChange={(event) => setCategory(event.target.value as typeof category)} className="h-11 rounded-[10px] border border-border bg-surface px-3 text-sm text-ink">
                <option value="all">All categories</option>
                {SHOPPING_CATEGORIES.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
              </select>
              <select value={sort} aria-label="Sort" onChange={(event) => setSort(event.target.value as ShoppingSort)} className="h-11 rounded-[10px] border border-border bg-surface px-3 text-sm text-ink">
                <option value="category">Category</option>
                <option value="name">Name</option>
                <option value="price">Price</option>
                <option value="recent">Recent</option>
              </select>
            </div>
          </div>
        }
      >
        {error ? <WidgetError /> : null}
        {offer ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-[12px] border border-border bg-surface px-3 py-3">
            <p className="text-sm text-ink">Mark as at home?</p>
            <div className="flex gap-2">
              <button
                type="button"
                className="min-h-11 rounded-full bg-brand-soft px-3 text-[13px] text-on-brand-soft"
                onClick={() => {
                  void markShoppingAtHome(offer.id).then((result) => {
                    if (!result.ok) toast(result.message)
                    else router.refresh()
                    setOffer(null)
                  })
                }}
              >
                Mark as at home
              </button>
              <button type="button" className="min-h-11 rounded-full px-3 text-[13px] text-muted-foreground" onClick={() => setOffer(null)}>
                Not now
              </button>
            </div>
          </div>
        ) : null}
        {tab === "home" ? (
          homeRows.length === 0 ? <EmptyState copy="Nothing marked at home yet." action={null} /> : homeRows.map((item) => (
            <MoneyCard key={item.id}>
              <div className="py-2">
                <p className="text-[15px] font-medium text-ink">{item.name}</p>
                <p className="text-[13px] text-muted-foreground">{[formatQty(item.qty, item.unit), shoppingCategoryLabel(item.category)].filter(Boolean).join(" · ")}</p>
              </div>
            </MoneyCard>
          ))
        ) : null}
        {tab === "buy" && visible.length === 0 ? (
          rows.length > 0 && (filter !== "all" || query.trim() || category !== "all") ? (
            <FilterEmpty onClear={clearFilters} />
          ) : (
            <EmptyState copy={LIFE_COPY.shoppingEmpty} action={<MoneyAddButton onClick={() => setAdding(true)}>Add item</MoneyAddButton>} />
          )
        ) : null}
        {tab === "buy" && visible.length > 0 && shown.length === 0 ? <FilterEmpty onClear={clearFilters} /> : null}
        {tab === "buy" ? grouped.groups.map((group) => (
          <details key={group.id} open className="group rounded-[12px] border border-border bg-surface">
            <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-3 text-[13px] font-medium text-ink">
              {group.label}
              <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
            </summary>
            <div className="grid gap-2 px-2 pb-2">
              {group.items.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  currency={currency}
                  onCheck={(checked) => void checkItem(item, checked)}
                  onEdit={() => { setAdding(false); setEditing(item) }}
                  onVisibility={(visibility) => {
                    if (!item.updated_at) return
                    void moveShoppingItem(item.id, visibility, item.updated_at).then((result) => {
                      if (!result.ok) toast(result.message)
                      else router.refresh()
                    })
                  }}
                  onRemove={() => setRemoving(item)}
                />
              ))}
            </div>
          </details>
        )) : null}
        {tab === "buy" && grouped.bought.length > 0 ? (
          <details className="group rounded-[12px] border border-border bg-surface">
            <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-3 text-[13px] font-medium text-muted-foreground">
              Bought
              <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
            </summary>
            <div className="grid gap-2 px-2 pb-2">
              {grouped.bought.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  currency={currency}
                  onCheck={(checked) => void checkItem(item, checked)}
                  onEdit={() => { setAdding(false); setEditing(item) }}
                  onVisibility={(visibility) => {
                    if (!item.updated_at) return
                    void moveShoppingItem(item.id, visibility, item.updated_at).then((result) => {
                      if (!result.ok) toast(result.message)
                      else router.refresh()
                    })
                  }}
                  onRemove={() => setRemoving(item)}
                />
              ))}
            </div>
          </details>
        ) : null}
        <ItemSheet
          open={formOpen}
          desktop={desktop}
          today={today}
          listId={active?.id ?? ""}
          item={editing}
          onOpenChange={(open) => {
            if (!open) {
              setAdding(false)
              setEditing(null)
            }
          }}
          onSaved={() => {
            setAdding(false)
            setEditing(null)
            router.refresh()
          }}
        />
        {newList ? (
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              void createShoppingList(listName, filter === "private" ? "private" : "shared").then((result) => {
                if (!result.ok) toast(result.message)
                else {
                  setListName("")
                  setNewList(false)
                  if (result.id) setListId(result.id)
                  router.refresh()
                }
              })
            }}
          >
            <input value={listName} onChange={(event) => setListName(event.target.value)} aria-label="List name" placeholder="List name" className="h-11 flex-1 rounded-[10px] border border-border bg-surface px-3 text-sm text-ink" />
            <button type="submit" className="min-h-11 rounded-full bg-brand px-3 text-[13px] text-primary-foreground">Save list</button>
          </form>
        ) : null}
        <ConfirmRemove
          sheetOnPhone
          open={Boolean(removing)}
          title="Remove this item?"
          pending={pendingRemove}
          onOpenChange={(open) => { if (!open) setRemoving(null) }}
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
        <PhoneFabClearance />
      </MoneyFrame>
      <LifeFab>
        <MoneyAddButton className="h-11 px-4 shadow-soft" onClick={() => { setEditing(null); setAdding(true) }}>
          Add item
        </MoneyAddButton>
      </LifeFab>
    </>
  )
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-28 rounded-[12px] border border-border bg-surface px-3 py-2 shadow-soft">
      <p className="text-[12px] text-muted-foreground">{label}</p>
      <p className="text-[15px] font-medium text-ink">{value}</p>
    </div>
  )
}

function ItemRow({
  item,
  currency,
  onCheck,
  onEdit,
  onVisibility,
  onRemove,
}: {
  item: ShoppingRow
  currency: string
  onCheck: (checked: boolean) => void
  onEdit: () => void
  onVisibility: (visibility: Visibility) => void
  onRemove: () => void
}) {
  const checked = Boolean(item.checked_at)
  return (
    <MoneyCard id={`item-${item.id}`} onOpen={onEdit}>
      <div className="flex items-start gap-1">
        <CheckControl
          checked={checked}
          label={checked ? `Return ${item.name} to the list` : `Check off ${item.name}`}
          onToggle={() => onCheck(!checked)}
        />
        <div className="min-w-0 flex-1 pt-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <p className={cn("text-[15px] font-medium text-ink", checked && "text-muted-foreground line-through")}>{item.name}</p>
            <VisibilityPill visibility={item.visibility} />
          </div>
          <p className="text-[13px] text-muted-foreground">
            {[formatQty(item.qty, item.unit), item.price_cents != null ? formatMoney(item.price_cents, currency) : "", item.notes ?? ""].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="ml-auto pt-1" onClick={(event) => event.stopPropagation()}>
          <RowMenu
            className="max-md:min-h-11 max-md:min-w-11"
            label={item.name}
            visibility={item.visibility}
            onEdit={onEdit}
            onVisibility={onVisibility}
            onRemove={onRemove}
          />
        </div>
      </div>
    </MoneyCard>
  )
}

function ItemSheet({
  open,
  desktop,
  today,
  listId,
  item,
  onOpenChange,
  onSaved,
}: {
  open: boolean
  desktop: boolean
  today: string
  listId: string
  item: ShoppingRow | null
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={desktop ? "right" : "bottom"}
        className={desktop ? "w-[420px] sm:max-w-none data-[side=right]:w-[420px] data-[side=right]:sm:max-w-[420px]" : undefined}
        style={desktop ? { width: 420, maxWidth: 420 } : undefined}
      >
        <SheetHeader>
          <SheetTitle>{item ? "Edit item" : "Add item"}</SheetTitle>
        </SheetHeader>
        <form
          className="grid gap-3 px-4 pb-4"
          action={async (formData) => {
            const result = await saveShoppingItem(formData)
            if (!result.ok) {
              toast(result.message)
              return
            }
            onSaved()
          }}
        >
          <input type="hidden" name="list_id" value={item?.list_id ?? listId} />
          {item ? <input type="hidden" name="id" value={item.id} /> : null}
          {item?.updated_at ? <input type="hidden" name="updated_at" value={item.updated_at} /> : null}
          <label className="grid gap-1 text-sm text-ink">
            Item
            <input name="name" required defaultValue={item?.name ?? ""} className="h-11 rounded-[10px] border border-border bg-surface px-3" />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="grid gap-1 text-sm text-ink">
              Qty
              <input name="qty" inputMode="decimal" defaultValue={item?.qty ?? ""} className="h-11 rounded-[10px] border border-border bg-surface px-3" />
            </label>
            <label className="grid gap-1 text-sm text-ink">
              Unit
              <input name="unit" defaultValue={item?.unit ?? ""} className="h-11 rounded-[10px] border border-border bg-surface px-3" />
            </label>
          </div>
          <label className="grid gap-1 text-sm text-ink">
            Price
            <input name="price" inputMode="decimal" placeholder="Optional" defaultValue={item?.price_cents != null ? (item.price_cents / 100).toFixed(2) : ""} className="h-11 rounded-[10px] border border-border bg-surface px-3" />
          </label>
          <label className="grid gap-1 text-sm text-ink">
            Category
            <select name="category" defaultValue={shoppingCategory(item?.category)} className="h-11 rounded-[10px] border border-border bg-surface px-3">
              {SHOPPING_CATEGORIES.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-sm text-ink">
            Notes
            <input name="notes" defaultValue={item?.notes ?? ""} className="h-11 rounded-[10px] border border-border bg-surface px-3" />
          </label>
          <fieldset className="flex gap-3 text-sm text-ink">
            <label className="inline-flex min-h-11 items-center gap-2">
              <input type="radio" name="visibility" value="shared" defaultChecked={item?.visibility !== "private"} />
              Shared
            </label>
            <label className="inline-flex min-h-11 items-center gap-2">
              <input type="radio" name="visibility" value="private" defaultChecked={item?.visibility === "private"} />
              Just me
            </label>
          </fieldset>
          <button type="submit" className="min-h-11 rounded-full bg-brand px-3 text-[13px] text-primary-foreground">Save</button>
          <span className="sr-only">{today}</span>
        </form>
      </SheetContent>
    </Sheet>
  )
}
