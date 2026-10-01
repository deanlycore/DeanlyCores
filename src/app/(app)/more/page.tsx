import type { Metadata } from "next"
import Link from "next/link"

import { signOut } from "@/lib/actions/auth"

export const metadata: Metadata = { title: "More" }

const links = [
  { href: "/vault", label: "Vault" },
  { href: "/reports", label: "Reports" },
  { href: "/notifications", label: "Notifications" },
  { href: "/settings", label: "Settings" },
]

export default function Page() {
  return (
    <div className="mx-auto grid max-w-lg gap-3">
      <h1 className="font-display text-[28px] font-semibold tracking-tight">More</h1>
      <ul className="deanly-card divide-y divide-border">
        {links.map((link) => (
          <li key={link.href}>
            <Link href={link.href} className="block px-5 py-4 font-medium">
              {link.label}
            </Link>
          </li>
        ))}
        <li>
          <form action={signOut}>
            <button type="submit" className="w-full px-5 py-4 text-left font-medium">
              Log out
            </button>
          </form>
        </li>
      </ul>
    </div>
  )
}
