export const REMEMBER_COOKIE = "deanly-remember"

function isDeletion(options: Record<string, unknown>) {
  if (options.maxAge === 0) return true
  const expires = options.expires
  return expires instanceof Date && expires.getTime() <= Date.now()
}

export function withRemember<T extends Record<string, unknown> | undefined>(
  options: T,
  remember: boolean,
): T {
  if (!options || remember || isDeletion(options)) return options
  const rest = { ...options }
  delete rest.maxAge
  delete rest.expires
  return rest
}
