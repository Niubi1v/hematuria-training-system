const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "export",
  trailingSlash: true,
  basePath,
  assetPrefix: basePath ? `${basePath}/` : undefined,
  // Next.js only exposes explicitly public variables to client modules. Mirror
  // Vercel's deployment scope (never a credential) so Preview bundles can
  // deterministically keep API calls on their own origin.
  env: {
    NEXT_PUBLIC_VERCEL_ENV: process.env.VERCEL_ENV || ""
  },
  images: {
    unoptimized: true
  }
};

export default nextConfig;
