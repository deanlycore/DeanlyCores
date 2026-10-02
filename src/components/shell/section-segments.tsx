"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

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
  const life = tone === "life"
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
        const active = pathMatches(pathname, segment.href)
        return (
          <Link
            key={segment.href}
            href={segment.href}
            aria-current={active ? "page" : undefined}
            className={
              life
                ? `inline-flex min-h-11 shrink-0 items-center rounded-full px-3.5 text-[13px] font-medium ${
                    active ? "bg-brand-soft text-on-brand-soft" : "bg-surface-muted text-muted-foreground"
                  }`
                : `shrink-0 rounded-full px-3 py-1.5 text-[13px] font-medium ${
                    active ? "bg-brand-soft text-on-brand-soft" : "bg-surface-muted text-muted-foreground"
                  }`
            }
          >
            {segment.label}
          </Link>
        )
      })}
    </nav>
  )
}
