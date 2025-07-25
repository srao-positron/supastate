/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
  images: {
    domains: ['avatars.githubusercontent.com', 'github.com'],
  },
  // Enable source maps in production for better debugging
  productionBrowserSourceMaps: true,
}

module.exports = nextConfig