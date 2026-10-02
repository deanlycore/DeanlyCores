import type { Metadata } from "next"
import { Geist_Mono, Inter, Plus_Jakarta_Sans } from "next/font/google"
import { cookies } from "next/headers"

import { ThemeProvider } from "@/components/theme/theme-provider"
import { appearanceBootScript, APPEARANCE_COOKIE, parseAppearance } from "@/lib/theme"

import { ServiceWorkerRegister } from "@/components/pwa/service-worker-register"

import "./globals.css"

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" })
const display = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display-family",
})
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" })

export const metadata: Metadata = {
  title: {
    default: "Deanly Tracking — DeanFamily",
    template: "%s · Deanly Tracking — DeanFamily",
  },
  description: "Keep life together, effortlessly.",
  applicationName: "Deanly Tracking",
  appleWebApp: {
    capable: true,
    title: "Deanly Tracking",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  other: {
    "apple-mobile-web-app-capable": "yes",
  },
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const appearance = parseAppearance((await cookies()).get(APPEARANCE_COOKIE)?.value)

  return (
    <html
      lang="en"
      className={`${inter.variable} ${display.variable} ${mono.variable} h-full antialiased${appearance === "dark" ? " dark" : ""}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: appearanceBootScript }} />
      </head>
      <body className="min-h-full bg-background text-foreground">
        <ThemeProvider>
          <ServiceWorkerRegister />
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
