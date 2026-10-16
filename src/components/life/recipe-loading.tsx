export function RecipeLoading() {
  return (
    <div className="grid min-w-0 gap-3" aria-busy="true" aria-label="Loading recipes">
      <div className="h-8 w-40 rounded-md bg-surface-muted" />
      <div className="h-4 w-56 rounded-md bg-surface-muted" />
      <div className="h-24 rounded-[12px] border border-border bg-surface" />
      <div className="h-24 rounded-[12px] border border-border bg-surface" />
    </div>
  )
}
