"use server"

import { revalidatePath } from "next/cache"

import { requireHousehold } from "@/lib/data/context"
import { addRecipeToShoppingWith, copyCatalogRecipeWith, deleteRecipeWith, saveRecipeWith, type RecipeActionResult } from "@/lib/life/recipes-save"
import type { Visibility } from "@/lib/visibility"

async function gate() {
  const ctx = await requireHousehold()
  if (!ctx) return { ok: false as const, message: "Create your household first.", ctx: null }
  return { ok: true as const, message: "", ctx }
}

function refresh() {
  revalidatePath("/life/recipes", "layout")
  revalidatePath("/life/shopping")
  revalidatePath("/home")
}

export async function saveRecipe(formData: FormData): Promise<RecipeActionResult> {
  const ready = await gate()
  if (!ready.ctx) return ready
  return saveRecipeWith(ready.ctx, formData, refresh)
}

export async function deleteRecipe(id: string): Promise<RecipeActionResult> {
  const ready = await gate()
  if (!ready.ctx) return ready
  return deleteRecipeWith(ready.ctx, id, refresh)
}

export async function copyCatalogRecipe(catalogRecipeId: string, visibility: Visibility): Promise<RecipeActionResult> {
  const ready = await gate()
  if (!ready.ctx) return ready
  return copyCatalogRecipeWith(ready.ctx, catalogRecipeId, visibility, refresh)
}

export async function addRecipeToShopping(recipeId: string): Promise<RecipeActionResult> {
  const ready = await gate()
  if (!ready.ctx) return ready
  return addRecipeToShoppingWith(ready.ctx, recipeId, refresh)
}
