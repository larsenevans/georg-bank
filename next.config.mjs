import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Disable X-Powered-By header to prevent fingerprinting
  poweredByHeader: false,
  // Prevent Next from picking ~/package-lock.json as monorepo root (slow/wrong compiles).
  outputFileTracingRoot: projectRoot,
  turbopack: {
    root: projectRoot,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  allowedDevOrigins: ['*.ts.net', 'node-404.tail8c034f.ts.net'],
  images: {
    unoptimized: true,
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-Robots-Tag',
            value: 'noindex, nofollow, noarchive, nosnippet',
          },
        ],
      },
    ]
  },
}

export default nextConfig
