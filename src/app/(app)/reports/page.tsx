import type { Metadata } from "next"

import { SectionPage } from "@/components/shell/section-page"

export const metadata: Metadata = { title: "Reports" }

export default function Page() {
  return <SectionPage href="/reports" />
}
