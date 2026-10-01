import type { Metadata } from "next"

import { SectionPage } from "@/components/shell/section-page"

export const metadata: Metadata = { title: "Life" }

export default function Page() {
  return <SectionPage href="/life" />
}
