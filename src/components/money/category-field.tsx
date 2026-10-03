"use client"

import { useState } from "react"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
  id,
}: {
  section: CategorySection
  used: (string | null | undefined)[]
  value?: string | null
  id: string
}) {
  const other = OTHER_LABEL[section]
  const choices = categoryChoices(section, value ? [value, ...used] : used)
  const current = value ? categoryGroupLabel(section, value) : other
  const [picked, setPicked] = useState(choices.includes(current) ? current : other)
  const [creating, setCreating] = useState(false)
  const [custom, setCustom] = useState("")
  const posted = creating ? custom : picked === other ? "" : picked

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
          setPicked(next)
        }}
        className={field}
      >
        {choices.map((name) => (
          <option key={name} value={name}>
            {name}
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
      {section === "bills" ? <p className="text-[13px] text-muted-foreground">Card balances stay on Cards.</p> : null}
    </div>
  )
}
