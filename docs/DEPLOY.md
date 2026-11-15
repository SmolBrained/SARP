# Deploying SARPulse

The app is a fully static site: `npm run build` writes everything to `out/`. Any static host works.

## Option A: Firebase Hosting (your plan)
1. `npx firebase-tools@15 login` (opens your browser; nothing to install globally)
2. In the `sarpulse` folder: `npx firebase-tools@15 use --add`. Pick an existing project or create one at https://console.firebase.google.com (free Spark plan is enough; name it e.g. `sarpulse`).
3. `npm run deploy` (builds, then deploys to Firebase Hosting with the pinned CLI)
4. Your URL is printed, e.g. `https://sarpulse.web.app`. Put it in the README, the submission and the slide QR code.

`firebase.json` already sets long-term caching for hashed assets, `no-cache` for the service worker and data, and security headers.

## Option B: GitHub Pages (automatic)
1. Push to `main` on `SmolBrained/SARP`.
2. GitHub → repo **Settings → Pages → Source: GitHub Actions**.
3. `.github/workflows/pages.yml` runs `npm ci`, builds with the `/SARP` base path and publishes to `https://smolbrained.github.io/SARP/`.

## Before the pitch
Open the live URL once on the presentation laptop and your phones **while online**. The service worker then caches the app and the map tiles you viewed, so the demo still works if the venue Wi-Fi drops.
