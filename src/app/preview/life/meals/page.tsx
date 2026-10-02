import { notFound } from "next/navigation"

import { MealsBoard } from "@/components/life/meals-board"

import { LifePreview } from "../chrome"
import { previewMeals, previewToday } from "../sample"

export const dynamic = "force-dynamic"

export default function PreviewMeals() {
  if (process.env.NODE_ENV === "production") notFound()
  return (
    <LifePreview>
      <MealsBoard rows={previewMeals} today={previewToday} />
    </LifePreview>
  )
}
