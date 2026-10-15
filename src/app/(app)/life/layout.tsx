import { LifeSectionNav } from "@/components/life/life-section-nav"

export default function LifeLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-w-0 gap-5">
      <LifeSectionNav />
      {children}
    </div>
  )
}
