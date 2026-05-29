/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  reactStrictMode: true,
  // GitHub Pages serves at https://kdrey21.github.io/edge-status/
  basePath: '/edge-status',
  assetPrefix: '/edge-status',
  // Required for static export — Next.js Image Optimization needs a server
  images: { unoptimized: true },
}

export default nextConfig
