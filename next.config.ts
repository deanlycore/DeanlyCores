import type { NextConfig } from "next";

import { mealPlannerRedirects, recipeCatalogImageCsp, recipeCatalogRemotePatterns } from "./src/lib/life/catalog";

const nextConfig: NextConfig = {
  serverExternalPackages: ["web-push"],
  images: {
    remotePatterns: recipeCatalogRemotePatterns(process.env.NEXT_PUBLIC_SUPABASE_URL),
  },
  async redirects() {
    return [
      { source: "/life", destination: "/life/calendar", permanent: false },
      { source: "/life/subscriptions", destination: "/money/subscriptions", permanent: false },
      ...mealPlannerRedirects(),
    ]
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: recipeCatalogImageCsp(process.env.NEXT_PUBLIC_SUPABASE_URL),
          },
        ],
      },
    ]
  },
};

export default nextConfig;
