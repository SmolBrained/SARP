import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

// Self-hosted (OFL) fonts: no third-party requests, works offline, zero layout shift.
// Source Sans 3 carries the interface (humanist, tabular figures by default); Source Serif 4 sets headlines
// and the big numbers, the way a printed science journal sets its figures. Greek (λ, γ, Δ, φ, π) is split
// into its own file so it only downloads when a formula needs it.
const sans = localFont({
  variable: "--font-sans",
  display: "swap",
  src: [
    { path: "../fonts/source-sans-3-latin-400-normal.woff2", weight: "400" },
    { path: "../fonts/source-sans-3-latin-500-normal.woff2", weight: "500" },
    { path: "../fonts/source-sans-3-latin-600-normal.woff2", weight: "600" },
    { path: "../fonts/source-sans-3-latin-700-normal.woff2", weight: "700" },
  ],
});
const sansGreek = localFont({
  variable: "--font-sans-greek",
  display: "swap",
  declarations: [{ prop: "unicode-range", value: "U+0370-03FF" }],
  src: [
    { path: "../fonts/source-sans-3-greek-400-normal.woff2", weight: "400" },
    { path: "../fonts/source-sans-3-greek-600-normal.woff2", weight: "600" },
    { path: "../fonts/source-sans-3-greek-700-normal.woff2", weight: "700" },
  ],
});
const display = localFont({
  variable: "--font-display",
  display: "swap",
  src: [
    { path: "../fonts/source-serif-4-latin-400-normal.woff2", weight: "400" },
    { path: "../fonts/source-serif-4-latin-600-normal.woff2", weight: "600" },
    { path: "../fonts/source-serif-4-latin-700-normal.woff2", weight: "700" },
  ],
});
const displayGreek = localFont({
  variable: "--font-display-greek",
  display: "swap",
  declarations: [{ prop: "unicode-range", value: "U+0370-03FF" }],
  src: [
    { path: "../fonts/source-serif-4-greek-400-normal.woff2", weight: "400" },
    { path: "../fonts/source-serif-4-greek-600-normal.woff2", weight: "600" },
  ],
});

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
    <html lang="en" className={`${sans.variable} ${sansGreek.variable} ${display.variable} ${displayGreek.variable}`}>
      <body>{children}</body>
    </html>
  );
}
