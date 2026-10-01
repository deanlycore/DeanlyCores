"use client"

import { useState } from "react"

import { updateCurrency, updateDisplayName } from "@/lib/actions/records"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export function NameForm({ name }: { name: string }) {
  const [message, setMessage] = useState<string | null>(null)
  return (
    <form
      className="grid gap-2"
      action={async (formData) => {
        const result = await updateDisplayName(formData)
        setMessage(result.ok ? "Saved." : result.message)
      }}
    >
      <Input name="display_name" defaultValue={name} className="h-11 rounded-button bg-surface px-3" />
      <Button type="submit" className="h-11 w-fit rounded-button text-primary-foreground">
        Save name
      </Button>
      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
    </form>
  )
}

export function CurrencyForm({ currency }: { currency: string }) {
  const [message, setMessage] = useState<string | null>(null)
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      action={async (formData) => {
        const result = await updateCurrency(formData)
        setMessage(result.ok ? "Saved." : result.message)
      }}
    >
      <Input name="currency" defaultValue={currency} maxLength={3} className="h-11 w-28 rounded-button bg-surface px-3 uppercase" />
      <Button type="submit" variant="outline" className="h-11 rounded-button">
        Save currency
      </Button>
      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
    </form>
  )
}
