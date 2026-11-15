import type { Metadata } from "next";
import Workspace from "@/components/Workspace";

export const metadata: Metadata = {
  title: "Viewer · SARPulse",
  description: "Scrub through time and hear radar ground motion: Miami's high-rises, the Everglades, Iceland, Antarctica and the Amazon.",
};

/** The interactive viewer (static shell; the workspace hydrates on the client and MapLibre loads lazily). */
export default function Page() {
  return (
    <>
      <Workspace />
      <noscript><p style={{ padding: 24 }}>SARPulse needs JavaScript to draw the radar map.</p></noscript>
    </>
  );
}
