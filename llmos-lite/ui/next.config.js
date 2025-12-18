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
      buffer: false,
      url: false,
      child_process: false,
      worker_threads: false,
    };

    // Exclude pyodide from server-side bundles
    if (isServer) {
      config.externals = [...(config.externals || []), 'pyodide'];
    }

    // Ignore node: protocol imports
    config.externals = [...(config.externals || []), ({ request }, callback) => {
      if (request && request.startsWith('node:')) {
        return callback(null, `commonjs ${request}`);
      }
      callback();
    }];

    return config;
  },
};

module.exports = nextConfig;
