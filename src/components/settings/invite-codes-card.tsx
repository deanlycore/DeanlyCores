"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { MoreHorizontal } from "lucide-react"

import { createInviteCode, revokeInviteCode, type CreateCodeState } from "@/lib/actions/invite"
import { formatInviteDate, inviteStatus, type InviteCodeView } from "@/lib/invite"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

const fieldClass = "h-11 rounded-button bg-surface px-3"

async function copyCode(value: string) {
  try {
    await navigator.clipboard.writeText(value)
    return true
  } catch {
    return false
  }
}

function CreateCodeForm() {
  const router = useRouter()
  const [state, setState] = useState<CreateCodeState>(null)
  const [pending, setPending] = useState(false)
  const [copied, setCopied] = useState(false)
  const [copyFailed, setCopyFailed] = useState(false)

  useEffect(() => {
    if (state?.code) router.refresh()
  }, [state?.code, router])

  if (state?.code) {
    return (
      <div className="grid gap-3">
        <p className="font-mono text-[18px] font-semibold tabular-nums text-ink">{state.code}</p>
        <p className="text-sm text-muted-foreground">Send this outside the app (text/email).</p>
        <p role="status" className="text-sm text-ink">
          {state.message}
        </p>
        <Button
          type="button"
          variant="ghost"
          className="h-11 w-fit rounded-button px-3 text-brand"
          onClick={async () => {
            const ok = await copyCode(state.code ?? "")
            setCopied(ok)
            setCopyFailed(!ok)
          }}
        >
          {copied ? "Copied" : "Copy"}
        </Button>
        {copyFailed ? <p className="text-sm text-muted-foreground">Select the code and copy it.</p> : null}
      </div>
    )
  }

  return (
    <form
      className="grid gap-4"
      action={async (formData) => {
        setPending(true)
        const result = await createInviteCode(state, formData)
        setState(result)
        setPending(false)
      }}
    >
      <div className="grid gap-2">
        <Label htmlFor="max-uses">Max uses</Label>
        <Input
          id="max-uses"
          name="max_uses"
          type="number"
          min={1}
          max={20}
          defaultValue={1}
          inputMode="numeric"
          className={fieldClass}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="expiry">Expiry</Label>
        <select
          id="expiry"
          name="expiry"
          defaultValue="7"
          className={`${fieldClass} border border-input text-sm text-ink`}
        >
          <option value="7">7 days</option>
          <option value="never">Never</option>
        </select>
      </div>
      {state?.message ? (
        <p role="status" className="text-sm text-muted-foreground">
          {state.message}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} className="h-11 rounded-button text-primary-foreground">
        {pending ? "One moment…" : "Create code"}
      </Button>
    </form>
  )
}

function CodeRow({ code }: { code: InviteCodeView }) {
  const router = useRouter()
  const [copied, setCopied] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function onCopy() {
    const ok = await copyCode(code.code)
    setCopied(ok)
    setMessage(ok ? null : "Select the code and copy it.")
  }

  return (
    <div className="rounded-[16px] border border-border bg-surface px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="font-mono text-[18px] font-semibold tabular-nums text-ink">{code.code}</p>
        <p className="text-sm text-muted-foreground">{inviteStatus(code, "UTC")}</p>
      </div>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Created {formatInviteDate(code.createdAt, "UTC")}</p>
        <div className="flex items-center">
          <Button type="button" variant="ghost" className="h-9 rounded-button px-3 text-brand" onClick={onCopy}>
            {copied ? "Copied" : "Copy"}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="icon" aria-label={`Actions for ${code.code}`}>
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={onCopy}>Copy</DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onSelect={() => setConfirm(true)}>
                Revoke
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke this code?</DialogTitle>
            <DialogDescription>This code won’t work anymore.</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" className="text-ink" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="text-danger"
              disabled={pending}
              onClick={async () => {
                setPending(true)
                const result = await revokeInviteCode(code.id)
                setPending(false)
                if (!result.ok) {
                  setMessage(result.message)
                  setConfirm(false)
                  return
                }
                setConfirm(false)
                router.refresh()
              }}
            >
              {pending ? "One moment…" : "Revoke"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export function InviteCodesCard({ codes, ready = true }: { codes: InviteCodeView[]; ready?: boolean }) {
  const [open, setOpen] = useState(false)
  const [formKey, setFormKey] = useState(0)

  return (
    <section id="invite-codes" className="deanly-card grid gap-3 p-5">
      <div>
        <h2 className="font-medium">Invite codes</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Friends use this to start <span className="font-medium text-ink">their own</span> household — not DeanFamily.
        </p>
      </div>
      {ready ? (
        <Dialog
          open={open}
          onOpenChange={(next) => {
            setOpen(next)
            if (next) setFormKey((key) => key + 1)
          }}
        >
          <DialogTrigger asChild>
            <Button type="button" className="h-11 w-fit rounded-button text-primary-foreground">
              Create code
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Create code</DialogTitle>
              <DialogDescription>Friends use this to start their own household — not DeanFamily.</DialogDescription>
            </DialogHeader>
            <CreateCodeForm key={formKey} />
          </DialogContent>
        </Dialog>
      ) : (
        <p className="text-sm text-muted-foreground">Invite codes aren’t available yet.</p>
      )}
      {ready ? (
        <div className="grid gap-2">
          <h3 className="text-sm font-medium text-ink">Active codes</h3>
          {codes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active codes yet.</p>
          ) : (
            codes.map((code) => <CodeRow key={code.id} code={code} />)
          )}
        </div>
      ) : null}
    </section>
  )
}
