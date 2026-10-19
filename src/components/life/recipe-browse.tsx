"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import { MealPlannerTabs } from "@/components/life/meal-planner-tabs"
import { RecipeCardSkeleton } from "@/components/life/recipe-catalog-skeleton"
import { RecipePhoto } from "@/components/life/recipe-photo"
import { Button } from "@/components/ui/button"
import {
  CATALOG_GOALS,
  CATALOG_PAGE_SIZE,
  CATALOG_SORTS,
  catalogBrowseHref,
  catalogShelves,
  cardMeta,
  CATALOG_ERROR_COPY,
  NO_RESULTS_COPY,
  recipeCatalogImageUrl,
  SEARCH_PLACEHOLDER,
  seedPhotoSrc,
  type CatalogFilters,
  type CatalogRecipe,
  type CatalogSort,
} from "@/lib/life/catalog"
import { cn } from "cn"

export function RecipeBrowse({
  recipes,
  error = false,
  filters,
  supabaseUrl = null,
  base,
  preview = false,
}: {
  recipes: CatalogRecipe[]
  error?: boolean
  filters: CatalogFilters
  supabaseUrl?: string | null
  base: string
  preview?: boolean
}) {
  const router = useRouter()
  const browse = `${base}/browse`
  const searching = Boolean(filters.q)
  const shelves = !searching && !filters.cuisine ? catalogShelves(recipes) : []
  const grid = searching || filters.cuisine ? recipes : []

  function href(next: Partial<CatalogFilters>) {
    return catalogBrowseHref(browse, { ...filters, ...next })
  }

  return (
    <div className="grid min-w-0 gap-4">
      <header className="grid gap-3">
        <h1 className="font-display text-[28px] font-semibold tracking-[-0.02em] text-ink md:text-[30px]">Meal Planner</h1>
        <MealPlannerTabs base={base} current="browse" />
      </header>
      <form action={browse} method="get" className="sticky top-0 z-10 bg-background py-1">
        {filters.cuisine ? <input type="hidden" name="cuisine" value={filters.cuisine} /> : null}
        {filters.goal ? <input type="hidden" name="goal" value={filters.goal} /> : null}
        {filters.sort !== "popular" ? <input type="hidden" name="sort" value={filters.sort} /> : null}
        <input
          name="q"
          defaultValue={filters.q}
          placeholder={SEARCH_PLACEHOLDER}
          aria-label={SEARCH_PLACEHOLDER}
          className="min-h-12 w-full rounded-[12px] border border-border bg-surface px-3 text-sm text-ink"
        />
      </form>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Goals">
        {CATALOG_GOALS.map((goal) => {
          const selected = filters.goal === goal.id
          return (
            <Link
              key={goal.id}
              href={href({ goal: selected ? null : goal.id })}
              aria-pressed={selected}
              className={cn(
                "inline-flex min-h-12 shrink-0 items-center rounded-full px-4 text-sm font-medium",
                selected ? "bg-brand-soft text-on-brand-soft" : "bg-surface-muted text-muted-foreground",
              )}
            >
              {goal.label}
            </Link>
          )
        })}
      </div>
      {error ? (
        <div className="grid gap-3" role="alert">
          <p className="text-sm text-ink">{CATALOG_ERROR_COPY}</p>
          <Button type="button" className="h-12 min-h-12 w-fit px-4" onClick={() => router.refresh()}>
            Retry
          </Button>
        </div>
      ) : null}
      {!error && (searching || filters.cuisine) ? (
        <SortRow browse={browse} filters={filters} />
      ) : null}
      {!error && grid.length === 0 && (searching || filters.cuisine || filters.goal) && shelves.length === 0 ? (
        <div className="grid gap-3">
          <p className="text-sm text-ink">{NO_RESULTS_COPY}</p>
          <Link href={browse} className="inline-flex min-h-12 w-fit items-center rounded-full bg-surface-muted px-4 text-sm font-medium text-ink">
            Clear filters
          </Link>
        </div>
      ) : null}
      {!error && shelves.length > 0 ? (
        <div className="grid gap-6">
          {shelves.map((shelf) => (
            <section key={shelf.cuisine} aria-label={shelf.cuisine} className="grid gap-3">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-display text-lg font-semibold text-ink">{shelf.cuisine}</h2>
                <Link href={href({ cuisine: shelf.cuisine, q: "" })} className="inline-flex min-h-12 items-center text-sm font-medium text-brand-deep">
                  See all
                </Link>
              </div>
              <ul className="flex gap-3 overflow-x-auto pb-1">
                {shelf.recipes.map((recipe) => (
                  <li key={recipe.slug} className="w-40 shrink-0 md:w-[220px]">
                    <RecipeCard recipe={recipe} href={`${browse}/${recipe.slug}`} supabaseUrl={supabaseUrl} preview={preview} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : null}
      {!error && grid.length > 0 ? (
        <CatalogGrid key={grid.map((recipe) => recipe.slug).join("\n")} recipes={grid} browse={browse} supabaseUrl={supabaseUrl} preview={preview} />
      ) : null}
    </div>
  )
}

function SortRow({ browse, filters }: { browse: string; filters: CatalogFilters }) {
  return (
    <div className="flex gap-2 overflow-x-auto" role="group" aria-label="Sort">
      {CATALOG_SORTS.map((sort) => {
        const selected = filters.sort === sort.id
        return (
          <Link
            key={sort.id}
            href={catalogBrowseHref(browse, { ...filters, sort: sort.id as CatalogSort })}
            aria-pressed={selected}
            className={cn(
              "inline-flex min-h-12 shrink-0 items-center rounded-full border px-4 text-sm",
              selected ? "border-border bg-surface-muted text-ink" : "border-border bg-surface text-muted-foreground",
            )}
          >
            {sort.label}
          </Link>
        )
      })}
    </div>
  )
}

function CatalogGrid({
  recipes,
  browse,
  supabaseUrl,
  preview,
}: {
  recipes: CatalogRecipe[]
  browse: string
  supabaseUrl: string | null
  preview: boolean
}) {
  const [count, setCount] = useState(CATALOG_PAGE_SIZE)
  const [loadingMore, setLoadingMore] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const shown = recipes.slice(0, count)

  useEffect(() => {
    const node = endRef.current
    if (!node || count >= recipes.length) return
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return
      setLoadingMore(true)
      window.setTimeout(() => {
        setCount((current) => Math.min(recipes.length, current + CATALOG_PAGE_SIZE))
        setLoadingMore(false)
      }, 180)
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [count, recipes.length])

  return (
    <div className="grid gap-3">
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        {shown.map((recipe) => (
          <li key={recipe.slug}>
            <RecipeCard recipe={recipe} href={`${browse}/${recipe.slug}`} supabaseUrl={supabaseUrl} preview={preview} />
          </li>
        ))}
      </ul>
      {loadingMore ? (
        <div className="flex gap-3" aria-hidden="true">
          <RecipeCardSkeleton />
          <RecipeCardSkeleton />
        </div>
      ) : null}
      <div ref={endRef} />
    </div>
  )
}

function RecipeCard({
  recipe,
  href,
  supabaseUrl,
  preview,
}: {
  recipe: CatalogRecipe
  href: string
  supabaseUrl: string | null
  preview: boolean
}) {
  const src = preview ? seedPhotoSrc(recipe.slug) : recipeCatalogImageUrl(recipe.slug, supabaseUrl)
  return (
    <Link href={href} className="block min-h-12">
      <RecipePhoto name={recipe.name} src={src} variant="card" />
      <p className="mt-2 line-clamp-2 text-[15px] font-medium text-ink">{recipe.name}</p>
      <p className="mt-0.5 text-[13px] text-muted-foreground">{cardMeta(recipe)}</p>
    </Link>
  )
}
