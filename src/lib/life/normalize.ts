const PREP_WORDS = new Set(["chopped", "diced", "minced", "sliced", "fresh", "large", "small"])

const PLURAL_EXCEPTIONS = new Set([
  "hummus",
  "molasses",
  "asparagus",
  "couscous",
  "swiss chard",
  "greens",
])

const STAPLE_CANONICALS = new Set(["salt", "pepper", "oil", "water"])

export type IngredientAlias = { alias: string; canonical: string; staple?: boolean }

/** Leading quantity, then prep words. The stored name on the row stays as typed. */
export function normalizeIngredientName(input: string) {
  let text = input.trim().toLowerCase().replace(/,/g, " ").replace(/\s+/g, " ")
  text = text.replace(/^(?:\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)\s+/, "")
  const words = text.split(" ").filter((word) => word && !PREP_WORDS.has(word))
  text = words.join(" ")
  if (!text || PLURAL_EXCEPTIONS.has(text)) return text
  if (text.endsWith("ies") && text.length > 4) return `${text.slice(0, -3)}y`
  if (text.endsWith("oes") && text.length > 4) return text.slice(0, -2)
  if (text.endsWith("s") && !text.endsWith("ss") && !text.endsWith("us") && text.length > 3) return text.slice(0, -1)
  return text
}

export function canonicalIngredient(input: string, aliases: IngredientAlias[] = []) {
  const normalized = normalizeIngredientName(input)
  const match = aliases.find((row) => row.alias === normalized)
  return match?.canonical ?? normalized
}

/** Exact canonical equality after normalization. Chicken broth does not match chicken. */
export function ingredientNamesMatch(left: string, right: string, aliases: IngredientAlias[] = []) {
  const a = canonicalIngredient(left, aliases)
  const b = canonicalIngredient(right, aliases)
  return a.length > 0 && a === b
}

export function isStapleIngredient(input: string, aliases: IngredientAlias[] = []) {
  const key = canonicalIngredient(input, aliases)
  if (STAPLE_CANONICALS.has(key)) return true
  return aliases.some((row) => row.staple && (row.alias === key || row.canonical === key))
}
