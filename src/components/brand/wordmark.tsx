import { LoopMark } from "@/components/brand/loop-mark"

export function Wordmark({
  size = "md",
  household,
  showHousehold = true,
}: {
  size?: "sm" | "md" | "lg"
  household?: string | null
  showHousehold?: boolean
}) {
  const mark = size === "lg" ? 40 : 28
  const title = size === "lg" ? "text-2xl" : "text-[15px]"

  return (
    <span className="inline-flex items-center gap-2.5">
      <LoopMark size={mark} />
      <span className="leading-none">
        <span className={`block whitespace-nowrap font-display font-semibold tracking-tight text-ink ${title}`}>Deanly Tracking</span>
        {showHousehold && household ? (
          <span className="mt-0.5 block text-[11px] text-muted-foreground">{household}</span>
        ) : null}
      </span>
    </span>
  )
}
