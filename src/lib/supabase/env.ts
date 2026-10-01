const PLACEHOLDERS = [
  "your-project",
  "your-anon",
  "your-publishable",
  "supabase_project_url",
  "supabase_publishable_key",
]

function clean(value: string | undefined) {
  const trimmed = value?.trim()
  if (!trimmed) return null
  const lower = trimmed.toLowerCase()
  if (PLACEHOLDERS.some((marker) => lower.includes(marker))) return null
  return trimmed
}

export function getSupabaseUrl() {
  const url = clean(process.env.NEXT_PUBLIC_SUPABASE_URL)
  if (!url) return null
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null
    return url.replace(/\/$/, "")
  } catch {
    return null
  }
}

export function getSupabaseAnonKey() {
  return clean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
}

export function getSupabasePublishableKey() {
  return clean(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
}

/**
 * API key for createBrowserClient / createServerClient.
 * @supabase/ssr takes one supabaseKey string and does not prefer the
 * publishable-key format, so Deanly sends the legacy anon JWT when it is set.
 */
export function getSupabaseClientKey() {
  return getSupabaseAnonKey() ?? getSupabasePublishableKey()
}

export function isSupabaseConfigured() {
  return Boolean(getSupabaseUrl() && getSupabaseClientKey())
}

export function requireSupabaseEnv() {
  const url = getSupabaseUrl()
  const key = getSupabaseClientKey()
  if (!url || !key) {
    throw new Error("Supabase is not configured.")
  }
  return { url, key }
}

export function getConfiguredSiteUrl() {
  const site = clean(process.env.NEXT_PUBLIC_SITE_URL)
  return site?.replace(/\/$/, "") ?? null
}
