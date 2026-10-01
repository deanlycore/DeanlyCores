import { HouseMark } from "@/components/brand/house-mark"

export function Wordmark({
  size = "md",
  showHousehold = true,
}: {
  size?: "sm" | "md" | "lg"
  showHousehold?: boolean
}) {
  const mark = size === "lg" ? "size-10" : size === "sm" ? "size-8" : "size-8"
  const title = size === "lg" ? "text-3xl" : size === "sm" ? "text-base" : "text-lg"

  return (
    <span className="inline-flex items-center gap-2.5">
      <HouseMark className={mark} />
      <span className="leading-tight">
        <span className={`block font-display font-semibold tracking-tight text-ink ${title}`}>Deanly</span>
        {showHousehold ? (
          <span className="block text-xs text-muted-foreground">DeanFamily</span>
        ) : null}
      </span>
    </span>
  )
}
