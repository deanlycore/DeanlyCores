import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Deanly — DeanFamily",
    short_name: "Deanly",
    description: "Keep life together, effortlessly.",
    start_url: "/home",
    scope: "/",
    display: "standalone",
    background_color: "#faf8f5",
    theme_color: "#249b8a",
    prefer_related_applications: false,
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  }
}
