/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  experimental: {
    serverActions: {
      bodySizeLimit: "1200mb"
    }
  }
};

export default nextConfig;
