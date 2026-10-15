export type UnitGroup = "mass" | "volume" | "count" | "package"

type UnitDef = {
  canonical: string
  group: UnitGroup
  toBase: number
  aliases: string[]
}

const UNITS: UnitDef[] = [
  { canonical: "g", group: "mass", toBase: 1, aliases: ["g", "gram", "grams"] },
  { canonical: "kg", group: "mass", toBase: 1000, aliases: ["kg", "kilogram", "kilograms"] },
  { canonical: "ml", group: "volume", toBase: 1, aliases: ["ml", "milliliter", "milliliters"] },
  { canonical: "l", group: "volume", toBase: 1000, aliases: ["l", "liter", "liters"] },
  { canonical: "cup", group: "volume", toBase: 240, aliases: ["cup", "cups"] },
  { canonical: "each", group: "count", toBase: 1, aliases: ["each", "ct"] },
  { canonical: "pack", group: "package", toBase: 1, aliases: ["pack", "package", "pkg"] },
]

const BY_ALIAS = new Map<string, UnitDef>()
for (const unit of UNITS) {
  for (const alias of unit.aliases) BY_ALIAS.set(alias, unit)
}

export type Amount = { qty: number; unit: string }

export function resolveUnit(unit: string) {
  const key = unit.trim().toLowerCase()
  const found = BY_ALIAS.get(key)
  if (!found) return null
  return { canonical: found.canonical, group: found.group, toBase: found.toBase }
}

function displayMass(base: number): Amount {
  if (base >= 1000) return { qty: trimQty(base / 1000), unit: "kg" }
  return { qty: trimQty(base), unit: "g" }
}

function displayVolume(base: number, canonical: string): Amount {
  if (canonical === "cup") return { qty: trimQty(base / 240), unit: "cup" }
  if (base >= 1000) return { qty: trimQty(base / 1000), unit: "l" }
  return { qty: trimQty(base), unit: "ml" }
}

function trimQty(value: number) {
  return Math.round(value * 1000) / 1000
}

/** Sum amounts in one unit group. Different groups, including cup and g, do not merge. */
export function mergeAmounts(lines: Amount[]): Amount | null {
  if (lines.length === 0) return null
  const resolved = lines.map((line) => {
    const unit = resolveUnit(line.unit)
    if (!unit || !(line.qty > 0)) return null
    return { ...unit, base: line.qty * unit.toBase }
  })
  if (resolved.some((line) => !line)) return null
  const known = resolved as { canonical: string; group: UnitGroup; toBase: number; base: number }[]
  const group = known[0].group
  if (known.some((line) => line.group !== group)) return null
  const base = known.reduce((sum, line) => sum + line.base, 0)
  if (group === "mass") return displayMass(base)
  if (group === "volume") {
    const canonical = known.every((line) => line.canonical === known[0].canonical) ? known[0].canonical : "ml"
    return displayVolume(base, canonical)
  }
  const unit = known[0].canonical
  if (known.some((line) => line.canonical !== unit)) return null
  return { qty: trimQty(base / known[0].toBase), unit }
}
