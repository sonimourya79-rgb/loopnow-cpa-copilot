import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output keeps the runtime Docker image to just the built
  // server + its actual dependency tree, not the whole node_modules.
  output: "standalone",
  // This project sits inside a parent directory that has its OWN pnpm
  // workspace config (an unrelated monorepo) — pinning the Turbopack root
  // here stops it from being misdetected as part of that workspace.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
