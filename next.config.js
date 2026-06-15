/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Chromium serverless y playwright-core se cargan desde node_modules en
  // runtime (no se empaquetan con webpack, que rompería el binario).
  experimental: {
    serverComponentsExternalPackages: ['@sparticuz/chromium', 'playwright-core', 'playwright'],
  },
};

module.exports = nextConfig;
