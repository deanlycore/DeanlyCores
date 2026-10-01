import { billStatusLabel, type BillStatus } from "@/lib/home/metrics"
import { visibilityLabel, type Visibility } from "@/lib/visibility"

export function VisibilityPill({ visibility }: { visibility: Visibility }) {
  const shared = visibility !== "private"
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
        shared ? "bg-brand-soft text-brand-deep" : "bg-sand text-sand-ink"
      }`}
    >
      {visibilityLabel(shared ? "shared" : "private")}
    </span>
  )
}

const chipStyle: Record<BillStatus, { background: string; color: string }> = {
  paid: { background: "color-mix(in srgb, var(--success) 16%, white)", color: "var(--success)" },
  due_soon: { background: "color-mix(in srgb, var(--warn) 20%, white)", color: "#6b5344" },
  on_time: { background: "var(--surface-muted)", color: "var(--ink-muted)" },
  overdue: { background: "color-mix(in srgb, var(--danger) 16%, white)", color: "var(--danger)" },
}

export function StatusChip({ status }: { status: BillStatus }) {
  return (
    <span className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium" style={chipStyle[status]}>
      {billStatusLabel(status)}
    </span>
  )
}

export function WidgetError({ onRetry }: { onRetry?: () => void }) {
  return (
    <p className="mt-3 rounded-xl bg-surface-muted px-3 py-2 text-sm text-ink">
      Couldn’t load this.{" "}
      {onRetry ? (
        <button type="button" onClick={onRetry} className="font-medium text-brand-deep">
          Retry
        </button>
      ) : null}
    </p>
  )
}
