export const APPEARANCE_COOKIE = "deanly-appearance"
export const APPEARANCE_STORAGE_KEY = "deanly-appearance"

export type Appearance = "light" | "dark"

/** Day is the default. `system` is reserved and not offered in Settings yet. */
export function parseAppearance(value: string | null | undefined): Appearance {
  return value === "dark" ? "dark" : "light"
}

/**
 * Runs before paint. Cookie wins so the server-rendered class and this script agree.
 * localStorage is filled to match, which is what next-themes reads.
 * Login and the signed-in shell share this preference.
 */
export const appearanceBootScript = `(function(){try{var key=${JSON.stringify(APPEARANCE_STORAGE_KEY)};var stored=null;try{stored=localStorage.getItem(key)}catch(e){}var match=document.cookie.match(new RegExp("(?:^|; )"+key+"=(light|dark)"));var fromCookie=match?match[1]:null;var theme=fromCookie==="light"||fromCookie==="dark"?fromCookie:(stored==="light"||stored==="dark"?stored:"light");try{if(stored!==theme)localStorage.setItem(key,theme)}catch(e){}if(!fromCookie)document.cookie=key+"="+theme+"; Path=/; Max-Age=31536000; SameSite=Lax";var root=document.documentElement;root.classList.remove("light","dark");root.classList.add(theme);root.style.colorScheme=theme}catch(e){}})();`

export function persistAppearance(appearance: Appearance) {
  if (typeof document === "undefined") return
  document.cookie = `${APPEARANCE_COOKIE}=${appearance}; Path=/; Max-Age=31536000; SameSite=Lax`
  try {
    localStorage.setItem(APPEARANCE_STORAGE_KEY, appearance)
  } catch {
    // Storage can be blocked; the cookie still survives a reload.
  }
}
