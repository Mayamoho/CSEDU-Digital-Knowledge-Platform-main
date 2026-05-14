/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  async rewrites() {
    const apiUrl = process.env.INTERNAL_API_URL || 'http://localhost:8080/api/v1';
    const apiBase = apiUrl.replace('/api/v1', '');
    return [
      {
        source: '/api/v1/:path*',
        destination: `${apiBase}/api/v1/:path*`,
      },
    ];
  },
}

export default nextConfig
