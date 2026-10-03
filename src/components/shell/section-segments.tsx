"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { moneyScanBlockId } from "@/lib/money/board"
import { pathMatches, shellPathname } from "@/lib/navigation"

export function SectionSegments({
  label,
  segments,
  tone = "default",
}: {
  label: string
  segments: { href: string; label: string }[]
  tone?: "default" | "life"
}) {
  const pathname = shellPathname(usePathname())
  const scan = pathname === "/money"
  const life = tone === "life"
  const hrefs = segments.map((segment) => segment.href).join("|")
  const [activeId, setActiveId] = useState("money-bills")

  useEffect(() => {
    if (!scan) return
    const nodes = hrefs
      .split("|")
      .map((href) => document.getElementById(moneyScanBlockId(href)))
      .filter((node): node is HTMLElement => Boolean(node))
    if (nodes.length === 0) return

    function update() {
      const line = 88
      let current = nodes[0]
      for (const node of nodes) {
        if (node.getBoundingClientRect().top <= line) current = node
      }
      setActiveId((previous) => (previous === current.id ? previous : current.id))
    }

    update()
    window.addEventListener("scroll", update, { passive: true })
    return () => window.removeEventListener("scroll", update)
  }, [scan, hrefs])

  useEffect(() => {
    if (!scan) return
    const button = document.querySelector<HTMLElement>(`[data-money-segment="${activeId}"]`)
    const nav = button?.closest("nav")
    if (!button || !nav) return
    const left = button.offsetLeft
    const right = left + button.offsetWidth
    if (left < nav.scrollLeft || right > nav.scrollLeft + nav.clientWidth) {
      nav.scrollTo({ left: Math.max(0, left - 16), behavior: "smooth" })
    }
  }, [scan, activeId])

  function onScanSelect(href: string) {
    const id = moneyScanBlockId(href)
    setActiveId(id)
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  return (
    <nav
      aria-label={label}
      className={
        life
          ? "sticky top-0 z-20 -mx-4 flex gap-1 overflow-x-auto border-b border-border bg-background/95 px-4 py-2 backdrop-blur md:hidden"
          : "-mx-1 flex gap-1 overflow-x-auto px-1 md:hidden"
      }
    >
      {segments.map((segment) => {
        const blockId = moneyScanBlockId(segment.href)
        const active = scan ? activeId === blockId : pathMatches(pathname, segment.href)
        const className = life
          ? `inline-flex min-h-11 shrink-0 items-center rounded-full px-3.5 text-[13px] font-medium ${
              active ? "bg-brand-soft text-on-brand-soft" : "bg-surface-muted text-muted-foreground"
            }`
          : `shrink-0 rounded-full px-3 py-1.5 text-[13px] font-medium ${
              active ? "bg-brand-soft text-on-brand-soft" : "bg-surface-muted text-muted-foreground"
            }`
        if (scan && blockId) {
          return (
            <button
              key={segment.href}
              type="button"
              data-money-segment={blockId}
              aria-current={active ? "true" : undefined}
              onClick={() => onScanSelect(segment.href)}
              className={className}
            >
              {segment.label}
            </button>
          )
        }
        return (
          <Link
            key={segment.href}
            href={segment.href}
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
