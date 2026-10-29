import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["next.sandbox.local"],
  async redirects() {
    return [
      { source: "/core", destination: "/neuxus", permanent: false },
      {
        source: "/core/:path*",
        destination: "/neuxus/:path*",
        permanent: false,
      },
      {
        source: "/server-settings",
        destination: "/neuxus/server-settings",
        permanent: false,
      },
      {
        source: "/server-settings/:path*",
        destination: "/neuxus/server-settings/:path*",
        permanent: false,
      },
      {
        source: "/knowledge-base",
        destination: "/neuxus/knowledge-base",
        permanent: false,
      },
      {
        source: "/knowledge-base/:path*",
        destination: "/neuxus/knowledge-base/:path*",
        permanent: false,
      },
      { source: "/ask", destination: "/chat", permanent: false },
      { source: "/auth", destination: "/chat/auth", permanent: false },
      { source: "/settings", destination: "/chat", permanent: false },
      {
        source: "/settings/:path*",
        destination: "/chat/settings/:path*",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
