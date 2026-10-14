"use client"

import { useState } from "react"
import { ChevronDown } from "lucide-react"

import { INSIGHTS_COPY, type MoneyInsight } from "@/lib/money/insights"
import { cn } from "cn"

const surface = "min-w-0 rounded-[12px] border border-border bg-surface p-4 shadow-soft"

export function MoneyInsights({ lines }: { lines: MoneyInsight[] }) {
  const [open, setOpen] = useState(false)

  return (
    <section
      data-money-insights
      data-open={open ? "true" : "false"}
      className={surface}
      aria-labelledby="money-insights-title"
    >
      <h2 id="money-insights-title">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className="flex w-full items-center gap-3 border-0 bg-transparent p-0 text-left text-[13px] font-medium text-ink max-md:min-h-11"
        >
          <span className="min-w-0">{INSIGHTS_COPY.title}</span>
          <ChevronDown
            aria-hidden="true"
            className={cn(
              "ml-auto size-4 shrink-0 text-muted-foreground transition-transform duration-150",
              !open && "-rotate-90",
            )}
          />
        </button>
      </h2>
      {open ? (
        lines.length === 0 ? (
          <p className="mt-3 text-[15px] font-medium text-ink">{INSIGHTS_COPY.empty}</p>
        ) : (
          <ul className="mt-2 grid">
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
      ) : null}
    </section>
  )
}
