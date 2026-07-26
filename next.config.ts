import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `better-sqlite3` is a native module. Keep it external so Next never tries to
  // bundle the .node binary into the server build.
  serverExternalPackages: ["better-sqlite3"],

  // Standalone output is only useful for the container image, and it breaks
  // `next start` (which is what `npm start` runs). The Dockerfile sets
  // BUILD_STANDALONE=1; everywhere else the normal build applies.
  ...(process.env.BUILD_STANDALONE === "1" ? { output: "standalone" as const } : {}),

  experimental: {
    // Uploads are capped at 5 MB (src/lib/limits.ts); leave headroom for the
    // multipart envelope around them.
    serverActions: { bodySizeLimit: "8mb" },
  },
};

export default nextConfig;
