import type { NextConfig } from "next";
import { loadEnvConfig } from "@next/env";

// Load environment variables from the project root bcoz next.config.ts is processed before the standard environment variable loading occurs
const projectDir = process.cwd();
loadEnvConfig(projectDir);

const ROLE = process.env.ROLE;
const nextConfig: NextConfig = {
  reactStrictMode: true,

  env: {
    ROLE: ROLE,
    NEXT_PUBLIC_ROLE: ROLE,
  },

  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'laundrease.in' },
      { protocol: 'http', hostname: 'localhost' },
    ],
    formats: ['image/avif', 'image/webp'],
  },

  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'origin-when-cross-origin' },
        ],
      },
    ];
  },

  async rewrites() {
    const baseRewrites = [
      { source: '/', destination: `/${ROLE}` },
    ];
    return baseRewrites;
  },

  // Keep turbopack object (empty) — Turbopack options do not accept `alias`
  turbopack: {},
};

export default nextConfig;