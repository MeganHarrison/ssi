import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    '/api/generate-pdf': ['./public/fonts/*.ttf'],
  },
};

export default nextConfig;
