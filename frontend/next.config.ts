import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  // Standalone output creates a minimal self-contained server for Docker
  output: 'standalone',

  turbopack: {
    // Explicitly set root to this directory so Turbopack ignores
    // any stray package-lock.json files higher in the filesystem
    root: path.resolve(__dirname),
  },

  async rewrites() {
    // Proxy /media/** to the Django backend so images load from the same origin
    // as the Next.js app, avoiding cross-origin/hostname issues.
    // In production, set NEXT_PUBLIC_API_URL='' and let nginx serve /media/ directly.
    const apiBase = process.env.NEXT_PUBLIC_API_URL;
    if (!apiBase) return [];
    return [
      { source: '/media/:path*', destination: `${apiBase}/media/:path*` },
    ];
  },
};

export default nextConfig;
