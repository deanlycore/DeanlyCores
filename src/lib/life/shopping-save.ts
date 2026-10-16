import { KEEP_MINE_ATTEMPTS, LIST_UNAVAILABLE, STALE_SAVE, shoppingCategory, shoppingDbMessage, type ShoppingCategory } from "@/lib/life/shopping"
import { normalizeTypedAmount } from "@/lib/life/units"
import { defaultVisibilityFor, type Visibility } from "@/lib/visibility"

export type ShoppingActionResult = { ok: true; id?: string } | { ok: false; message: string; conflict?: boolean }

type DbError = { code?: string; message: string; details?: string | null } | null

type ShoppingTable = {
  select(columns?: string): ShoppingTable
  eq(column: string, value: unknown): ShoppingTable
  insert(values: object): ShoppingTable
  update(values: object): ShoppingTable
  maybeSingle(): Promise<{ data: { id: string; visibility?: Visibility; updated_at?: string } | null; error: DbError }>
  single(): Promise<{ data: { id: string } | null; error: DbError }>
  then<TResult1 = { data: { id: string; name: string; visibility: Visibility }[] | null; error: DbError }, TResult2 = never>(
    onfulfilled?: ((value: { data: { id: string; name: string; visibility: Visibility }[] | null; error: DbError }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2>
}

export type ShoppingWriter = {
  supabase: { from(table: string): unknown }
  householdId: string
  userId: string
  lastVisibility: Visibility
}

function fromTable(ctx: ShoppingWriter, table: string) {
  return ctx.supabase.from(table) as ShoppingTable
}

function visibilityOf(value: FormDataEntryValue | null, fallback: Visibility): Visibility {
  return value === "private" || value === "shared" ? value : fallback
}

function textOf(value: FormDataEntryValue | null, max: number) {
  const text = String(value ?? "").trim()
  if (!text || text.length > max) return null
  return text
}

function amountFields(formData: FormData) {
  const manual_amount_raw = textOf(formData.get("manual_amount_raw"), 40)
  const manual_unit_raw = textOf(formData.get("manual_unit_raw"), 24)
  const normalized = normalizeTypedAmount(manual_amount_raw, manual_unit_raw)
  return {
    manual_amount_raw,
    manual_unit_raw,
    manual_qty: normalized.qty,
    manual_unit: normalized.unit,
  }
}

function centsOf(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim()
  if (!raw) return null
  const amount = Number(raw)
  if (!Number.isFinite(amount) || amount < 0 || amount > 1000000) return Number.NaN
  return Math.round(amount * 100)
}

function categoryOf(value: FormDataEntryValue | null): ShoppingCategory {
  return shoppingCategory(String(value ?? ""))
}

export function failed(
  error: { code?: string; message: string; details?: string | null } | null,
  fallback: string,
): { ok: false; message: string } | null {
  if (!error) return null
  return { ok: false, message: shoppingDbMessage(error, fallback) }
}

type FreshRow = { id: string; name: string; visibility: Visibility }

export async function writeFresh(ctx: ShoppingWriter, id: string, fields: Record<string, unknown>) {
  let saved: { error: { code?: string; message: string; details?: string | null } | null; data: FreshRow[] | null } = {
    error: null,
    data: [],
  }
  for (let attempt = 0; attempt < KEEP_MINE_ATTEMPTS; attempt += 1) {
    const current = await fromTable(ctx, "shopping_items").select("updated_at").eq("id", id).maybeSingle()
    if (current.error) return { error: current.error, data: null }
    const stamp = current.data?.updated_at
    if (!stamp) return { error: null, data: [] }
    saved = await fromTable(ctx, "shopping_items")
      .update(fields)
      .eq("id", id)
      .eq("updated_at", stamp)
      .select("id, name, visibility")
    if (saved.error || saved.data?.length) return saved
  }
  return saved
}

export function finishFresh(
  saved: { error: { code?: string; message: string; details?: string | null } | null; data: { id: string }[] | null },
  id: string,
  refresh: () => void,
): ShoppingActionResult | null {
  const blocked = failed(saved.error, "Couldn’t save that item.")
  if (blocked) return blocked
  if (!saved.data?.length) return { ok: false, message: STALE_SAVE, conflict: true }
  refresh()
  return { ok: true, id }
}

function stale(error: { code?: string; message: string } | null, count: number | null) {
  if (error) return false
  return count === 0
}

function knownScope(ctx: ShoppingWriter, visibility: Visibility) {
  if (!ctx.householdId.trim() || !ctx.userId.trim()) return false
  return visibility === "shared" || visibility === "private"
}

export async function listForVisibility(ctx: ShoppingWriter, listId: string, visibility: Visibility) {
  if (!knownScope(ctx, visibility)) return { id: null as string | null, missing: false }
  if (listId) {
    let requested = fromTable(ctx, "shopping_lists")
      .select("id, visibility")
      .eq("id", listId)
      .eq("household_id", ctx.householdId)
      .eq("visibility", visibility)
    if (visibility === "private") requested = requested.eq("created_by", ctx.userId)
    const list = await requested.maybeSingle()
    if (list.error) return { id: null, missing: false }
    if (list.data?.id && list.data.visibility === visibility) return { id: list.data.id, missing: false }
  }
  let query = fromTable(ctx, "shopping_lists")
    .select("id")
    .eq("household_id", ctx.householdId)
    .eq("visibility", visibility)
    .eq("is_default", true)
  if (visibility === "private") query = query.eq("created_by", ctx.userId)
  const found = await query.maybeSingle()
  if (found.error) return { id: null, missing: false }
  if (found.data?.id) return { id: found.data.id, missing: false }
  const created = await fromTable(ctx, "shopping_lists")
    .insert({
      household_id: ctx.householdId,
      created_by: ctx.userId,
      visibility,
      name: "Groceries",
      is_default: true,
    })
    .select("id")
    .single()
  if (created.error || !created.data?.id) return { id: null, missing: false }
  return { id: created.data.id, missing: false }
}

async function loadStamp(
  ctx: ShoppingWriter,
  id: string | null,
  updatedAt: string | null,
): Promise<null | { ok: false; message: string; conflict?: boolean } | { ok: true; id: string; updatedAt: string }> {
  if (!id) return null
  if (!updatedAt) return { ok: false, message: STALE_SAVE, conflict: true }
  const current = await fromTable(ctx, "shopping_items").select("id").eq("id", id).eq("updated_at", updatedAt).maybeSingle()
  const blocked = failed(current.error, "Couldn’t save that item.")
  if (blocked) return blocked
  if (!current.data) return { ok: false, message: STALE_SAVE, conflict: true }
  return { ok: true, id, updatedAt }
}

async function keepEditedShoppingItem(
  ctx: ShoppingWriter,
  formData: FormData,
  id: string,
  name: string,
  price: number | null,
  refresh: () => void,
): Promise<ShoppingActionResult> {
  const visibility = visibilityOf(formData.get("visibility"), defaultVisibilityFor("shopping", ctx.lastVisibility))
  const requestedList = textOf(formData.get("list_id"), 80) ?? ""
  const list = await listForVisibility(ctx, requestedList, visibility)
  if (!list.id) return { ok: false, message: LIST_UNAVAILABLE }
  const fields = {
    name,
    ...amountFields(formData),
    price_cents: price,
    notes: textOf(formData.get("notes"), 500),
    category: categoryOf(formData.get("category")),
    visibility,
    list_id: list.id,
    user_edited: true,
  }
  const saved = await writeFresh(ctx, id, fields)
  return finishFresh(saved, id, refresh) ?? { ok: false, message: "Couldn’t save that item." }
}

export async function saveShoppingItemWith(
  ctx: ShoppingWriter,
  formData: FormData,
  refresh: () => void,
): Promise<ShoppingActionResult> {
  const name = textOf(formData.get("name"), 140)
  if (!name) return { ok: false, message: "Add an item." }
  const price = centsOf(formData.get("price"))
  if (Number.isNaN(price)) return { ok: false, message: "Use a price of zero or more." }
  const id = textOf(formData.get("id"), 80)
  if (id && formData.get("keep_mine") === "1") return keepEditedShoppingItem(ctx, formData, id, name, price, refresh)
  const updatedAt = textOf(formData.get("updated_at"), 80)
  const stamp = await loadStamp(ctx, id, updatedAt)
  if (stamp && !stamp.ok) return stamp
  const visibility = visibilityOf(formData.get("visibility"), defaultVisibilityFor("shopping", ctx.lastVisibility))
  const requestedList = textOf(formData.get("list_id"), 80) ?? ""
  const list = await listForVisibility(ctx, requestedList, visibility)
  if (!list.id) return { ok: false, message: LIST_UNAVAILABLE }
  const fromRecipe = formData.get("source") === "auto"
  const autoAmount = normalizeTypedAmount(textOf(formData.get("auto_qty"), 40), textOf(formData.get("auto_unit"), 24))
  const fields = fromRecipe
    ? {
        name,
        manual_amount_raw: null,
        manual_unit_raw: null,
        manual_qty: null,
        manual_unit: null,
        auto_qty: autoAmount.qty,
        auto_unit: autoAmount.unit,
        price_cents: price,
        notes: textOf(formData.get("notes"), 500),
        category: categoryOf(formData.get("category")),
        visibility,
        list_id: list.id,
        user_edited: false,
        source: "auto" as const,
      }
    : {
        name,
        ...amountFields(formData),
        price_cents: price,
        notes: textOf(formData.get("notes"), 500),
        category: categoryOf(formData.get("category")),
        visibility,
        list_id: list.id,
        user_edited: true,
      }
  if (!stamp?.ok) {
    const created = await fromTable(ctx, "shopping_items")
      .insert({
        household_id: ctx.householdId,
        owner_id: ctx.userId,
        source: "manual",
        ...fields,
      })
      .select("id")
      .single()
    const blocked = failed(created.error, "Couldn’t add that item.")
    if (blocked || !created.data) return blocked ?? { ok: false, message: "Couldn’t add that item." }
    refresh()
    return { ok: true, id: created.data.id }
  }
  const saved = await fromTable(ctx, "shopping_items")
    .update(fields)
    .eq("id", stamp.id)
    .eq("updated_at", stamp.updatedAt)
    .select("id")
  const blocked = failed(saved.error, "Couldn’t save that item.")
  if (blocked) return blocked
  if (stale(saved.error, saved.data?.length ?? 0)) return { ok: false, message: STALE_SAVE, conflict: true }
  refresh()
  return { ok: true, id: stamp.id }
}
