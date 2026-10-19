import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

export const CATALOG_PHOTO_MAX_BYTES = 1048576
export const CATALOG_PHOTO_WIDTH = 960
export const CATALOG_PHOTO_HEIGHT = 720

export type CatalogPhotoFile = {
  slug: string
  bytes: Buffer
}

export function catalogPhotoObjectPath(slug: string) {
  return `recipes/${slug}.webp`
}

export function assertLocalCatalogTarget(url: string) {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error("Refusing to seed a remote catalog. Use the local Supabase URL.")
  }
  const host = parsed.hostname
  if (host !== "127.0.0.1" && host !== "localhost" && host !== "::1") {
    throw new Error("Refusing to seed a remote catalog. Use the local Supabase URL.")
  }
}

export function webpSize(bytes: Buffer) {
  if (bytes.length < 30) return null
  if (bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WEBP") return null
  const kind = bytes.toString("ascii", 12, 16)
  if (kind === "VP8X") {
    return { width: 1 + bytes.readUIntLE(24, 3), height: 1 + bytes.readUIntLE(27, 3) }
  }
  if (kind === "VP8 ") {
    const start = bytes.indexOf(Buffer.from([0x9d, 0x01, 0x2a]))
    if (start < 0 || start + 7 > bytes.length) return null
    return {
      width: bytes.readUInt16LE(start + 3) & 0x3fff,
      height: bytes.readUInt16LE(start + 5) & 0x3fff,
    }
  }
  if (kind === "VP8L") {
    if (bytes[20] !== 0x2f) return null
    const bits = bytes.readUInt32LE(21)
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 }
  }
  return null
}

/** Every file must be `<slug>.webp` for a recipe in recipes.json. Nothing is returned until the whole folder passes. */
export function readCatalogPhotos(dir: string, slugs: string[]): CatalogPhotoFile[] {
  const expected = new Map(slugs.map((slug) => [`${slug}.webp`, slug]))
  let names: string[]
  try {
    names = readdirSync(dir, { withFileTypes: true }).map((entry) => {
      if (!entry.isFile()) throw new Error(`Recipe photo folder has an unexpected entry: ${entry.name}`)
      return entry.name
    })
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Recipe photo folder")) throw error
    throw new Error(`Recipe photo folder is missing: ${dir}`)
  }

  const problems: string[] = []
  const extras = names.filter((name) => !expected.has(name)).sort()
  const missing = [...expected.keys()].filter((name) => !names.includes(name)).sort()
  if (extras.length) problems.push(`Unexpected files: ${extras.join(", ")}.`)
  if (missing.length) problems.push(`Missing files: ${missing.join(", ")}.`)
  if (problems.length) {
    throw new Error(`Recipe photos must match recipes.json. ${problems.join(" ")}`)
  }

  const photos: CatalogPhotoFile[] = []
  for (const name of names.sort()) {
    const slug = expected.get(name)
    if (!slug) continue
    const bytes = readFileSync(join(dir, name))
    if (bytes.byteLength > CATALOG_PHOTO_MAX_BYTES) problems.push(`${name} is over the 1MB catalog limit.`)
    const size = webpSize(bytes)
    if (!size) problems.push(`${name} is not a WebP image.`)
    else if (size.width !== CATALOG_PHOTO_WIDTH || size.height !== CATALOG_PHOTO_HEIGHT) {
      problems.push(`${name} must be ${CATALOG_PHOTO_WIDTH}x${CATALOG_PHOTO_HEIGHT}.`)
    }
    photos.push({ slug, bytes })
  }
  if (problems.length) throw new Error(problems.join(" "))
  return photos
}
