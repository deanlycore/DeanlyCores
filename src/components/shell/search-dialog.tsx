"use client"

import Link from "next/link"
import { useEffect, useState } from "react"

import { searchRecords, type SearchHit } from "@/lib/actions/records"
import { commandLinks } from "@/lib/navigation"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"

export function SearchDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [query, setQuery] = useState("")
  const [hits, setHits] = useState<SearchHit[]>([])

  useEffect(() => {
    if (!open) return
    const handle = window.setTimeout(() => {
      const local = commandLinks()
        .filter((link) => link.label.toLowerCase().includes(query.trim().toLowerCase()))
        .slice(0, 6)
        .map((link) => ({ href: link.href, label: link.label, group: link.group }))
      if (query.trim().length < 2) {
        setHits(local)
        return
      }
      searchRecords(query).then((remote) => setHits([...remote, ...local].slice(0, 12)))
    }, 180)
    return () => window.clearTimeout(handle)
  }, [open, query])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display">Search</DialogTitle>
        </DialogHeader>
        <Input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Bills, tasks, notes, meals"
          className="h-11 rounded-button px-3"
        />
        <ul className="grid max-h-80 gap-1 overflow-auto">
          {hits.length === 0 ? <li className="px-1 py-3 text-sm text-muted-foreground">Nothing matches yet.</li> : null}
          {hits.map((hit) => (
            <li key={`${hit.group}-${hit.href}-${hit.label}`}>
              <Link
                href={hit.href}
                onClick={() => onOpenChange(false)}
                className="flex items-center justify-between rounded-xl px-3 py-2 hover:bg-surface-muted"
              >
                <span>{hit.label}</span>
                <span className="text-xs text-muted-foreground">{hit.group}</span>
              </Link>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  )
}
