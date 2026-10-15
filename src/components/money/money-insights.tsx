import { INSIGHTS_COPY, type MoneyInsight } from "@/lib/money/insights"

export function MoneyInsightsPanel({ lines }: { lines: MoneyInsight[] }) {
  if (lines.length === 0) {
    return <p className="text-[15px] font-medium text-ink">{INSIGHTS_COPY.empty}</p>
  }

  return (
    <ul className="grid">
      {lines.map((line) => (
        <li key={line.id} className="border-t border-border first:border-t-0">
          <p className="min-h-11 py-2.5 text-[15px] leading-snug text-ink">
            {line.parts.map((part, index) =>
              part.amount ? (
                <span key={index} className="tabular-nums">
                  {part.text}
                </span>
              ) : (
                <span key={index}>{part.text}</span>
              ),
            )}
          </p>
        </li>
      ))}
    </ul>
  )
}
