"use client"

import { useEffect } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { moneyScanHref, moneyScanSectionFromHref, type MoneyScanSection } from "@/lib/money/board"
import { pathMatches, shellPathname } from "@/lib/navigation"

export function SectionSegments({
  label,
  segments,
  tone = "default",
  section,
}: {
  label: string
  segments: { href: string; label: string }[]
  tone?: "default" | "life"
  /** Set on /money. Bills is the default. Other money routes keep their own links. */
  section?: MoneyScanSection
}) {
  const rawPath = usePathname()
  const pathname = shellPathname(rawPath)
  const scan = pathname === "/money"
  if (scan && !section) return null

  const life = tone === "life"
  const selected = section ?? "bills"
  const scanBase = rawPath.startsWith("/preview") ? "/preview/money" : "/money"

  return <SegmentBar label={label} segments={segments} life={life} scan={scan} selected={selected} scanBase={scanBase} pathname={pathname} />
}

function SegmentBar({
  label,
  segments,
  life,
  scan,
  selected,
  scanBase,
  pathname,
}: {
  label: string
  segments: { href: string; label: string }[]
  life: boolean
  scan: boolean
  selected: MoneyScanSection
  scanBase: string
  pathname: string
}) {
  useEffect(() => {
    if (!scan) return
    const button = document.querySelector<HTMLElement>(`[data-money-segment="${selected}"]`)
    const nav = button?.closest("nav")
    if (!button || !nav) return
    const left = button.offsetLeft
    const right = left + button.offsetWidth
    if (left < nav.scrollLeft || right > nav.scrollLeft + nav.clientWidth) {
      nav.scrollTo({ left: Math.max(0, left - 16), behavior: "smooth" })
    }
  }, [scan, selected])

  return (
    <nav
      aria-label={label}
      className={
        scan
          ? "sticky top-0 z-20 -mx-4 flex gap-1 overflow-x-auto border-b border-border bg-background/95 px-4 py-2 backdrop-blur md:top-14 md:-mx-6 md:px-6"
          : life
            ? "sticky top-0 z-20 -mx-4 flex gap-1 overflow-x-auto border-b border-border bg-background/95 px-4 py-2 backdrop-blur md:hidden"
            : "-mx-1 flex gap-1 overflow-x-auto px-1 md:hidden"
      }
    >
      {segments.map((segment) => {
        const pill = moneyScanSectionFromHref(segment.href)
        const href = scan && pill ? moneyScanHref(pill, scanBase) : segment.href
        const active = scan && pill ? selected === pill : pathMatches(pathname, segment.href)
        const className = life
          ? `inline-flex min-h-11 shrink-0 items-center rounded-full px-3.5 text-[13px] font-medium ${
              active ? "bg-brand-soft text-on-brand-soft" : "bg-surface-muted text-muted-foreground"
            }`
          : `shrink-0 rounded-full px-3 py-1.5 text-[13px] font-medium ${
              active ? "bg-brand-soft text-on-brand-soft" : "bg-surface-muted text-muted-foreground"
            }`
        return (
          <Link
            key={segment.href}
            href={href}
            data-money-segment={pill ?? undefined}
            aria-current={active ? "page" : undefined}
            className={className}
          >
            {segment.label}
          </Link>
        )
      })}
    </nav>
  )
}
