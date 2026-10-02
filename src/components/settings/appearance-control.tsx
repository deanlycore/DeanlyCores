"use client"

import { useSyncExternalStore } from "react"
import { useTheme } from "next-themes"

import { persistAppearance, type Appearance } from "@/lib/theme"

function subscribe(onStoreChange: () => void) {
  const observer = new MutationObserver(onStoreChange)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] })
  return () => observer.disconnect()
}

function readAppearance(): Appearance {
  return document.documentElement.classList.contains("dark") ? "dark" : "light"
}

const options: { value: Appearance; label: string }[] = [
  { value: "light", label: "Day" },
  { value: "dark", label: "Night" },
]

export function AppearanceControl({ appearance }: { appearance: Appearance }) {
  const { setTheme } = useTheme()
  const selected = useSyncExternalStore(subscribe, readAppearance, () => appearance)

  function choose(next: Appearance) {
    persistAppearance(next)
    setTheme(next)
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return
    event.preventDefault()
    choose(selected === "light" ? "dark" : "light")
  }

  return (
    <div
      role="radiogroup"
      aria-label="Appearance"
      className="inline-flex w-fit rounded-full border border-border bg-surface-muted p-1"
      onKeyDown={onKeyDown}
    >
      {options.map((option) => {
        const active = selected === option.value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => choose(option.value)}
            className={`h-9 min-w-24 rounded-full px-4 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              active ? "bg-surface text-ink shadow-soft" : "text-muted-foreground"
            }`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
