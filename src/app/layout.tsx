import type { Metadata, Viewport } from "next";
import "./fonts.css";
import "./globals.css";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://smolbrained.github.io/SARP/"),
  title: "SARPulse · Hear the Earth move with NASA-ISRO NISAR radar",
  description:
    "Live NASA-ISRO NISAR and OPERA radar imagery, physics-based interferograms and sonified ground motion, from Miami's high-rises to the Everglades. NASA Space Apps Challenge 2026: Dancing with the SARs.",
  applicationName: "SARPulse",
  authors: [{ name: "MCP Lead (Adrian Gomez, Jose Unanue)" }],
  keywords: ["NISAR", "InSAR", "SAR", "NASA", "Space Apps", "Miami", "Everglades", "subsidence", "OPERA"],
  manifest: `${BASE}/manifest.webmanifest`,
  icons: {
    icon: [{ url: `${BASE}/icons/favicon.svg`, type: "image/svg+xml" }, { url: `${BASE}/icons/favicon-64.png`, sizes: "64x64" }],
    apple: `${BASE}/icons/apple-touch-icon.png`,
  },
  openGraph: { title: "SARPulse: hear the Earth move", description: "NASA Space Apps 2026 · Dancing with the SARs · Miami", images: [`${BASE}/icons/icon-512.png`] },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#080b16", colorScheme: "dark" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
