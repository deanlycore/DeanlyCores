export function RecipeCardSkeleton() {
  return (
    <div className="w-40 shrink-0 md:w-[220px]" aria-hidden="true">
      <div className="deanly-skeleton aspect-[4/3] w-full rounded-[12px]" />
      <div className="deanly-skeleton mt-2 h-4 w-3/4 rounded-md" />
      <div className="deanly-skeleton mt-2 h-3 w-1/2 rounded-md" />
    </div>
  )
}

export function RecipeCatalogLoading() {
  return (
    <div className="grid min-w-0 gap-4" aria-busy="true" aria-label="Loading recipes">
      <div className="h-8 w-48 rounded-md bg-surface-muted" />
      <div className="flex gap-2">
        <div className="h-12 w-28 rounded-full bg-surface-muted" />
        <div className="h-12 w-24 rounded-full bg-surface-muted" />
        <div className="h-12 w-28 rounded-full bg-surface-muted" />
      </div>
      <div className="h-12 rounded-[12px] bg-surface-muted" />
      <div className="flex gap-3 overflow-hidden">
        <RecipeCardSkeleton />
        <RecipeCardSkeleton />
        <RecipeCardSkeleton />
        <RecipeCardSkeleton />
      </div>
    </div>
  )
}
