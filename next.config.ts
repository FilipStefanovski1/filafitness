import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Every page is per-user and dynamic; we don't use Cache Components.
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
  serverExternalPackages: ['postgres'],
  poweredByHeader: false,
};

export default nextConfig;
