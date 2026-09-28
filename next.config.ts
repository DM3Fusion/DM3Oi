import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  deploymentId: process.env.VERCEL_GIT_COMMIT_SHA,
};
export default nextConfig;
