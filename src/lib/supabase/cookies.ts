export const REMEMBER_COOKIE = "deanly-remember"

export function withRemember<T extends Record<string, unknown> | undefined>(
  options: T,
  remember: boolean,
): T {
  if (!options || remember) return options
  const rest = { ...options }
  delete rest.maxAge
  delete rest.expires
  return rest
}
