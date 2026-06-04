import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@worldforge/shared"],
  devIndicators: false,
};

export default nextConfig;
