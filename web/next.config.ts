import type { NextConfig } from 'next';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

const nextConfig: NextConfig = {
  // Enable static export for GitHub Pages
  output: 'export',

  // Configure base path for GitHub Pages
  basePath: basePath,

  // Images configuration for static export
  images: {
    unoptimized: true,
  },

  // Experimental features if needed
  // experimental: {
  //   appDir: true,
  // },

  // Webpack configuration for custom handling if needed
  // webpack: (config, { isServer }) => {
  //   if (isServer) {
  //     // Custom server webpack config
  //   }
  //   return config;
  // },
};

export default nextConfig;