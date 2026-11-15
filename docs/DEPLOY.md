# Deploying SARPulse

The app is a fully static site: `npm run build` writes everything to `out/`. Any static host works.

## Option A: Firebase Hosting (project `sar-pulse`, site `sar-pulse`)
The project id and site are already set in `.firebaserc` and `firebase.json`.
1. `npx firebase-tools@15 login` (opens your browser; nothing to install globally)
2. `npm run deploy` (builds, then deploys to Firebase Hosting with the pinned CLI)
3. The site is live at `https://sar-pulse.web.app`.
4. **Custom domain sarpulse.org:** Firebase console → Hosting → *Add custom domain* → `sarpulse.org`. Add the DNS records it shows at your registrar (an A or TXT record to verify, then the A records, usually within minutes to a few hours; the certificate is automatic). The slide QR codes already point at `https://sarpulse.org/`.

`firebase.json` already sets long-term caching for hashed assets, `no-cache` for the service worker and data, and security headers.

## Option B: GitHub Pages (automatic)
1. Push to `main` on `SmolBrained/SARP`.
2. GitHub → repo **Settings → Pages → Source: GitHub Actions**.
3. `.github/workflows/pages.yml` runs `npm ci`, builds with the `/SARP` base path and publishes to `https://smolbrained.github.io/SARP/`.

## Before the pitch
Open the live URL once on the presentation laptop and your phones **while online**. The service worker then caches the app and the map tiles you viewed, so the demo still works if the venue Wi-Fi drops.
