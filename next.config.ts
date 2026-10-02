import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["web-push"],
  async redirects() {
    return [
      { source: "/life", destination: "/life/calendar", permanent: false },
      { source: "/life/subscriptions", destination: "/money/subscriptions", permanent: false },
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
    ]
  },
};

export default nextConfig;
