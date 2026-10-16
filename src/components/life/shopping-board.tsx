"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { CheckControl, LifeFab, PhoneFabClearance, useLifeVisibility } from "@/components/life/life-chrome"
import { StaleChoice } from "@/components/life/stale-choice"
import { ConfirmRemove, EmptyState, FilterEmpty, MoneyAddButton, MoneyCard, MoneyFrame, RowMenu } from "@/components/money/money-chrome"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { WidgetError } from "@/components/ui/pills"
import { deleteShoppingItem, setShoppingChecked } from "@/lib/actions/records"
import {
  createShoppingList,
  keepShoppingItemChecked,
  keepShoppingItemMove,
  markShoppingAtHome,
  moveShoppingItem,
  quickAddShoppingItem,
  saveShoppingItem,
  setShoppingItemChecked,
  setShoppingListVisibility,
  updateShoppingList,
} from "@/lib/actions/shopping"
import type { ShoppingRow } from "@/lib/data/home"
import { formatMoney } from "@/lib/home/metrics"
import { filterLife, LIFE_COPY, lifeSubtitle } from "@/lib/life/board"
import {
  ITEM_UNAVAILABLE,
  LIST_JUST_ME_BLOCKED,
  LIST_UNAVAILABLE,
  SHOPPING_CATEGORIES,
  calmShoppingMessage,
  displayAmount,
  filterShoppingItems,
  groupShopping,
  shoppingCategory,
  shoppingCategoryLabel,
  shoppingTiles,
  unpricedLabel,
  type PantryRow,
  type ShoppingListRow,
  type ShoppingSort,
} from "@/lib/life/shopping"
import type { Visibility } from "@/lib/visibility"
import { cn } from "cn"
import { ChevronDown } from "lucide-react"

function reportShoppingError(message: string, onNote?: (note: string) => void) {
  const calm = calmShoppingMessage(message)
  if (onNote && (calm === LIST_JUST_ME_BLOCKED || calm === LIST_UNAVAILABLE || calm === ITEM_UNAVAILABLE)) {
    onNote(calm)
    return
  }
  toast(calm)
}

type ItemMine =
  | { kind: "check"; checked: boolean }
  | { kind: "move"; visibility: Visibility }
  | { kind: "edit"; fields: Record<string, string> }

type ItemConflict = { id: string; mine: ItemMine }

function formFields(formData: FormData) {
  const fields: Record<string, string> = {}
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") fields[key] = value
  }
  return fields
}

function keptForm(id: string, fields: Record<string, string>) {
  const body = new FormData()
  for (const [key, value] of Object.entries(fields)) body.set(key, value)
  body.set("id", id)
  body.set("keep_mine", "1")
  return body
}

export function ShoppingBoard({
  rows,
  lists,
  pantry,
  today,
  currency = "USD",
  error,
  homePrompt = false,
  promptName,
  staleItemId = null,
}: {
  rows: ShoppingRow[]
  lists: ShoppingListRow[]
  pantry: PantryRow[]
  today: string
  currency?: string
  error?: boolean
  homePrompt?: boolean
  promptName?: string
  staleItemId?: string | null
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
  const [conflict, setConflict] = useState<ItemConflict | null>(() =>
    staleItemId ? { id: staleItemId, mine: { kind: "check", checked: true } } : null,
  )
  const keeping = useRef(false)
  const [quick, setQuick] = useState("")
  const [desktop, setDesktop] = useState(false)
  const [listPanel, setListPanel] = useState<null | "new" | "edit">(null)
  const [listName, setListName] = useState("")
  const [newVisibility, setNewVisibility] = useState<Visibility>("shared")

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
  const grouped = groupShopping(shown)
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

  function noteStale(itemId: string, mine: ItemMine, result: { ok: boolean; conflict?: unknown }) {
    if (result.ok || result.conflict !== true) return false
    setConflict({ id: itemId, mine })
    return true
  }

  async function checkItem(item: ShoppingRow, checked: boolean) {
    const result = item.updated_at
      ? await setShoppingItemChecked(item.id, checked, item.updated_at)
      : await setShoppingChecked(item.id, checked)
    if (!result.ok) {
      if ("conflict" in result && noteStale(item.id, { kind: "check", checked }, result)) return
      reportShoppingError(result.message)
      return
    }
    if (checked) setOffer(item)
    else if (offer?.id === item.id) setOffer(null)
    router.refresh()
  }

  async function keepMine() {
    if (!conflict || keeping.current) return
    keeping.current = true
    const pending = conflict
    try {
      const result = pending.mine.kind === "check"
        ? await keepShoppingItemChecked(pending.id, pending.mine.checked)
        : pending.mine.kind === "move"
          ? await keepShoppingItemMove(pending.id, pending.mine.visibility)
          : await saveShoppingItem(keptForm(pending.id, pending.mine.fields))
      if (!result.ok) {
        if (result.conflict) return
        reportShoppingError(result.message)
        return
      }
      setConflict(null)
      if (pending.mine.kind === "check" && pending.mine.checked) {
        const item = rows.find((row) => row.id === pending.id)
        if (item) setOffer(item)
      }
      router.refresh()
    } finally {
      keeping.current = false
    }
  }

  function useTheirs() {
    setConflict(null)
    router.refresh()
  }

  async function changeListVisibility(visibility: Visibility) {
    if (!active) return
    setListNote("")
    if (visibility === active.visibility) return
    const result = await setShoppingListVisibility(active.id, visibility, active.updated_at)
    if (!result.ok) {
      reportShoppingError(result.message, setListNote)
      return
    }
    router.refresh()
  }

  const formOpen = adding || Boolean(editing)

  return (
    <>
      <MoneyFrame
        phoneTouch
        compact
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
            <Tile label="Progress" value={tiles.progressTotal === 0 ? "—" : `${tiles.progressBought} of ${tiles.progressTotal} bought`} />
            <Tile label="Need to buy" value={String(tiles.needToBuy)} />
            <Tile label="Estimated total" value={tiles.pricedCount === 0 ? "—" : formatMoney(tiles.estimatedCents, currency)} detail={unpricedLabel(tiles.unpricedCount)} />
          </>
        }
        pulse={
          <div className="grid min-w-0 grid-cols-1 gap-2">
            <div className="flex min-w-0 flex-wrap gap-2">
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
              <button
                type="button"
                className="inline-flex h-9 shrink-0 items-center rounded-full border border-border bg-surface px-3 text-[13px] text-muted-foreground"
                onClick={() => {
                  setListName("")
                  setNewVisibility(filter === "private" ? "private" : "shared")
                  setListNote("")
                  setListPanel("new")
                }}
              >
                New list
              </button>
              {active ? (
                <button
                  type="button"
                  className="inline-flex h-9 shrink-0 items-center rounded-full border border-border bg-surface px-3 text-[13px] text-muted-foreground"
                  onClick={() => {
                    setListName(active.name)
                    setListNote("")
                    setListPanel("edit")
                  }}
                >
                  Edit list
                </button>
              ) : null}
            </div>
            <div className="flex min-w-0 flex-wrap gap-2">
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
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 md:flex">
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search" aria-label="Search items" className="col-start-1 h-10 min-w-0 w-full rounded-[10px] border border-border bg-surface px-3 text-sm text-ink md:w-auto md:flex-1" />
              <button
                type="button"
                aria-label={`Sort by ${sort}`}
                onClick={() => {
                  const order: ShoppingSort[] = ["category", "name", "price", "recent"]
                  setSort(order[(order.indexOf(sort) + 1) % order.length] ?? "category")
                }}
                className="col-start-2 inline-flex h-9 shrink-0 items-center rounded-full border border-border bg-surface px-3 text-[13px] text-muted-foreground md:order-last"
              >
                Sort
              </button>
              <form
                className="col-span-2 flex min-w-0 gap-2 md:col-span-1 md:flex-1"
                onSubmit={(event) => {
                  event.preventDefault()
                  const body = new FormData()
                  body.set("name", quick)
                  body.set("list_id", active?.id ?? "")
                  body.set("visibility", active?.visibility ?? "shared")
                  void quickAddShoppingItem(body).then((result) => {
                    if (!result.ok) reportShoppingError(result.message)
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
                  className="h-10 min-w-0 flex-1 rounded-[10px] border border-border bg-surface px-3 text-sm text-ink"
                />
                <button type="submit" className="inline-flex h-10 shrink-0 items-center rounded-full bg-brand px-3 text-[13px] text-primary-foreground">
                  Add
                </button>
              </form>
            </div>
            <div className="flex min-w-0 gap-1.5 overflow-x-auto">
              <button type="button" aria-pressed={category === "all"} onClick={() => setCategory("all")} className={cn("inline-flex h-9 shrink-0 items-center rounded-full border px-3 text-[13px]", category === "all" ? "border-border bg-surface-muted text-ink" : "border-border bg-surface text-muted-foreground")}>
                All
              </button>
              {SHOPPING_CATEGORIES.map((entry) => (
                <button key={entry.id} type="button" aria-pressed={category === entry.id} onClick={() => setCategory(entry.id)} className={cn("inline-flex h-9 shrink-0 items-center rounded-full border px-3 text-[13px]", category === entry.id ? "border-border bg-surface-muted text-ink" : "border-border bg-surface text-muted-foreground")}>
                  {entry.label}
                </button>
              ))}
            </div>
          </div>
        }
      >
        {error ? <WidgetError /> : null}
        {offer || homePrompt ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-[12px] border border-border bg-surface px-3 py-3">
            <p className="text-sm text-ink">{`${offer?.name ?? promptName ?? "Item"} bought. Mark as at home?`}</p>
            <div className="flex gap-2">
              <button
                type="button"
                className="min-h-11 rounded-full bg-brand-soft px-3 text-[13px] text-on-brand-soft"
                onClick={() => {
                  if (!offer) {
                    setOffer(null)
                    return
                  }
                  void markShoppingAtHome(offer.id).then((result) => {
                    if (!result.ok) reportShoppingError(result.message)
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
                <p className="text-[13px] text-muted-foreground">{[displayAmount(item), shoppingCategoryLabel(item.category), item.visibility === "private" ? "Just me" : ""].filter(Boolean).join(" · ")}</p>
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
                  conflict={conflict?.id === item.id}
                  onUseTheirs={useTheirs}
                  onKeepMine={() => void keepMine()}
                  onCheck={(checked) => void checkItem(item, checked)}
                  onEdit={() => { setAdding(false); setEditing(item) }}
                  onVisibility={(visibility) => {
                    if (!item.updated_at) return
                    void moveShoppingItem(item.id, visibility, item.updated_at).then((result) => {
                      if (!result.ok) {
                        if (!noteStale(item.id, { kind: "move", visibility }, result)) reportShoppingError(result.message)
                        return
                      }
                      router.refresh()
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
                  conflict={conflict?.id === item.id}
                  onUseTheirs={useTheirs}
                  onKeepMine={() => void keepMine()}
                  onCheck={(checked) => void checkItem(item, checked)}
                  onEdit={() => { setAdding(false); setEditing(item) }}
                  onVisibility={(visibility) => {
                    if (!item.updated_at) return
                    void moveShoppingItem(item.id, visibility, item.updated_at).then((result) => {
                      if (!result.ok) {
                        if (!noteStale(item.id, { kind: "move", visibility }, result)) reportShoppingError(result.message)
                        return
                      }
                      router.refresh()
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
          onConflict={(id, fields) => {
            setAdding(false)
            setEditing(null)
            setConflict({ id, mine: { kind: "edit", fields } })
          }}
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
        <ListSheet
          open={listPanel != null}
          desktop={desktop}
          mode={listPanel ?? "new"}
          name={listName}
          visibility={listPanel === "edit" ? (active?.visibility ?? "shared") : newVisibility}
          note={listNote}
          onName={setListName}
          onVisibility={(visibility) => {
            if (listPanel === "edit") void changeListVisibility(visibility)
            else setNewVisibility(visibility)
          }}
          onOpenChange={(open) => {
            if (!open) setListPanel(null)
          }}
          onSave={() => {
            if (listPanel === "edit" && active) {
              void updateShoppingList(active.id, listName, active.updated_at).then((result) => {
                if (!result.ok) reportShoppingError(result.message, setListNote)
                else {
                  setListPanel(null)
                  router.refresh()
                }
              })
              return
            }
            void createShoppingList(listName, newVisibility).then((result) => {
              if (!result.ok) reportShoppingError(result.message, setListNote)
              else {
                setListName("")
                setListPanel(null)
                if (result.id) setListId(result.id)
                router.refresh()
              }
            })
          }}
        />
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
              reportShoppingError(result.message)
              return
            }
            setRemoving(null)
            router.refresh()
          }}
        />
        <div aria-hidden="true" className="h-16 md:hidden" />
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

function Tile({ label, value, detail }: { label: string; value: string; detail?: string | null }) {
  return (
    <div className="min-w-28 flex-1 rounded-[12px] border border-border bg-surface px-3 py-2 shadow-soft max-md:min-w-0 max-md:px-2 max-md:py-1.5">
      <p className="text-[12px] text-muted-foreground">{label}</p>
      <p className="text-[15px] font-medium text-ink">{value}</p>
      {detail ? <p className="text-[12px] text-muted-foreground">{detail}</p> : null}
    </div>
  )
}

function ItemRow({
  item,
  currency,
  conflict,
  onCheck,
  onEdit,
  onVisibility,
  onRemove,
  onUseTheirs,
  onKeepMine,
}: {
  item: ShoppingRow
  currency: string
  conflict: boolean
  onCheck: (checked: boolean) => void
  onEdit: () => void
  onVisibility: (visibility: Visibility) => void
  onRemove: () => void
  onUseTheirs: () => void
  onKeepMine: () => void
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
          <p className={cn("text-[15px] font-medium text-ink", checked && "text-muted-foreground line-through")}>{item.name}</p>
          {item.for_meal ? <p className="text-[13px] text-muted-foreground">For {item.for_meal}</p> : null}
          <p className="text-[13px] text-muted-foreground">
            {[displayAmount(item), item.price_cents != null ? formatMoney(item.price_cents, currency) : "", item.notes ?? "", item.visibility === "private" ? "Just me" : ""].filter(Boolean).join(" · ")}
          </p>
          {conflict ? <StaleChoice onUseTheirs={onUseTheirs} onKeepMine={onKeepMine} /> : null}
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

function CategoryField({ initial }: { initial: ReturnType<typeof shoppingCategory> }) {
  const [value, setValue] = useState(initial)
  return (
    <div className="grid gap-1">
      <p className="text-sm text-ink">Category</p>
      <input type="hidden" name="category" value={value} />
      <div className="flex gap-1.5 overflow-x-auto">
        {SHOPPING_CATEGORIES.map((entry) => (
          <button
            key={entry.id}
            type="button"
            aria-pressed={value === entry.id}
            onClick={() => setValue(entry.id)}
            className={cn(
              "inline-flex h-9 shrink-0 items-center rounded-full border px-3 text-[13px]",
              value === entry.id ? "border-border bg-surface-muted text-ink" : "border-border bg-surface text-muted-foreground",
            )}
          >
            {entry.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function ListSheet({
  open,
  desktop,
  mode,
  name,
  visibility,
  note,
  onName,
  onVisibility,
  onOpenChange,
  onSave,
}: {
  open: boolean
  desktop: boolean
  mode: "new" | "edit"
  name: string
  visibility: Visibility
  note: string
  onName: (value: string) => void
  onVisibility: (visibility: Visibility) => void
  onOpenChange: (open: boolean) => void
  onSave: () => void
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={desktop ? "right" : "bottom"}
        className={desktop ? "w-[420px] sm:max-w-none data-[side=right]:w-[420px] data-[side=right]:sm:max-w-[420px]" : undefined}
        style={desktop ? { width: 420, maxWidth: 420 } : undefined}
      >
        <SheetHeader>
          <SheetTitle>{mode === "edit" ? "Edit list" : "New list"}</SheetTitle>
        </SheetHeader>
        <form
          className="grid gap-3 px-4 pb-4"
          onSubmit={(event) => {
            event.preventDefault()
            onSave()
          }}
        >
          <label className="grid gap-1 text-sm text-ink">
            Name
            <input value={name} onChange={(event) => onName(event.target.value)} aria-label="List name" className="h-11 rounded-[10px] border border-border bg-surface px-3" />
          </label>
          <div>
            <div role="radiogroup" aria-label="List visibility" className="inline-flex rounded-full border border-border bg-surface p-0.5">
              {(["shared", "private"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={visibility === value}
                  onClick={() => onVisibility(value)}
                  className={cn(
                    "min-h-11 rounded-full px-3 text-[13px]",
                    visibility === value ? "bg-brand-soft text-on-brand-soft" : "text-muted-foreground",
                  )}
                >
                  {value === "shared" ? "Shared" : "Just me"}
                </button>
              ))}
            </div>
            {note ? <p className="mt-2 text-[13px] text-muted-foreground">{note}</p> : null}
          </div>
          <button type="submit" className="min-h-11 rounded-full bg-brand px-3 text-[13px] text-primary-foreground">Save list</button>
        </form>
      </SheetContent>
    </Sheet>
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
  onConflict,
}: {
  open: boolean
  desktop: boolean
  today: string
  listId: string
  item: ShoppingRow | null
  onOpenChange: (open: boolean) => void
  onSaved: () => void
  onConflict: (id: string, fields: Record<string, string>) => void
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
              if (result.conflict && item) {
                onConflict(item.id, formFields(formData))
                return
              }
              reportShoppingError(result.message)
              return
            }
            onSaved()
          }}
        >
          <input type="hidden" name="list_id" value={item?.list_id ?? listId} />
          {item ? <input type="hidden" name="id" value={item.id} /> : null}
          {item ? <input type="hidden" name="updated_at" value={item.updated_at ?? ""} /> : null}
          <label className="grid gap-1 text-sm text-ink">
            Item
            <input name="name" required defaultValue={item?.name ?? ""} className="h-11 rounded-[10px] border border-border bg-surface px-3" />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="grid gap-1 text-sm text-ink">
              Qty
              <input name="manual_amount_raw" defaultValue={item?.manual_amount_raw ?? ""} placeholder="1/2" className="h-11 rounded-[10px] border border-border bg-surface px-3" />
            </label>
            <label className="grid gap-1 text-sm text-ink">
              Unit
              <input name="manual_unit_raw" defaultValue={item?.manual_unit_raw ?? ""} placeholder="g" className="h-11 rounded-[10px] border border-border bg-surface px-3" />
            </label>
          </div>
          <label className="grid gap-1 text-sm text-ink">
            Price
            <input name="price" inputMode="decimal" placeholder="Optional" defaultValue={item?.price_cents != null ? (item.price_cents / 100).toFixed(2) : ""} className="h-11 rounded-[10px] border border-border bg-surface px-3" />
          </label>
          <CategoryField initial={shoppingCategory(item?.category)} />
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
