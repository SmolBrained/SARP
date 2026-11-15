import Landing from "@/components/landing/Landing";

/** Home: the scroll story. The interactive viewer lives at /explore. */
export default function Page() {
  return (
    <>
      <Landing />
      <noscript><p style={{ padding: 24 }}>SARPulse tells its story over a 3D globe and needs JavaScript. The code and docs are at github.com/SmolBrained/SARP.</p></noscript>
    </>
  );
}
