"use client"

import { useState, type FormEvent, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { useSyncExternalStore } from "react"
import { toast } from "sonner"

import { archiveFamilyProfile, removeHouseholdMember, saveFamilyProfile } from "@/lib/actions/family"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { WidgetError } from "@/components/ui/pills"
import {
  FAMILY_COLORS,
  FAMILY_COPY,
  HOUSEHOLD_PERMISSIONS,
  compareFamilyProfiles,
  familyAvatarTint,
  familyDetail,
  familyInitials,
  formatBirthday,
  isHouseholdPermission,
  parseFamilyForm,
  removeTitle,
  removedToast,
  visibleProfiles,
  type FamilyColor,
  type FamilyField,
  type FamilyProfile,
  type HouseholdPermission,
} from "@/lib/family/profile"
import { cn } from "cn"

type SheetMode = { kind: "add" } | { kind: "edit"; id: string }

function subscribeSheetSide(onStoreChange: () => void) {
  const query = window.matchMedia("(min-width: 768px)")
  query.addEventListener("change", onStoreChange)
  return () => query.removeEventListener("change", onStoreChange)
}

function sheetSide() {
  return window.matchMedia("(min-width: 768px)").matches ? "right" : "bottom"
}

function useSheetSide() {
  return useSyncExternalStore(subscribeSheetSide, sheetSide, () => "bottom" as const)
}

function blankForm() {
  return {
    name: "",
    role: "",
    birthday: "",
    color: "teal" as FamilyColor,
    notes: "",
    permission: "adult" as HouseholdPermission,
  }
}

function formFrom(member: FamilyProfile) {
  return {
    name: member.name,
    role: member.role ?? "",
    birthday: member.birthday ?? "",
    color: member.color,
    notes: member.notes ?? "",
    permission: member.permission ?? "adult",
  }
}

export function FamilyBoard({
  members,
  viewerRole = null,
  viewerId = null,
  ownerCount = 0,
  error = false,
  mode = "live",
  initialSheet = null,
  initialEditId = null,
  beforeList = null,
}: {
  members: FamilyProfile[]
  viewerRole?: HouseholdPermission | null
  viewerId?: string | null
  ownerCount?: number
  error?: boolean
  mode?: "live" | "preview"
  initialSheet?: "add" | "edit" | "remove" | null
  initialEditId?: string | null
  beforeList?: ReactNode
}) {
  const router = useRouter()
  const side = useSheetSide()
  const visibleSeed = visibleProfiles(members)
  const seeded =
    (initialEditId ? visibleSeed.find((row) => row.id === initialEditId) : null) ??
    visibleSeed.find((row) => (initialSheet === "remove" ? row.userId == null : row.userId != null)) ??
    visibleSeed[0] ??
    null
  const [previewRows, setPreviewRows] = useState(members)
  const [hiddenIds, setHiddenIds] = useState<string[]>([])
  const [edits, setEdits] = useState<Record<string, FamilyProfile>>({})
  const base = mode === "preview" ? previewRows : members
  const rows = base.map((row) => edits[row.id] ?? row).filter((row) => !hiddenIds.includes(row.id))
  const visible = visibleProfiles(rows).slice().sort(compareFamilyProfiles)
  const [sheet, setSheet] = useState<SheetMode | null>(() => {
    if (initialSheet === "add") return { kind: "add" }
    if (initialSheet === "edit" && seeded) return { kind: "edit", id: seeded.id }
    return null
  })
  const [confirming, setConfirming] = useState<FamilyProfile | null>(() => (initialSheet === "remove" ? seeded : null))
  const [form, setForm] = useState(() => {
    if (initialSheet === "edit" && seeded) return formFrom(seeded)
    return blankForm()
  })
  const [fieldError, setFieldError] = useState<Partial<Record<FamilyField, string>>>({})
  const [pending, setPending] = useState(false)
  const [removing, setRemoving] = useState(false)

  const editing = sheet?.kind === "edit" ? rows.find((row) => row.id === sheet.id) ?? null : null
  const canAdd = viewerRole === "owner" || viewerRole === "adult"
  const adding = sheet?.kind === "add"
  const editingSelf = Boolean(editing?.userId && editing.userId === viewerId)
  const editingKid = Boolean(editing && editing.userId == null)
  const showKidFields = adding || editingKid
  const editingLogin = Boolean(editing?.userId)
  const writingName = adding ? canAdd : viewerRole === "owner" || editingSelf || (editingKid && viewerRole === "adult")
  const writingDetails = adding ? canAdd : viewerRole === "owner" || (editingKid && viewerRole === "adult")
  const writingPermission = Boolean(viewerRole === "owner" && editing?.userId && !editingSelf)
  const canRemoveTarget = (target: FamilyProfile | null) =>
    Boolean(viewerRole === "owner" && target && target.userId !== viewerId)
  const canRemove = canRemoveTarget(editing)
  const targetIsLastOwner = Boolean(ownerCount === 1 && editing?.permission === "owner")
  const accessNote = !editing?.userId || writingPermission
    ? null
    : targetIsLastOwner
      ? FAMILY_COPY.accessLastOwner
      : FAMILY_COPY.accessOwn

  function openAdd() {
    setForm(blankForm())
    setFieldError({})
    setSheet({ kind: "add" })
  }

  function openEdit(member: FamilyProfile) {
    setForm(formFrom(member))
    setFieldError({})
    setSheet({ kind: "edit", id: member.id })
  }

  function closeSheet() {
    setSheet(null)
    setFieldError({})
  }

  async function onSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!writingName || pending) return
    const parsed = parseFamilyForm(form)
    if (!parsed.ok) {
      setFieldError({ [parsed.field]: parsed.message })
      return
    }
    setFieldError({})
    const next: FamilyProfile = {
      id: editing?.id ?? `preview-${parsed.value.name}`,
      name: parsed.value.name,
      role: parsed.value.role,
      birthday: parsed.value.birthday,
      color: parsed.value.color,
      notes: parsed.value.notes,
      createdAt: editing?.createdAt ?? new Date().toISOString(),
      archivedAt: null,
      userId: editing?.userId ?? null,
      permission:
        writingPermission && isHouseholdPermission(form.permission) ? form.permission : editing?.permission ?? null,
    }
    if (mode === "preview") {
      setPreviewRows((current) =>
        editing ? current.map((row) => (row.id === editing.id ? next : row)) : [...current, next],
      )
      toast(FAMILY_COPY.saved)
      closeSheet()
      return
    }

    setPending(true)
    const body = new FormData()
    if (editing) body.set("id", editing.id)
    body.set("name", form.name)
    body.set("role", form.role)
    body.set("birthday", form.birthday)
    body.set("color", form.color)
    body.set("notes", form.notes)
    if (writingPermission) body.set("permission", form.permission)
    const result = await saveFamilyProfile(body)
    setPending(false)
    if (!result.ok) {
      if (result.field) setFieldError({ [result.field]: result.message })
      else toast(result.message)
      return
    }
    if (editing) setEdits((current) => ({ ...current, [editing.id]: next }))
    toast(FAMILY_COPY.saved)
    closeSheet()
    router.refresh()
  }

  async function onRemove() {
    if (!confirming || !canRemoveTarget(confirming) || removing) return
    const member = confirming
    if (mode === "preview") {
      setPreviewRows((current) =>
        member.userId
          ? current.filter((row) => row.id !== member.id)
          : current.map((row) => (row.id === member.id ? { ...row, archivedAt: new Date().toISOString() } : row)),
      )
      setConfirming(null)
      closeSheet()
      toast(removedToast(member.name))
      return
    }
    setRemoving(true)
    const result = member.userId ? await removeHouseholdMember(member.userId) : await archiveFamilyProfile(member.id)
    setRemoving(false)
    if (!result.ok) {
      toast(result.message)
      return
    }
    setHiddenIds((current) => (current.includes(member.id) ? current : [...current, member.id]))
    setConfirming(null)
    closeSheet()
    toast(removedToast(member.name))
    router.refresh()
  }

  return (
    <div className="grid gap-5">
      <header className="flex items-center justify-between gap-3">
        <h1 className="font-display text-[28px] font-semibold tracking-[-0.02em] text-ink md:text-[30px]">{FAMILY_COPY.title}</h1>
        {canAdd && !error ? (
          <Button type="button" onClick={openAdd} className="h-10 rounded-button px-3.5 text-primary-foreground max-md:min-h-11">
            {FAMILY_COPY.add}
          </Button>
        ) : null}
      </header>

      {beforeList}

      {error ? <WidgetError /> : null}

      {!error && visible.length === 0 ? (
        <div className="rounded-[12px] border border-border bg-surface px-5 py-8 text-center shadow-soft">
          <p className="text-sm text-muted-foreground">{canAdd ? FAMILY_COPY.emptyOwner : FAMILY_COPY.emptyMember}</p>
          {canAdd ? (
            <div className="mt-4 flex justify-center">
              <Button type="button" onClick={openAdd} className="h-10 rounded-button px-3.5 text-primary-foreground max-md:min-h-11">
                {FAMILY_COPY.add}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {visible.length > 0 ? (
        <ul className="grid gap-2.5 md:grid-cols-2">
          {visible.map((member) => {
            const birthday = formatBirthday(member.birthday)
            const detail = familyDetail(member)
            return (
              <li key={member.id}>
                <button
                  type="button"
                  onClick={() => openEdit(member)}
                  className="deanly-card flex w-full items-center gap-3 px-4 py-3.5 text-left transition-transform duration-150 hover:-translate-y-px"
                >
                  <span
                    aria-hidden="true"
                    className="flex size-10 shrink-0 items-center justify-center rounded-full font-display text-[13px] font-semibold text-ink"
                    style={{ backgroundColor: familyAvatarTint(member.color) }}
                  >
                    {familyInitials(member.name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-display text-[16px] font-semibold leading-5 text-ink">
                      {member.name}
                      {member.userId && member.userId === viewerId ? (
                        <span className="ml-1.5 font-sans text-[14px] font-normal text-muted-foreground">{FAMILY_COPY.you}</span>
                      ) : null}
                    </span>
                    {detail ? (
                      <span className="mt-0.5 block truncate font-sans text-[14px] text-muted-foreground">{detail}</span>
                    ) : null}
                  </span>
                  {birthday ? <span className="shrink-0 font-sans text-[14px] text-muted-foreground">{birthday}</span> : null}
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}
      <div aria-hidden="true" className="h-[calc(8.5rem+env(safe-area-inset-bottom))] md:hidden" />

      <Sheet open={sheet !== null} onOpenChange={(open) => { if (!open) closeSheet() }}>
        <SheetContent
          side={side}
          overlayClassName="z-[80] bg-ink/45 backdrop-blur-none"
          className={cn(
            "z-[80] gap-0 overflow-y-auto bg-background opacity-100",
            side === "right" && "w-[420px]! max-w-[420px]! sm:max-w-[420px]!",
            side === "bottom" && "max-h-[92dvh] rounded-t-2xl border-border",
          )}
          style={{ backgroundColor: "var(--background)", opacity: 1 }}
        >
          {side === "bottom" ? <div aria-hidden="true" className="mx-auto mt-3 h-1 w-10 rounded-full bg-border" /> : null}
          <SheetHeader className="pr-10">
            <SheetTitle className="font-display text-lg">{sheet?.kind === "edit" ? FAMILY_COPY.editTitle : FAMILY_COPY.addTitle}</SheetTitle>
            <SheetDescription className="sr-only">
              {editingLogin ? "Name, access, and color." : "Name, role, birthday, color, and notes."}
            </SheetDescription>
          </SheetHeader>
          <form onSubmit={onSave} className="grid gap-4 px-4 pb-5">
            <div className="grid gap-1.5">
              <Label htmlFor="family-name">{FAMILY_COPY.nameLabel}</Label>
              <Input
                id="family-name"
                value={form.name}
                disabled={!writingName}
                autoComplete="off"
                aria-invalid={Boolean(fieldError.name)}
                aria-describedby={fieldError.name ? "family-name-error" : undefined}
                onChange={(event) => {
                  setForm((current) => ({ ...current, name: event.target.value }))
                  if (fieldError.name) setFieldError((current) => ({ ...current, name: undefined }))
                }}
                className="h-11 rounded-button bg-surface px-3"
              />
              {fieldError.name ? (
                <p id="family-name-error" className="text-sm text-danger">
                  {fieldError.name}
                </p>
              ) : null}
            </div>
            {editingLogin ? (
              <fieldset className="grid gap-2" disabled={!writingPermission}>
                <legend id="family-permission" className="text-sm font-medium">
                  {FAMILY_COPY.permissionLabel}
                </legend>
                <div role="radiogroup" aria-labelledby="family-permission" className="grid gap-3">
                  {HOUSEHOLD_PERMISSIONS.map((permission) => {
                    const selected = form.permission === permission.id
                    return (
                      <label key={permission.id} className="grid gap-0.5 text-sm">
                        <span className="flex items-center gap-2">
                          <input
                            type="radio"
                            name="family-permission"
                            value={permission.id}
                            checked={selected}
                            disabled={!writingPermission}
                            onChange={() => {
                              setForm((current) => ({ ...current, permission: permission.id }))
                              if (fieldError.permission) setFieldError((current) => ({ ...current, permission: undefined }))
                            }}
                            className="size-4 accent-primary"
                          />
                          {permission.label}
                        </span>
                        <span className="pl-6 text-muted-foreground">{permission.help}</span>
                      </label>
                    )
                  })}
                </div>
                {accessNote ? <p className="text-sm text-muted-foreground">{accessNote}</p> : null}
                {fieldError.permission ? <p className="text-sm text-danger">{fieldError.permission}</p> : null}
              </fieldset>
            ) : null}
            {showKidFields ? (
              <div className="grid gap-1.5">
                <Label htmlFor="family-role">{FAMILY_COPY.roleLabel}</Label>
                <Input
                  id="family-role"
                  value={form.role}
                  disabled={!writingDetails}
                  placeholder={FAMILY_COPY.rolePlaceholder}
                  autoComplete="off"
                  aria-invalid={Boolean(fieldError.role)}
                  onChange={(event) => setForm((current) => ({ ...current, role: event.target.value }))}
                  className="h-11 rounded-button bg-surface px-3"
                />
                {fieldError.role ? <p className="text-sm text-danger">{fieldError.role}</p> : null}
              </div>
            ) : null}
            {showKidFields ? (
              <div className="grid gap-1.5">
                <Label htmlFor="family-birthday">{FAMILY_COPY.birthdayLabel}</Label>
                <Input
                  id="family-birthday"
                  type="date"
                  value={form.birthday}
                  disabled={!writingDetails}
                  aria-invalid={Boolean(fieldError.birthday)}
                  onChange={(event) => setForm((current) => ({ ...current, birthday: event.target.value }))}
                  className="h-11 rounded-button bg-surface px-3"
                />
                {fieldError.birthday ? <p className="text-sm text-danger">{fieldError.birthday}</p> : null}
              </div>
            ) : null}
            <fieldset className="grid gap-2">
              <legend className="text-sm font-medium">{FAMILY_COPY.colorLabel}</legend>
              <div role="radiogroup" aria-label={FAMILY_COPY.colorLabel} className="flex flex-wrap gap-2">
                {FAMILY_COLORS.map((color) => {
                  const selected = form.color === color.id
                  return (
                    <button
                      key={color.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      aria-label={color.label}
                      disabled={!writingName}
                      onClick={() => setForm((current) => ({ ...current, color: color.id }))}
                      className={cn(
                        "size-10 rounded-full ring-offset-2 ring-offset-surface disabled:opacity-70",
                        selected && "ring-2 ring-ink",
                      )}
                      style={{ backgroundColor: color.swatch }}
                    />
                  )
                })}
              </div>
              {fieldError.color ? <p className="text-sm text-danger">{fieldError.color}</p> : null}
            </fieldset>
            {showKidFields ? (
              <div className="grid gap-1.5">
                <Label htmlFor="family-notes">{FAMILY_COPY.notesLabel}</Label>
                <textarea
                  id="family-notes"
                  rows={3}
                  value={form.notes}
                  disabled={!writingDetails}
                  aria-invalid={Boolean(fieldError.notes)}
                  onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                  className="rounded-button border border-input bg-surface px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-70"
                />
                {fieldError.notes ? <p className="text-sm text-danger">{fieldError.notes}</p> : null}
              </div>
            ) : null}
            <div
              className={cn(
                "sticky bottom-0 z-10 -mx-4 mt-1 flex items-center justify-end gap-2 border-t border-border bg-background px-4 pt-3",
                side === "bottom" ? "pb-[calc(6.75rem+env(safe-area-inset-bottom))]" : "pb-4",
              )}
            >
              <Button type="button" variant="outline" className="h-10 rounded-button max-md:min-h-11" onClick={closeSheet}>
                {FAMILY_COPY.cancel}
              </Button>
              {writingName ? (
                <Button type="submit" disabled={pending} className="h-10 rounded-button text-primary-foreground max-md:min-h-11">
                  {pending ? "Saving…" : FAMILY_COPY.save}
                </Button>
              ) : null}
            </div>
            {canRemove && editing ? (
              <button
                type="button"
                className="justify-self-start text-sm font-medium text-danger"
                onClick={() => setConfirming(editing)}
              >
                {FAMILY_COPY.remove}
              </button>
            ) : null}
          </form>
        </SheetContent>
      </Sheet>

      <Dialog open={confirming !== null} onOpenChange={(open) => { if (!open && !removing) setConfirming(null) }}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle className="font-display text-lg">{confirming ? removeTitle(confirming.name) : FAMILY_COPY.remove}</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              {confirming?.userId ? FAMILY_COPY.removeLoginBody : FAMILY_COPY.removeBody}
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-end gap-3">
            <Button type="button" variant="outline" className="h-10 rounded-button" disabled={removing} onClick={() => setConfirming(null)}>
              {FAMILY_COPY.cancel}
            </Button>
            <Button type="button" variant="destructive" className="h-10 rounded-button" disabled={removing} onClick={() => void onRemove()}>
              {removing ? "Removing…" : "Remove"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
