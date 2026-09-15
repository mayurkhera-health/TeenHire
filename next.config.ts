import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  /* Emits .next/standalone with only the files the server actually needs,
     which is what the container copies. Static assets are not included in it
     — the Dockerfile copies .next/static and public/ alongside. */
  output: 'standalone',
  /* Development only, and ignored in a build.
   *
   * Next refuses cross-origin development requests, which means any address
   * other than the one the dev server was started on — including a phone on
   * the same Wi-Fi following the instructions in the README. The symptom is
   * silent: the page renders its loading state and the client bundle never
   * arrives, so it looks like the app is hanging rather than like a config
   * refusal. These are the private ranges a home or office network hands out. */
  allowedDevOrigins: [
    '127.0.0.1',
    '192.168.*.*',
    '10.*.*.*',
    '172.16.*.*',
    '172.17.*.*',
    '172.18.*.*',
    '172.19.*.*',
    '172.2*.*.*',
    '172.30.*.*',
    '172.31.*.*',
  ],
};

export default nextConfig;
