import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import { parseAppearance } from "./theme.ts"

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../app/globals.css"), "utf8")

function block(selector: string) {
  const start = css.indexOf(selector)
  assert.ok(start >= 0, selector)
  const open = css.indexOf("{", start)
  let depth = 0
  for (let index = open; index < css.length; index += 1) {
    if (css[index] === "{") depth += 1
    else if (css[index] === "}") {
      depth -= 1
      if (depth === 0) return css.slice(open + 1, index)
    }
  }
  throw new Error(`unclosed ${selector}`)
}

function token(source: string, name: string) {
  const match = source.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{3,8})`))
  assert.ok(match, `--${name}`)
  return match[1].toLowerCase()
}

function channel(hex: string, start: number) {
  const value = Number.parseInt(hex.slice(start, start + 2), 16) / 255
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}

function contrast(foreground: string, background: string) {
  const lum = (hex: string) => {
    const normalized = hex.length === 4 ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}` : hex
    return 0.2126 * channel(normalized, 1) + 0.7152 * channel(normalized, 3) + 0.0722 * channel(normalized, 5)
  }
  const lighter = Math.max(lum(foreground), lum(background))
  const darker = Math.min(lum(foreground), lum(background))
  return (lighter + 0.05) / (darker + 0.05)
}

const day = block(":root")
const night = block(".dark,")

test("appearance parses only light and dark", () => {
  assert.equal(parseAppearance(undefined), "light")
  assert.equal(parseAppearance("light"), "light")
  assert.equal(parseAppearance("system"), "light")
  assert.equal(parseAppearance("dark"), "dark")
})

test("day hex values stay locked", () => {
  const locked: Record<string, string> = {
    bg: "#faf8f5",
    surface: "#ffffff",
    "surface-muted": "#f3efe9",
    ink: "#1c1917",
    "ink-muted": "#78716c",
    border: "#e7e0d6",
    brand: "#249b8a",
    "brand-deep": "#1a7a6d",
    "brand-soft": "#d5f2ec",
    warm: "#c4a484",
    success: "#5f8f6b",
    warn: "#b8956a",
    danger: "#a65d57",
    focus: "#249b8a",
  }
  for (const [name, hex] of Object.entries(locked)) {
    assert.equal(token(day, name), hex, name)
  }
})

test("night companion tokens match the theme spec", () => {
  const locked: Record<string, string> = {
    bg: "#141210",
    surface: "#1c1917",
    "surface-muted": "#26221e",
    sidebar: "#181614",
    ink: "#f5f0e8",
    "ink-muted": "#a8a29e",
    border: "#3a342e",
    brand: "#2eb8a4",
    "brand-deep": "#249b8a",
    "brand-soft": "#1a3d38",
    warm: "#c4a484",
    success: "#7aa884",
    warn: "#c4a574",
    danger: "#c47a74",
    focus: "#2eb8a4",
  }
  for (const [name, hex] of Object.entries(locked)) {
    assert.equal(token(night, name), hex, name)
  }
  assert.match(night, /0 1px 2px rgb\(0 0 0 \/ 0\.35\), 0 12px 32px rgb\(0 0 0 \/ 0\.45\)/)
  assert.match(night, /--brand-wash:\s*rgb\(26 61 56 \/ 0\.25\)/)
})

test("body text and night pills meet WCAG AA", () => {
  const pairs = [
    [token(day, "ink"), token(day, "bg")],
    [token(day, "ink"), token(day, "surface")],
    [token(day, "ink-muted"), token(day, "bg")],
    [token(day, "ink-muted"), token(day, "surface")],
    [token(night, "ink"), token(night, "bg")],
    [token(night, "ink"), token(night, "surface")],
    [token(night, "ink-muted"), token(night, "bg")],
    [token(night, "ink-muted"), token(night, "surface")],
    [token(night, "brand"), token(night, "brand-soft")],
    [token(night, "warm"), "#3e352d"],
  ]
  for (const [foreground, background] of pairs) {
    assert.ok(contrast(foreground, background) >= 4.5, `${foreground} on ${background}`)
  }
})
