import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  /* Emits .next/standalone with only the files the server actually needs,
     which is what the container copies. Static assets are not included in it
     — the Dockerfile copies .next/static and public/ alongside. */
  output: 'standalone',
};

export default nextConfig;
