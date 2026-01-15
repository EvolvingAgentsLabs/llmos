/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Enable standalone output for Electron
  output: process.env.ELECTRON_BUILD === 'true' ? 'standalone' : undefined,
  // Transpile Three.js packages for proper ESM support
  transpilePackages: ['three', '@react-three/fiber', '@react-three/drei'],
  // Disable image optimization for Electron (uses local files)
  images: {
    unoptimized: process.env.ELECTRON_BUILD === 'true',
  },
  webpack: (config, { isServer }) => {
    // Exclude Wasmer SDK from ALL bundles (will load from CDN instead)
    config.externals = config.externals || [];
    if (isServer) {
      config.externals.push('@wasmer/sdk');
    }

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

    // Handle Pyodide WebAssembly and data files
    config.module.rules.push({
      test: /\.wasm$/,
      type: 'asset/resource',
    });

    // Allow importing .data files from Pyodide
    config.module.rules.push({
      test: /\.data$/,
      type: 'asset/resource',
    });

    return config;
  },
};

module.exports = nextConfig;
