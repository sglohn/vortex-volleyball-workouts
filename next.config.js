// FILE: next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
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
