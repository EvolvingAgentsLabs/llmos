/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config, { isServer }) => {
    // Fix for Pyodide and WebAssembly
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      path: false,
      crypto: false,
      http: false,
      https: false,
      net: false,
      tls: false,
      zlib: false,
      stream: false,
    };

    // Exclude pyodide from server-side bundles
    if (isServer) {
      config.externals = [...(config.externals || []), 'pyodide'];
    }

    return config;
  },
};

module.exports = nextConfig;
