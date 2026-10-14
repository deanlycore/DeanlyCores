import { LifeSectionNav } from "@/components/life/life-section-nav"

export default function LifeLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid gap-5">
      <LifeSectionNav />
      {children}
    </div>
  )
}
