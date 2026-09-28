import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  deploymentId: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 32),
};
export default nextConfig;
