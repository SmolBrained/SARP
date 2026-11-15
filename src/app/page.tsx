import Workspace from "@/components/Workspace";

/** Static shell; the interactive workspace hydrates on the client (MapLibre loads lazily inside MapView). */
export default function Page() {
  return (
    <>
      <Workspace />
      <noscript><p style={{ padding: 24 }}>SARPulse needs JavaScript to draw the radar map.</p></noscript>
    </>
  );
}
