import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  // Transpile workspace packages so TS sources resolve without a build step.
  transpilePackages: ['@cap/shared', '@cap/db'],
  experimental: {
    // Keep server actions for forms; we still use API routes for webhooks.
    serverActions: { bodySizeLimit: '2mb' },
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=()' },
        ],
      },
    ];
  },
};

export default config;
