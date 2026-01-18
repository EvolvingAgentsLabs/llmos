/**
 * Next.js Configuration - Desktop-First (Phase 1)
 *
 * Optimized for Electron desktop builds.
 * Browser fallbacks are minimal since Electron provides Node.js APIs.
 *
 * For Phase 2 (browser support), see commented configurations below.
 *
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  reactStrictMode: true,

  // Desktop-only: Static export for Electron
  output: 'export',

  // Transpile Three.js packages for proper ESM support
  transpilePackages: ['three', '@react-three/fiber', '@react-three/drei'],

  // Desktop-only: Images are local files, no optimization needed
  images: {
    unoptimized: true,
  },

  webpack: (config, { isServer }) => {
    // ========================================================================
    // DESKTOP-ONLY OPTIMIZATIONS (Phase 1)
    // ========================================================================
    // These configurations assume Electron environment where:
    // - Node.js APIs are available in the renderer process
    // - No browser polyfills needed
    // - Smaller bundle size, faster boot time
    // ========================================================================

    config.externals = config.externals || [];

    // Externalize heavy dependencies that are lazy-loaded
    // These won't be bundled, reducing initial load time
    if (isServer) {
      config.externals.push(
        '@wasmer/sdk',      // Browser C→WASM compiler (lazy loaded, desktop uses native)
        'pyodide'           // Python runtime (lazy loaded when needed)
      );
    }

    // Desktop-only: Minimal fallbacks
    // In Electron, Node.js modules are available, so we only disable
    // modules that are truly not available in renderer process
    config.resolve.fallback = {
      ...config.resolve.fallback,
      // Disable modules not available in Electron renderer
      fs: false,
      net: false,
      tls: false,
      child_process: false,
      worker_threads: false,
    };

    /* ========================================================================
     * BROWSER FALLBACKS (Phase 2 - Currently Disabled)
     * ========================================================================
     *
     * For browser support, uncomment and install browser polyfills:
     * npm install crypto-browserify path-browserify os-browserify \
     *   stream-browserify stream-http https-browserify browserify-zlib \
     *   util buffer process
     *
     * Then uncomment this configuration:
     *
     * config.resolve.fallback = {
     *   ...config.resolve.fallback,
     *   fs: false,
     *   net: false,
     *   tls: false,
     *   child_process: false,
     *   worker_threads: false,
     *   crypto: require.resolve('crypto-browserify'),
     *   path: require.resolve('path-browserify'),
     *   http: require.resolve('stream-http'),
     *   https: require.resolve('https-browserify'),
     *   zlib: require.resolve('browserify-zlib'),
     *   stream: require.resolve('stream-browserify'),
     *   buffer: require.resolve('buffer/'),
     *   url: require.resolve('url/'),
     *   util: require.resolve('util/'),
     * };
     *
     * ======================================================================== */

    // Handle node: protocol imports (e.g., node:fs, node:path)
    config.externals.push(({ request }, callback) => {
      if (request && request.startsWith('node:')) {
        return callback(null, `commonjs ${request}`);
      }
      callback();
    });

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

    return config;
  },
};

module.exports = nextConfig;
