import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
    esmExternals: true // Added for ESM support
  },
  eslint: {
    ignoreDuringBuilds: true, 
  },
  webpack: (config) => {
    config.experiments = {
      ...config.experiments,
      topLevelAwait: true,
      layers: true,
    }
    return config
  },
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          {
            key: 'Connection',
            value: 'keep-alive'
          },
          {
            key: 'Cache-Control',
            value: 'no-cache, no-transform'
          },
          {
            key: 'Transfer-Encoding',
            value: 'chunked'
          }
        ]
      }
    ]
  }
}

export default nextConfig