import type { NextConfig } from 'next';
const nextConfig: NextConfig = { output: 'standalone', poweredByHeader: false, devIndicators: false, allowedDevOrigins: ['127.0.0.1', 'localhost'], serverExternalPackages: ['better-sqlite3'] };
export default nextConfig;
