# Optics Sandbox — Serverless Ray Optics

Lightweight, static web app that simulates rays interacting with mirrors, lenses, and beam splitters.

Quickstart

- Open `index.html` in a browser (Chrome/Edge/Firefox). For full file security, run a simple static server in the folder:

  python -m http.server 8000
  open http://localhost:8000

Features

- Drag components: Light Sources, Lenses (thin, paraxial approx), Mirrors (flat), Beam Splitters
- Light sources let you set the number of beams, central direction, and angle spread (even or random distribution)
- Simple ray tracing: reflection, thin-lens paraxial refraction approximation, partial reflection/transmission for splitters
- Export a PNG of the current canvas
- Pan and zoom the canvas (middle mouse button or hold Space + drag, mouse wheel to zoom)
- Snap-to-grid and configurable grid size
- Autosave to localStorage and Import/Export JSON for scenes
- History with Undo/Redo and a visual history list
- Optionally use a "Thick" lens model (spherical surfaces) with refractive index, radii, and thickness

Notes & limitations

- This is a client-only demo using a paraxial thin-lens approximation; it is not a full wave-optics simulator.
- Performance depends on ray count and recursion depth; reduce `Beams` or `Max depth` if the UI becomes slow.

License: MIT

---

## iOS (Capacitor) — How to build and run 🔧

- Prereqs: macOS + Xcode, Apple Developer account (for device testing).

- In Xcode:
  - Select the `App` target and set your **Team** under *Signing & Capabilities*.
  - Choose a connected iPad or simulator and press **Run**.
  - To support both orientations on iPad: in *Deployment Info* check **Portrait** and **Landscape**.
  - Replace app icons in `Assets.xcassets > AppIcon` with properly sized images.
- For Ad Hoc / Development testing: register your device UDID in your Apple Developer account and configure provisioning profiles.

---

## Developer workflow — Reproducible build & test 🔁

Follow these steps to reproduce a local iOS build and asset generation from source:

Prereqs:
- macOS with Xcode installed (for iOS builds and signing)
- Node.js and npm (use `npm ci` for reproducible installs)
- (Optional) Apple Developer account for device testing / TestFlight

Quick reproducible steps:

1. git clone <repo> && cd <repo>
2. npm ci
3. npx cap init
4. npx cap add ios
5. npm run generate:icons    # generate `AppIcon.appiconset` PNGs from `assets/icon.svg`
6. npm run build            # copies web files into `www/`
7. npx cap sync ios         # sync native iOS platform and plugins
8. npx cap open ios         # open Xcode workspace
9.  In Xcode: select the `App` target → **Signing & Capabilities** → set your **Team** and provisioning profile. Set *Deployment Info* to include Portrait & Landscape as needed.
10. Product → Clean Build Folder, then Build & Run on a simulator or device.

To update the iOS project after code changes:

- `npm run build` (copies web files into `www/`)
- `npx cap copy ios`
- `npx cap open ios` (opens the Xcode workspace)

Notes & tips:
- Run `npm run generate:icons` any time you edit `assets/icon.svg`. The script writes PNGs into `ios/App/App/Assets.xcassets/AppIcon.appiconset/` and `assets/appicons/` for inspection.
- If you see icon-related compile errors, do: Product → Clean Build Folder in Xcode, then rebuild. If icons are missing, re-run `npm run generate:icons` and `npx cap sync ios`.
- To add automatic Photos saving without user interaction you must add `NSPhotoLibraryAddUsageDescription` to `ios/App/App/Info.plist` and implement a native bridge.

PWA (Progressive Web App) support:
- The project now includes `manifest.webmanifest` and a simple service worker `sw.js`.
- `npm run build` will generate web icons (`icon-192.png` and `icon-512.png`) into `www/icons` (via `npm run generate:icons`) and copy the manifest and `sw.js` into `www/`.
- The app registers the service worker automatically at page load (when supported) and caches core assets for offline use.
- To test the PWA locally, run a static server from the `www/` folder: `npx http-server www` or `python -m http.server --directory www 8000`, then inspect the Application tab in DevTools (Service Workers; Manifest). On iOS, use Safari's Add to Home Screen flow.

**Notes:** The web assets are served from the `www/` folder and are copied into the iOS project at `ios/App/App/public` by `npx cap copy`.
