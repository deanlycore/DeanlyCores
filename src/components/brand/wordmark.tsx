export function Wordmark({
  size = "md",
  showHousehold = true,
}: {
  size?: "sm" | "md" | "lg"
  showHousehold?: boolean
}) {
  const mark = size === "lg" ? "size-12" : size === "sm" ? "size-8" : "size-9"
  const title = size === "lg" ? "text-3xl" : size === "sm" ? "text-base" : "text-lg"

  return (
    <span className="inline-flex items-center gap-2.5">
      <svg viewBox="0 0 32 32" className={mark} aria-hidden="true">
        <rect width="32" height="32" rx="8" fill="#249B8A" />
        <path
          fill="#ffffff"
          d="M7.5 14.2 16 7.5l8.5 6.7V24a1 1 0 0 1-1 1h-5.2v-5.6h-4.6V25H8.5a1 1 0 0 1-1-1v-9.8Z"
        />
      </svg>
      <span className="leading-tight">
        <span className={`block font-display font-semibold tracking-tight text-ink ${title}`}>Deanly</span>
        {showHousehold ? (
          <span className="block text-xs text-muted-foreground">DeanFamily</span>
        ) : null}
      </span>
    </span>
  )
}
