import { createClient } from "@/lib/supabase/server"
import { requireHousehold } from "@/lib/data/context"
import { isSupabaseConfigured } from "@/lib/supabase/env"
import {
  filterCatalog,
  isCatalogSlug,
  sortCatalog,
  type CatalogFilters,
  type CatalogIngredient,
  type CatalogRecipe,
} from "@/lib/life/catalog"

function asIngredients(value: unknown): CatalogIngredient[] {
  if (!Array.isArray(value)) return []
  const items: CatalogIngredient[] = []
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue
    const row = entry as { text?: unknown; grams?: unknown; fdc_id?: unknown }
    const text = typeof row.text === "string" ? row.text.trim() : ""
    if (!text) continue
    const item: CatalogIngredient = { text }
    if (typeof row.grams === "number" && Number.isFinite(row.grams)) item.grams = row.grams
    if (typeof row.fdc_id === "number" && Number.isInteger(row.fdc_id)) item.fdc_id = row.fdc_id
    items.push(item)
  }
  return items
}

function asSteps(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.filter((step): step is string => typeof step === "string" && step.trim().length > 0).map((step) => step.trim())
}

function asRecipe(row: Record<string, unknown>): CatalogRecipe | null {
  const slug = typeof row.slug === "string" ? row.slug : ""
  if (!isCatalogSlug(slug) || typeof row.name !== "string") return null
  return {
    slug,
    name: row.name,
    cuisine: typeof row.cuisine === "string" ? row.cuisine : "",
    meal_type: typeof row.meal_type === "string" ? row.meal_type : "",
    minutes: Number(row.minutes) || 0,
    servings: Number(row.servings) || 1,
    ingredients: asIngredients(row.ingredients),
    steps: asSteps(row.steps),
    kcal: Number(row.kcal) || 0,
    protein: Number(row.protein) || 0,
    carbs: Number(row.carbs) || 0,
    fat: Number(row.fat) || 0,
    tags: Array.isArray(row.tags) ? row.tags.filter((tag): tag is string => typeof tag === "string") : [],
    image_path: typeof row.image_path === "string" ? row.image_path : `recipes/${slug}.webp`,
    source: typeof row.source === "string" ? row.source : "",
    license: typeof row.license === "string" ? row.license : "",
  }
}

const CATALOG_COLUMNS =
  "slug, name, cuisine, meal_type, minutes, servings, ingredients, steps, kcal, protein, carbs, fat, tags, image_path, source, license"

export async function listCatalog(filters: CatalogFilters) {
  if (!isSupabaseConfigured()) return { recipes: [] as CatalogRecipe[], error: true }
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return { recipes: [] as CatalogRecipe[], error: false }

  const listed = filters.q
    ? await supabase.rpc("search_recipe_catalog", {
        p_query: filters.q,
        p_cuisine: filters.cuisine,
        p_tag: filters.goal,
      })
    : await (filters.goal
        ? supabase.from("recipe_catalog").select(CATALOG_COLUMNS).contains("tags", [filters.goal])
        : supabase.from("recipe_catalog").select(CATALOG_COLUMNS))

  if (listed.error) return { recipes: [], error: true }
  let rows = ((listed.data ?? []) as Record<string, unknown>[]).map(asRecipe).filter((recipe): recipe is CatalogRecipe => Boolean(recipe))
  if (!filters.q && filters.cuisine) rows = rows.filter((recipe) => recipe.cuisine === filters.cuisine)
  const recipes = filters.q
    ? filters.sort === "popular"
      ? rows
      : sortCatalog(rows, filters.sort)
    : filterCatalog(rows, filters)
  return { recipes, error: false }
}

export async function getCatalogRecipe(slug: string) {
  if (!isCatalogSlug(slug)) return { recipe: null, savedId: null as string | null, error: false, canWrite: false }
  if (!isSupabaseConfigured()) return { recipe: null, savedId: null, error: true, canWrite: false }
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return { recipe: null, savedId: null, error: false, canWrite: false }
  const listed = await supabase
    .from("recipe_catalog")
    .select("slug, name, cuisine, meal_type, minutes, servings, ingredients, steps, kcal, protein, carbs, fat, tags, image_path, source, license")
    .eq("slug", slug)
    .maybeSingle()
  if (listed.error) return { recipe: null, savedId: null, error: true, canWrite: false }
  const recipe = listed.data ? asRecipe(listed.data as Record<string, unknown>) : null
  const household = await requireHousehold()
  if (!household || !recipe) return { recipe, savedId: null, error: false, canWrite: household?.canWrite ?? false }
  const saved = await household.supabase
    .from("recipes")
    .select("id")
    .eq("household_id", household.householdId)
    .eq("catalog_slug", slug)
    .limit(1)
    .maybeSingle()
  return {
    recipe,
    savedId: saved.data?.id ? String(saved.data.id) : null,
    error: Boolean(saved.error && !/catalog_slug|does not exist|schema cache/i.test(saved.error.message)),
    canWrite: household.canWrite,
  }
}
