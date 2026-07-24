import { PHASE_DEVELOPMENT_SERVER } from "next/constants.js";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

/** @type {import('next').NextConfig} */
export default function createNextConfig(phase) {
  return {
    reactStrictMode: true,
    // Static export is a production/Pages contract. Applying it to `next dev`
    // makes an expected P999 request ask the dev route compiler for an unknown
    // static parameter and can prevent Playwright's managed server from exiting.
    output: phase === PHASE_DEVELOPMENT_SERVER ? undefined : "export",
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
}
