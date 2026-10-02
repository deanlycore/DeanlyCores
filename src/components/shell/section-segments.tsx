"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { pathMatches, shellPathname } from "@/lib/navigation"

export function SectionSegments({
  label,
  segments,
}: {
  label: string
  segments: { href: string; label: string }[]
}) {
  const pathname = shellPathname(usePathname())
  return (
    <nav aria-label={label} className="-mx-1 flex gap-1 overflow-x-auto px-1 md:hidden">
      {segments.map((segment) => {
        const active = pathMatches(pathname, segment.href)
        return (
          <Link
            key={segment.href}
            href={segment.href}
            aria-current={active ? "page" : undefined}
            className={`shrink-0 rounded-full px-3 py-1.5 text-[13px] font-medium ${
              active ? "bg-brand-soft text-on-brand-soft" : "bg-surface-muted text-muted-foreground"
            }`}
          >
            {segment.label}
          </Link>
        )
      })}
    </nav>
  )
}
