"use server"

import { revalidatePath } from "next/cache"

import { requireHousehold } from "@/lib/data/context"
import { fullWeekday, isCatalogSlug } from "@/lib/life/catalog"
import { savePlannedMealWith } from "@/lib/life/meals-save"
import { SLOTS } from "@/lib/life/planner"

function refresh() {
  revalidatePath("/life/meal-planner")
  revalidatePath("/life/meal-planner/mine")
  revalidatePath("/life/shopping")
  revalidatePath("/home")
}

export async function saveCatalogRecipe(slug: string) {
  const ctx = await requireHousehold()
  if (!ctx) return { ok: false as const, message: "Create your household first." }
  if (!ctx.canWrite) return { ok: false as const, message: "You don’t have access to change that." }
  if (!isCatalogSlug(slug)) return { ok: false as const, message: "That recipe is not available." }
  const copied = await ctx.supabase.rpc("copy_recipe_catalog", { p_slug: slug })
  if (copied.error || !copied.data || typeof copied.data !== "object") {
    return { ok: false as const, message: "Couldn’t save that recipe." }
  }
  const data = copied.data as { ok?: boolean; id?: string; saved?: boolean }
  if (!data.ok || !data.id) return { ok: false as const, message: "Couldn’t save that recipe." }
  refresh()
  return { ok: true as const, id: data.id, saved: true }
}

export async function addCatalogRecipeToWeek(input: {
  slug: string
  mealOn: string
  slot: string
  clientRequestId: string
}) {
  const ctx = await requireHousehold()
  if (!ctx) return { ok: false as const, message: "Create your household first." }
  if (!ctx.canWrite) return { ok: false as const, message: "You don’t have access to change that." }
  if (!isCatalogSlug(input.slug)) return { ok: false as const, message: "That recipe is not available." }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.mealOn) || !SLOTS.includes(input.slot as (typeof SLOTS)[number])) {
    return { ok: false as const, message: "Couldn’t save that meal." }
  }
  const listed = await ctx.supabase.from("recipe_catalog").select("name, servings").eq("slug", input.slug).maybeSingle()
  if (listed.error || !listed.data) return { ok: false as const, message: "Recipes can't load right now." }
  const copied = await saveCatalogRecipe(input.slug)
  if (!copied.ok) return copied
  const saved = await savePlannedMealWith(
    ctx,
    {
      title: String(listed.data.name),
      mealOn: input.mealOn,
      slot: input.slot,
      servings: Number(listed.data.servings) || 1,
      visibility: "shared",
      recipeId: copied.id,
      clientRequestId: input.clientRequestId,
    },
    refresh,
  )
  if (!saved.ok) return saved
  const day = fullWeekday(input.mealOn)
  return { ok: true as const, day: day ?? "that day" }
}
