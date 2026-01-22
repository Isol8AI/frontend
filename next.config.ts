import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,

  // Empty turbopack config to silence warning (we use --webpack flag in build script)
  turbopack: {},

  // Externalize large packages from serverless functions
  // These are client-only and should not be bundled server-side
  serverExternalPackages: [
    '@huggingface/transformers',
    'onnxruntime-web',
    'onnxruntime-node',
  ],

  // Handle argon2-browser WASM module
  webpack: (config, { isServer }) => {
    // Exclude transformers.js from server bundles entirely
    if (isServer) {
      config.externals = config.externals || [];
      config.externals.push({
        '@huggingface/transformers': 'commonjs @huggingface/transformers',
      });
    }
    // Enable WebAssembly support
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
      layers: true,
    };

    // Handle WASM files from argon2-browser
    config.module.rules.push({
      test: /\.wasm$/,
      type: "asset/resource",
    });

    // For browser builds, ignore Node.js modules
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        crypto: false,
      };

      // Alias to prevent argon2-browser's problematic WASM loader
      config.resolve.alias = {
        ...config.resolve.alias,
        "argon2-browser": path.resolve(
          __dirname,
          "node_modules/argon2-browser/dist/argon2-bundled.min.js"
        ),
      };
    }

    return config;
  },
};

export default nextConfig;
