export const CATALOG_SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/

export const CATALOG_CUISINES = ["Mexican", "Italian", "Asian", "American", "Mediterranean", "Breakfast"] as const

export const CATALOG_GOALS = [
  { id: "lose_weight", label: "Lose weight" },
  { id: "gain_weight", label: "Gain weight" },
  { id: "high_protein", label: "High protein" },
  { id: "quick", label: "Quick" },
  { id: "vegetarian", label: "Vegetarian" },
] as const

export const CATALOG_SORTS = [
  { id: "popular", label: "Popular" },
  { id: "quickest", label: "Quickest" },
  { id: "calories", label: "Fewest calories" },
  { id: "protein", label: "Most protein" },
] as const

export const SHELF_MIN = 4
export const SHELF_LIMIT = 8
export const CATALOG_PAGE_SIZE = 24
export const CATALOG_PHOTO_WIDTH = 960
export const CATALOG_PHOTO_HEIGHT = 720

export const SEARCH_PLACEHOLDER = "Search recipes or ingredients"
export const NO_RESULTS_COPY = "No recipes match that. Try fewer filters."
export const CATALOG_ERROR_COPY = "Recipes can't load right now."
export const SAVED_TO_MINE = "Saved to My recipes."
export const PHOTO_ILLUSTRATION_LINE = "Photos are AI-generated illustrations."

export const MEAL_PLANNER_HREF = "/life/meal-planner"
export const MEAL_PLANNER_TABS = [
  { id: "week", label: "This week", suffix: "" },
  { id: "browse", label: "Browse", suffix: "/browse" },
  { id: "mine", label: "My recipes", suffix: "/mine" },
] as const

export type CatalogGoal = (typeof CATALOG_GOALS)[number]["id"]
export type CatalogSort = (typeof CATALOG_SORTS)[number]["id"]
export type MealPlannerTab = (typeof MEAL_PLANNER_TABS)[number]["id"]

export type CatalogIngredient = {
  text: string
  grams?: number
  fdc_id?: number
}

export type CatalogRecipe = {
  slug: string
  name: string
  cuisine: string
  meal_type: string
  minutes: number
  servings: number
  ingredients: CatalogIngredient[]
  steps: string[]
  kcal: number
  protein: number
  carbs: number
  fat: number
  tags: string[]
  image_path: string
  source: string
  license: string
}

export type CatalogFilters = {
  q: string
  cuisine: string | null
  goal: CatalogGoal | null
  sort: CatalogSort
}

const FULL_WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const

export function isCatalogSlug(value: string) {
  return CATALOG_SLUG.test(value)
}

export function fullWeekday(date: string) {
  const [year, month, day] = date.split("-").map(Number)
  if (!year || !month || !day) return null
  const utc = new Date(Date.UTC(year, month - 1, day))
  if (Number.isNaN(utc.getTime())) return null
  return FULL_WEEKDAYS[utc.getUTCDay()] ?? null
}

export function addedDayLabel(value: string | null | undefined) {
  if (!value || !FULL_WEEKDAYS.includes(value as (typeof FULL_WEEKDAYS)[number])) return null
  return value
}

export function cardMeta(recipe: { minutes: number; kcal: number; protein: number }) {
  return `${recipe.minutes} min · ${recipe.kcal} cal · ${recipe.protein}g protein`
}

export function mealPlannerTabHref(base: string, tab: MealPlannerTab) {
  const entry = MEAL_PLANNER_TABS.find((item) => item.id === tab)
  return `${base}${entry?.suffix ?? ""}`
}

export function parseCatalogFilters(input: {
  q?: string | string[]
  cuisine?: string | string[]
  goal?: string | string[]
  sort?: string | string[]
}): CatalogFilters {
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? ""
  const q = first(input.q).trim().slice(0, 80)
  const cuisineRaw = first(input.cuisine).trim()
  const cuisine = /^[A-Za-z][A-Za-z &'-]{0,39}$/.test(cuisineRaw) ? cuisineRaw : null
  const goalRaw = first(input.goal).trim()
  const goal = CATALOG_GOALS.some((item) => item.id === goalRaw) ? (goalRaw as CatalogGoal) : null
  const sortRaw = first(input.sort).trim()
  const sort = CATALOG_SORTS.some((item) => item.id === sortRaw) ? (sortRaw as CatalogSort) : "popular"
  return { q, cuisine, goal, sort }
}

export function catalogBrowseHref(base: string, filters: Partial<CatalogFilters>) {
  const params = new URLSearchParams()
  if (filters.q?.trim()) params.set("q", filters.q.trim())
  if (filters.cuisine) params.set("cuisine", filters.cuisine)
  if (filters.goal) params.set("goal", filters.goal)
  if (filters.sort && filters.sort !== "popular") params.set("sort", filters.sort)
  const query = params.toString()
  return query ? `${base}?${query}` : base
}

export function recipeCatalogImageUrl(slug: string, supabaseUrl: string | null | undefined) {
  if (!supabaseUrl || !isCatalogSlug(slug)) return null
  try {
    const url = new URL(supabaseUrl)
    if (url.protocol !== "https:" && url.protocol !== "http:") return null
    return `${url.origin}/storage/v1/object/public/recipe-catalog/recipes/${slug}.webp`
  } catch {
    return null
  }
}

export function recipeCatalogRemotePatterns(supabaseUrl?: string) {
  if (!supabaseUrl) return []
  try {
    const url = new URL(supabaseUrl)
    if (url.protocol !== "https:" && url.protocol !== "http:") return []
    return [
      {
        protocol: url.protocol === "http:" ? ("http" as const) : ("https" as const),
        hostname: url.hostname,
        ...(url.port ? { port: url.port } : {}),
        pathname: "/storage/v1/object/public/**",
        search: "",
      },
    ]
  } catch {
    return []
  }
}

export function recipeCatalogImageCsp(supabaseUrl?: string) {
  const sources = ["'self'", "data:", "blob:"]
  if (supabaseUrl) {
    try {
      const url = new URL(supabaseUrl)
      if (url.protocol === "https:" || url.protocol === "http:") sources.push(`${url.protocol}//${url.host}`)
    } catch {
      // A malformed project URL leaves only local image sources.
    }
  }
  return `img-src ${sources.join(" ")};`
}

export function mealPlannerRedirects() {
  const pairs = [
    ["/meals", "/life/meal-planner"],
    ["/recipes", "/life/meal-planner/mine"],
    ["/recipes/:id", "/life/meal-planner/mine/:id"],
    ["/life/meals", "/life/meal-planner"],
    ["/life/recipes", "/life/meal-planner/mine"],
    ["/life/recipes/:id", "/life/meal-planner/mine/:id"],
  ]
  return pairs.map(([source, destination]) => ({ source, destination, permanent: true as const }))
}

function bigrams(value: string) {
  const grams = new Set<string>()
  const text = value.toLowerCase()
  for (let index = 0; index < text.length - 1; index += 1) grams.add(text.slice(index, index + 2))
  return grams
}

export function textSimilarity(left: string, right: string) {
  const a = bigrams(left)
  const b = bigrams(right)
  if (a.size === 0 || b.size === 0) return 0
  let shared = 0
  for (const gram of a) if (b.has(gram)) shared += 1
  return (2 * shared) / (a.size + b.size)
}

function haystack(recipe: CatalogRecipe) {
  return [recipe.name, recipe.cuisine, recipe.meal_type, ...recipe.ingredients.map((item) => item.text), ...recipe.steps]
    .join(" ")
    .toLowerCase()
}

export function searchCatalog(recipes: CatalogRecipe[], query: string) {
  const q = query.trim().toLowerCase()
  if (!q) return recipes
  const direct = recipes.filter((recipe) => haystack(recipe).includes(q))
  if (direct.length > 0) return direct
  return recipes
    .map((recipe) => ({
      recipe,
      score: Math.max(
        textSimilarity(recipe.name, q),
        ...recipe.ingredients.map((item) => textSimilarity(item.text, q)),
      ),
    }))
    .filter((item) => item.score >= 0.34)
    .sort((a, b) => b.score - a.score || a.recipe.name.localeCompare(b.recipe.name))
    .map((item) => item.recipe)
}

export function sortCatalog(recipes: CatalogRecipe[], sort: CatalogSort) {
  const copy = [...recipes]
  copy.sort((a, b) => {
    if (sort === "quickest" && a.minutes !== b.minutes) return a.minutes - b.minutes
    if (sort === "calories" && a.kcal !== b.kcal) return a.kcal - b.kcal
    if (sort === "protein" && a.protein !== b.protein) return b.protein - a.protein
    return a.name.localeCompare(b.name)
  })
  return copy
}

export function filterCatalog(recipes: CatalogRecipe[], filters: CatalogFilters) {
  const searched = filters.q ? searchCatalog(recipes, filters.q) : recipes
  const cuisine = filters.cuisine
  const goal = filters.goal
  const byCuisine = cuisine ? searched.filter((recipe) => recipe.cuisine === cuisine) : searched
  const byGoal = goal ? byCuisine.filter((recipe) => recipe.tags.includes(goal)) : byCuisine
  if (filters.q && filters.sort === "popular") return byGoal
  return sortCatalog(byGoal, filters.sort)
}

export function catalogShelves(recipes: CatalogRecipe[]) {
  const groups = new Map<string, CatalogRecipe[]>()
  for (const recipe of recipes) {
    const list = groups.get(recipe.cuisine) ?? []
    list.push(recipe)
    groups.set(recipe.cuisine, list)
  }
  const known = new Set<string>(CATALOG_CUISINES)
  const extra = [...groups.keys()].filter((cuisine) => !known.has(cuisine)).sort((a, b) => a.localeCompare(b))
  return [...CATALOG_CUISINES, ...extra]
    .map((cuisine) => ({
      cuisine,
      recipes: sortCatalog(groups.get(cuisine) ?? [], "popular").slice(0, SHELF_LIMIT),
    }))
    .filter((shelf) => shelf.recipes.length >= SHELF_MIN)
}

export function scaledGrams(grams: number | undefined, baseServings: number, servings: number) {
  if (grams == null || baseServings < 1) return null
  return Math.max(1, Math.round((grams * servings) / baseServings))
}
