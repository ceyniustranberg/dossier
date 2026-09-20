import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A stray package-lock.json in the home directory makes Turbopack infer the workspace
  // root as ~/, which drags unrelated files into module resolution. Pin it to this project.
  turbopack: { root: path.join(__dirname) },
};

export default nextConfig;
