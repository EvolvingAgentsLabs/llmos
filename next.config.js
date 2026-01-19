/**
 * Next.js Configuration - Hybrid (Desktop + Web)
 *
 * Supports both Electron desktop and Vercel web deployment.
 * Platform detection at runtime determines available features.
 *
 * @type {import('next').NextConfig}
 */

const isVercel = process.env.VERCEL === '1';

const nextConfig = {
  reactStrictMode: true,

  // No static export - enables API routes and serverless functions for Vercel
  // For Electron-only builds, add: output: 'export'

  // Transpile Three.js packages for proper ESM support
  transpilePackages: ['three', '@react-three/fiber', '@react-three/drei'],

  // Allow remote images for web deployment + local for Electron
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },

  // Suppress specific warnings during build
  typescript: {
    // Allow production builds to complete even with type errors
    // (useful during iterative development)
    ignoreBuildErrors: false,
  },

  eslint: {
    // Allow production builds to complete even with lint errors
    ignoreDuringBuilds: false,
  },

  // Experimental features for better serverless support
  experimental: {
    // Optimize serverless functions
    serverComponentsExternalPackages: ['@wasmer/sdk', 'pyodide', 'serialport'],
  },

  webpack: (config, { isServer, webpack }) => {
    // ========================================================================
    // HYBRID CONFIGURATION (Desktop + Web)
    // ========================================================================
    // These configurations support both Electron and Vercel environments.
    // Platform-specific features are detected at runtime.
    // ========================================================================

    config.externals = config.externals || [];

    // Externalize heavy dependencies that are lazy-loaded
    // These won't be bundled, reducing initial load time
    if (isServer) {
      config.externals.push(
        '@wasmer/sdk',      // Browser C→WASM compiler (lazy loaded)
        'pyodide',          // Python runtime (lazy loaded when needed)
        'serialport',       // Serial port access (Electron only)
        '@serialport/bindings-cpp'
      );
    }

    // Client-side fallbacks for Node.js modules
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        // Disable Node.js modules not available in browser
        fs: false,
        net: false,
        tls: false,
        child_process: false,
        worker_threads: false,
        dns: false,
        dgram: false,
        // Crypto is available in browser via Web Crypto API
        crypto: false,
      };
    }

    // WebAssembly support (needed for Python/Pyodide)
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
      layers: true,
    };

    // Handle WASM files
    config.module.rules.push({
      test: /\.wasm$/,
      type: 'asset/resource',
    });

    // Handle .data files (Pyodide Python packages)
    config.module.rules.push({
      test: /\.data$/,
      type: 'asset/resource',
    });

    // Ignore optional dependencies that may not be available
    config.plugins.push(
      new webpack.IgnorePlugin({
        resourceRegExp: /^(serialport|@serialport\/bindings-cpp)$/,
        contextRegExp: /./,
      })
    );

    return config;
  },
};

module.exports = nextConfig;
