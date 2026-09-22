import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  experimental: {
    globalNotFound: true,
  },
  async redirects() {
    return [
      {
        source: '/pricing',
        destination: '/visit',
        permanent: true,
      },
      {
        source: '/es/pricing',
        destination: '/es/visit',
        permanent: true,
      },
      {
        source: '/rates',
        destination: '/visit',
        permanent: true,
      },
      {
        source: '/es/rates',
        destination: '/es/visit',
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
