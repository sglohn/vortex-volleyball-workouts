// FILE: next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  // Which club this deployment is (see lib/brand.ts). Defaulting it here
  // makes sure it's always baked into the build, so each site only ships
  // its own brand's names, colors and logos.
  env: {
    NEXT_PUBLIC_BRAND: process.env.NEXT_PUBLIC_BRAND || 'vortex',
  },
  // The TV Display snapshot route runs a headless Chromium. These packages
  // must be loaded from node_modules at runtime instead of being bundled,
  // and Chromium's compressed binary files must be included in the
  // deployed function.
  serverExternalPackages: ['@sparticuz/chromium', 'puppeteer-core'],
  outputFileTracingIncludes: {
    '/api/display-snapshot': ['./node_modules/@sparticuz/chromium/bin/**'],
  },
}

module.exports = nextConfig
