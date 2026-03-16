import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@open-vault/constants", "@open-vault/errors", "@open-vault/shared"],
};

export default nextConfig;
