import { OTHERS_ADDED, recipeDbMessage } from "@/lib/life/recipes"
import { LINKED_STAYS_SHARED } from "@/lib/life/shopping"
import type { Visibility } from "@/lib/visibility"

const CLIENT_REQUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type MealSaveResult = { ok: true; id?: string; message?: string } | { ok: false; message: string }

type DbError = { code?: string; message?: string; details?: string | null } | null

type MealRpc = {
  rpc(
    fn: string,
    args: {
      p_household_id: string
      p_meal: Record<string, unknown>
      p_lines: unknown[]
      p_apply_to_list: boolean
    },
  ): PromiseLike<{ data: { ok?: boolean; id?: string; conflict?: boolean; added?: number; updated?: number; removed?: number } | null; error: DbError }>
}

export type MealWriter = {
  householdId: string
  canWrite: boolean
  supabase: MealRpc
}

export function isClientRequestId(value: string | null | undefined) {
  return Boolean(value && CLIENT_REQUEST_ID.test(value))
}

function failed(error: DbError, fallback: string): MealSaveResult | null {
  if (!error) return null
  const message = recipeDbMessage(error, fallback)
  if (/others_added/i.test(`${error.message ?? ""} ${error.details ?? ""}`)) return { ok: false, message: OTHERS_ADDED }
  if (/msn_meal_fk|msn_item_fk|linked to a planned meal/i.test(`${error.message ?? ""} ${error.details ?? ""}`)) {
    return { ok: false, message: LINKED_STAYS_SHARED }
  }
  return { ok: false, message }
}

export async function savePlannedMealWith(
  ctx: MealWriter,
  input: {
    id?: string | null
    updatedAt?: string | null
    title: string
    mealOn: string
    slot: string
    servings: number
    visibility: Visibility
    recipeId?: string | null
    applyToList?: boolean
    clientRequestId?: string | null
    lines?: unknown[]
  },
  refresh: () => void,
): Promise<MealSaveResult> {
  if (!ctx.householdId.trim()) return { ok: false, message: "Create your household first." }
  if (!ctx.canWrite) return { ok: false, message: "You don’t have access to change that." }
  const clientRequestId = input.id ? null : input.clientRequestId
  if (!input.id && !isClientRequestId(clientRequestId)) return { ok: false, message: "Couldn’t save that meal." }
  const saved = await ctx.supabase.rpc("save_planned_meal", {
    p_household_id: ctx.householdId,
    p_meal: {
      id: input.id ?? null,
      updated_at: input.updatedAt ?? null,
      title: input.title,
      meal_on: input.mealOn,
      slot: input.slot,
      servings: input.servings,
      visibility: input.visibility,
      recipe_id: input.recipeId ?? null,
      client_request_id: clientRequestId,
    },
    p_lines: input.lines ?? [],
    p_apply_to_list: Boolean(input.applyToList),
  })
  const error = failed(saved.error, "Couldn’t save that meal.")
  if (error) return error
  const data = saved.data
  if (data?.conflict) return { ok: false, message: "This changed. Reload to see the latest." }
  if (!data?.ok) return { ok: false, message: "Couldn’t save that meal." }
  refresh()
  return { ok: true, id: data.id }
}
