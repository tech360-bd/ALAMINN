import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root: a parent directory lockfile (bun.lock) otherwise
  // makes Turbopack treat the parent as root and load ITS .env/database.
  turbopack: { root: process.cwd() },
  output: "standalone",
  // Production MUST NOT ignore TypeScript errors — build fails on type errors.
  typescript: {
    ignoreBuildErrors: false,
  },
  reactStrictMode: false,
  allowedDevOrigins: ["*.e2b.app", "*.space-z.ai", "127.0.0.1", "localhost", "21.0.4.174"],
  // Tree-shake and optimize large icon/utility libraries so only the
  // icons actually used end up in the client bundle.
  experimental: {
    // Keep production compilation within small-server memory budgets.
    cpus: 2,
    optimizePackageImports: ["lucide-react", "framer-motion", "date-fns"],
  },
  // Compress responses with gzip + brotli where the client supports it.
  compress: true,
  // Send ETag headers for static and page responses to improve caching.
  generateEtags: true,
  // Power the HTTP cache for static assets (1 year, immutable).
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'; connect-src 'self'" },
          { key: "Cache-Control", value: "no-cache" },
        ],
      },
      {
        source: "/_next/static/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      {
        source: "/brand/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=86400" },
        ],
      },
      {
        source: "/favicon.svg",
        headers: [
          { key: "Cache-Control", value: "public, max-age=604800" },
        ],
      },
    ];
  },
  images: {
    formats: ["image/avif", "image/webp"],
    qualities: [75, 85],
    minimumCacheTTL: 3600,
    remotePatterns: [
      { protocol: "https", hostname: "alaminn.info" },
      { protocol: "https", hostname: "www.alaminn.info" },
      { protocol: "https", hostname: "image.pollinations.ai" },
    ],
  },
};

export default nextConfig;
