"use client"

import { useState } from "react"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { isOtherCategory, matchMoneyGroup } from "@/lib/money/category-match"
import {
  OTHER_LABEL,
  categoryChoices,
  categoryGroupLabel,
  type MoneyGroupSection,
} from "@/lib/money/board"

const field = "h-11 rounded-button bg-surface px-3"

type CategorySection = Exclude<MoneyGroupSection, "people">

/** Starters, then names already on rows this session can read, then a short new name. */
export function CategoryField({
  section,
  used,
  value,
  name = "",
  id,
}: {
  section: CategorySection
  used: (string | null | undefined)[]
  value?: string | null
  /** Current row name. Blank or Other follows it. A real group stays until the person changes it. */
  name?: string
  id: string
}) {
  const other = OTHER_LABEL[section]
  const choices = categoryChoices(section, value ? [value, ...used] : used)
  const stored = value ? categoryGroupLabel(section, value) : other
  const [manual, setManual] = useState<string | null>(isOtherCategory(section, value) ? null : stored)
  const [creating, setCreating] = useState(false)
  const [custom, setCustom] = useState("")
  const matched = matchMoneyGroup(section, name)
  const picked = manual ?? (choices.includes(matched) ? matched : other)
  const postingManual = creating || (manual != null && !isOtherCategory(section, manual))
  const posted = creating ? custom : postingManual ? (manual ?? "") : ""

  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>Category</Label>
      <select
        id={id}
        value={creating ? "__new" : picked}
        onChange={(event) => {
          const next = event.target.value
          if (next === "__new") {
            setCreating(true)
            return
          }
          setCreating(false)
          setManual(isOtherCategory(section, next) ? null : next)
        }}
        className={field}
      >
        {choices.map((choice) => (
          <option key={choice} value={choice}>
            {choice}
          </option>
        ))}
        <option value="__new">New category</option>
      </select>
      {creating ? (
        <Input
          aria-label="New category"
          value={custom}
          maxLength={40}
          placeholder="Short name"
          onChange={(event) => setCustom(event.target.value)}
          className={field}
        />
      ) : null}
      <input type="hidden" name="category" value={posted} />
      <input type="hidden" name="category_mode" value={postingManual ? "manual" : "auto"} />
      {section === "bills" ? <p className="text-[13px] text-muted-foreground">Card balances stay on Cards.</p> : null}
    </div>
  )
}
