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

  // Handle argon2-browser WASM module and exclude heavy ML packages
  webpack: (config, { isServer }) => {
    // CRITICAL: Exclude onnxruntime-node and sharp from ALL builds
    // This is the official Hugging Face recommendation for client-side inference
    // See: https://huggingface.co/docs/transformers.js/en/tutorials/next
    // Setting to false tells webpack to completely ignore these modules
    config.resolve.alias = {
      ...config.resolve.alias,
      "sharp$": false,
      "onnxruntime-node$": false,
    };

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

    // For browser builds, additional Node.js module handling
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        crypto: false,
      };

      // Alias to prevent argon2-browser's problematic WASM loader
      // Note: spread existing aliases to preserve sharp$/onnxruntime-node$ exclusions
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
