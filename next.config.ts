import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  // Next's minimal server trace omits the runtime used by its vendored Pages contexts.
  // Include its production React dependencies too; tracing includes are not recursive.
  outputFileTracingIncludes: {
    '/**': [
      'node_modules/next/dist/compiled/next-server/pages.runtime.prod.js',
      'node_modules/react/jsx-runtime.js',
      'node_modules/react/cjs/react-jsx-runtime.production.js',
      'node_modules/react-dom/package.json',
      'node_modules/react-dom/index.js',
      'node_modules/react-dom/server.browser.js',
      'node_modules/react-dom/server.edge.js',
      'node_modules/react-dom/cjs/react-dom.production.js',
      'node_modules/react-dom/cjs/react-dom-server.browser.production.js',
      'node_modules/react-dom/cjs/react-dom-server-legacy.browser.production.js',
      'node_modules/react-dom/cjs/react-dom-server.edge.production.js',
    ],
  },
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
