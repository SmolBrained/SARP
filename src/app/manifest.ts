import type { MetadataRoute } from "next";

export const dynamic = "force-static";
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SARPulse: hear the Earth move with NISAR radar",
    short_name: "SARPulse",
    description: "Live NASA-ISRO NISAR and OPERA radar imagery, physics-based interferograms and sonified ground motion.",
    start_url: `${BASE}/explore/`,
    scope: `${BASE}/`,
    display: "standalone",
    background_color: "#080b16",
    theme_color: "#080b16",
    categories: ["education", "science"],
    icons: [
      { src: `${BASE}/icons/icon-192.png`, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: `${BASE}/icons/icon-512.png`, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: `${BASE}/icons/icon-maskable-512.png`, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
