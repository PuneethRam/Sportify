import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      { source: "/.well-known/assetlinks.json", destination: "/api/well-known/assetlinks" },
      { source: "/.well-known/apple-app-site-association", destination: "/api/well-known/apple-app-site-association" },
    ];
  },
};

export default nextConfig;
