import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  output: "standalone",

  // Enable the instrumentation hook (src/instrumentation.ts)
  // This starts BullMQ workers and the sync scheduler on server boot
  experimental: {
    instrumentationHook: true,
  },

  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
      { protocol: "http", hostname: "localhost" },
    ],
  },

  // Packages that need Node.js APIs (not Edge-compatible)
  serverExternalPackages: [
    "bcryptjs",
    "otplib",
    "nodemailer",
    "imapflow",
    "puppeteer-core",
    "ioredis",
    "bullmq",
  ],

  // Allow uploads to be served from the /uploads path
  async rewrites() {
    return [
      {
        source: "/uploads/:path*",
        destination: "/api/files/:path*",
      },
    ]
  },
}

export default nextConfig
