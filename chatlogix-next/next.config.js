/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 确保流式 API 路由不会被缓冲
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
}

module.exports = nextConfig
