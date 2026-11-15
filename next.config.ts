import type { NextConfig } from "next";

/**
 * Fully static export: the whole app is plain files in /out, served from any CDN
 * (Firebase Hosting, GitHub Pages). NEXT_PUBLIC_BASE_PATH supports sub-path hosting
 * such as https://<user>.github.io/SARP.
 */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const config: NextConfig = {
  output: "export",
  basePath: basePath || undefined,
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
  devIndicators: false,
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
};

export default config;
