/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  images: {
    unoptimized: true,
  },
  allowedDevOrigins: ['10.215.232.228', 'localhost:3000'],
  devIndicators: false,
};

export default nextConfig;
