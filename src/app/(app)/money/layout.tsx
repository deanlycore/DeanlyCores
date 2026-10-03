import { SectionSegments } from "@/components/shell/section-segments"
import { primaryNav, railChildren } from "@/lib/navigation"

export default function MoneyLayout({ children }: { children: React.ReactNode }) {
  const money = primaryNav.find((item) => item.href === "/money")
  return (
    <div className="grid gap-5">
      {money ? <SectionSegments label="Money" segments={railChildren(money)} tone="life" /> : null}
      {children}
    </div>
  )
}
