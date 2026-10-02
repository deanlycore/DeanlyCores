import { SectionSegments } from "@/components/shell/section-segments"
import { primaryNav, railChildren } from "@/lib/navigation"

export default function LifeLayout({ children }: { children: React.ReactNode }) {
  const life = primaryNav.find((item) => item.href === "/life")
  return (
    <div className="grid gap-5">
      {life ? <SectionSegments label="Life" segments={railChildren(life)} tone="life" /> : null}
      {children}
    </div>
  )
}
