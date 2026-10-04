import { MONEY_STARTERS, OTHER_LABEL, categoryGroupLabel, cleanCategory } from "@/lib/money/board"

/**
 * Fixed words for the starter groups already in MONEY_STARTERS.
 * Matching stays in this module. It does not call a service, model, or API.
 * People is not listed. A phrase matches only as whole words, in order.
 * The longest phrase wins. The same length keeps the phrase earlier in the name.
 * The same start keeps the earlier starter group. The section's Other label has no words.
 */
export const CATEGORY_WORDS = {
  bills: {
    Housing: [
      "rent",
      "rental",
      "lease",
      "landlord",
      "mortgage",
      "hoa",
      "homeowners association",
      "home owners association",
      "apartment",
      "housing",
      "lot rent",
      "property tax",
      "property taxes",
      "rent payment",
    ],
    Utilities: [
      "electric",
      "electricity",
      "utility",
      "utilities",
      "water",
      "sewer",
      "sewage",
      "trash",
      "garbage",
      "recycling",
      "internet",
      "wifi",
      "wi fi",
      "broadband",
      "power",
      "natural gas",
      "gas",
      "phone",
      "cellphone",
      "cell phone",
      "mobile",
      "waste management",
    ],
    Insurance: [
      "insurance",
      "premium",
      "geico",
      "progressive",
      "allstate",
      "state farm",
      "usaa",
      "farmers",
      "renters insurance",
      "renter insurance",
      "car insurance",
      "auto insurance",
      "health insurance",
      "home insurance",
      "homeowners insurance",
      "life insurance",
      "dental insurance",
      "vision insurance",
    ],
    Transportation: [
      "car",
      "auto",
      "vehicle",
      "truck",
      "fuel",
      "gasoline",
      "gas station",
      "uber",
      "lyft",
      "transit",
      "bus",
      "train",
      "subway",
      "parking",
      "commute",
      "toll",
      "tolls",
      "car wash",
      "registration",
      "motorcycle",
      "metro pass",
    ],
    "Debt & Loans": [
      "loan",
      "loans",
      "debt",
      "student loan",
      "car loan",
      "auto loan",
      "truck loan",
      "car payment",
      "truck payment",
      "auto payment",
      "financing",
      "credit card payment",
    ],
    "Family & Household": [
      "daycare",
      "day care",
      "childcare",
      "child care",
      "babysitter",
      "babysitting",
      "groceries",
      "grocery",
      "tuition",
      "allowance",
      "veterinary",
      "veterinarian",
      "vet",
      "pet",
      "pets",
      "pet food",
      "diaper",
      "diapers",
    ],
  },
  income: {
    "Primary Income": ["paycheck", "pay check", "paycheque", "salary", "wage", "wages", "payroll", "direct deposit"],
    "Secondary Income": ["bonus", "overtime", "commission", "tips", "part time", "second job", "side job"],
    "Freelance / Business": [
      "freelance",
      "freelancer",
      "consulting",
      "consultant",
      "contract",
      "side hustle",
      "side work",
      "business",
      "invoice",
      "1099",
    ],
    Reimbursements: ["reimbursement", "reimbursements", "reimburse", "refund", "expense report", "paid back", "tax refund"],
    Benefits: [
      "benefit",
      "benefits",
      "social security",
      "pension",
      "unemployment",
      "disability",
      "ssi",
      "ssdi",
      "medicare",
      "medicaid",
      "stipend",
      "veterans",
      "child support",
    ],
  },
  savings: {
    "Emergency Fund": ["emergency", "rainy day"],
    "Short-Term Goals": ["short term", "near term"],
    Vacation: ["vacation", "travel", "trip", "beach", "cruise", "airfare", "flight", "weekend away", "holiday trip"],
    "Christmas / Holidays": ["christmas", "xmas", "hanukkah", "chanukah", "kwanzaa", "holiday", "holidays", "gift fund", "gifts"],
    "Large Purchases": [
      "large purchase",
      "appliance",
      "appliances",
      "furniture",
      "refrigerator",
      "fridge",
      "washer",
      "dryer",
      "laptop",
      "computer",
      "television",
      "tv",
    ],
    Home: ["home", "house", "renovation", "remodel", "down payment", "new roof", "roof"],
    Vehicle: ["vehicle", "car", "truck", "tires", "tire", "new tires", "motorcycle", "car fund", "car down payment", "truck down payment"],
    "Long-Term Goals": ["long term", "retirement", "401k", "401 k", "roth ira", "college", "university"],
  },
  subscriptions: {
    Entertainment: ["entertainment", "steam", "xbox", "playstation", "nintendo", "game pass", "apple arcade", "audible"],
    Streaming: [
      "streaming",
      "netflix",
      "hulu",
      "disney",
      "disney plus",
      "hbo",
      "hbo max",
      "peacock",
      "paramount",
      "showtime",
      "crunchyroll",
      "prime video",
      "amazon prime",
      "apple tv",
      "youtube",
      "espn",
    ],
    Music: ["music", "spotify", "apple music", "pandora", "tidal", "youtube music", "siriusxm", "sirius xm", "deezer", "soundcloud"],
    Technology: ["technology", "domain", "github", "godaddy", "namecheap", "aws", "vercel", "netlify"],
    "AI / Software": [
      "software",
      "chatgpt",
      "openai",
      "claude",
      "anthropic",
      "gemini",
      "copilot",
      "github copilot",
      "midjourney",
      "cursor",
      "perplexity",
      "notion",
      "adobe",
      "figma",
      "canva",
      "slack",
      "zoom",
      "microsoft",
      "office 365",
      "1password",
      "bitwarden",
    ],
    "Cloud Storage": ["cloud storage", "icloud", "i cloud", "dropbox", "google one", "google drive", "onedrive", "one drive", "backblaze"],
    Fitness: ["fitness", "gym", "peloton", "strava", "classpass", "planet fitness", "anytime fitness", "apple fitness"],
    "Household Services": [
      "cleaning",
      "house cleaning",
      "lawn",
      "lawn care",
      "pest control",
      "housekeeper",
      "housekeeping",
      "maid",
      "adt",
      "simplisafe",
      "home security",
    ],
  },
  cards: {
    "Credit Cards": ["credit", "visa", "mastercard", "master card", "amex", "american express", "discover", "charge card"],
    "Debit Cards": ["debit", "check card", "visa debit", "mastercard debit", "debit card"],
    "Bank Cards": ["checking", "bank card", "atm", "atm card"],
  },
} as const

type Section = keyof typeof MONEY_STARTERS

type Phrase = { group: string; tokens: string[] }

function tokenize(value: string) {
  const text = value
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
  if (!text) return []
  return text.split(/\s+/)
}

function findSequence(haystack: string[], needle: string[]) {
  if (needle.length === 0 || needle.length > haystack.length) return -1
  for (let start = 0; start <= haystack.length - needle.length; start += 1) {
    let matches = true
    for (let offset = 0; offset < needle.length; offset += 1) {
      if (haystack[start + offset] !== needle[offset]) {
        matches = false
        break
      }
    }
    if (matches) return start
  }
  return -1
}

function phrasesFor(section: Section): Phrase[] {
  const words = CATEGORY_WORDS[section] as Partial<Record<string, readonly string[]>>
  const phrases: Phrase[] = []
  for (const group of MONEY_STARTERS[section]) {
    for (const phrase of words[group] ?? []) {
      const tokens = tokenize(phrase)
      if (tokens.length > 0) phrases.push({ group, tokens })
    }
  }
  return phrases
}

const PHRASES = {
  bills: phrasesFor("bills"),
  income: phrasesFor("income"),
  savings: phrasesFor("savings"),
  subscriptions: phrasesFor("subscriptions"),
  cards: phrasesFor("cards"),
} as const

/** Starter group for this name, or that section's Other label when nothing fits. */
export function matchMoneyGroup(section: Section, name: string) {
  const haystack = tokenize(name)
  if (haystack.length === 0) return OTHER_LABEL[section]
  let best: { group: string; length: number; index: number } | null = null
  for (const phrase of PHRASES[section]) {
    const index = findSequence(haystack, phrase.tokens)
    if (index < 0) continue
    const length = phrase.tokens.length
    if (!best || length > best.length || (length === best.length && index < best.index)) {
      best = { group: phrase.group, length, index }
    }
  }
  return best?.group ?? OTHER_LABEL[section]
}

/** Blank, or the Other label that section already uses. */
export function isOtherCategory(section: Section, category: unknown) {
  const cleaned = cleanCategory(category)
  if (!cleaned) return true
  return cleaned.toLowerCase() === OTHER_LABEL[section].toLowerCase()
}

/**
 * Category to store. A real group is kept, including on a later edit.
 * Auto mode, blank, and the section's Other label take the name match.
 * No match stays blank, which still means Other.
 */
export function categoryToStore(section: Section, name: string, category: unknown, mode?: unknown) {
  const cleaned = cleanCategory(category)
  const chosen = cleaned && !isOtherCategory(section, cleaned) ? cleaned : null
  if (chosen && mode !== "auto") return chosen
  const matched = matchMoneyGroup(section, name)
  if (isOtherCategory(section, matched)) return null
  return cleanCategory(matched)
}

/** Group label for a row already in hand. A saved real group stays. Blank or Other follows the name. */
export function placeMoneyCategory(section: Section, name: string, category: string | null | undefined) {
  if (!isOtherCategory(section, category)) return categoryGroupLabel(section, category)
  return matchMoneyGroup(section, name)
}
