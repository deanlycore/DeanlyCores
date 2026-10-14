"use client"

import { usePathname } from "next/navigation"

import { SectionSegments } from "@/components/shell/section-segments"
import { isFamilyPath, primaryNav, segmentChildren, shellPathname } from "@/lib/navigation"

export function LifeSectionNav() {
  const pathname = shellPathname(usePathname())
  if (isFamilyPath(pathname)) return null
  const life = primaryNav.find((item) => item.href === "/life")
  if (!life) return null
  return <SectionSegments label="Life" segments={segmentChildren(life)} tone="life" />
}
