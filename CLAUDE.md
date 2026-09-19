# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A React + Vite web app implementing a gaze-based painting viewer for a graduation thesis (視線追跡による絵画鑑賞支援システム). A webcam-based gaze estimate drives progressive reveal of shading/color on top of an always-visible line-art rendering of the artwork.

Read [docs/policy.md](docs/policy.md) before changing the reveal mechanism itself — the current "line art always visible, shading/color added progressively where gazed" design (implemented in `src/lib/colorRevealRenderer.js`) exists specifically to fix a flaw in an earlier "black mask everywhere" concept (both the initial fixation and later gaze movement were essentially random with nothing visible to give context). This is a discussion prototype built to bring to an advisor meeting, not a design finalized from a completed experiment — expect it to change. [docs/dev-log.md](docs/dev-log.md) has the chronological record of what's been decided and why.

## Commands

```bash
npm install       # install dependencies
npm run dev       # start Vite dev server
npm run build     # production build to dist/
npm run preview   # serve the production build locally
```

There is no lint or test setup in this repo.

## Architecture

The gaze-tracking, mask-rendering, and logging logic is deliberately kept out of React:

- `src/lib/gazeTracker.js` — `GazeTracker` (extends `EventTarget`), emits `"gaze"` events with `{x, y, t}`. `start()` is async: it lazy-loads WebGazer.js from `https://webgazer.cs.brown.edu/webgazer.js` on first call (not in `index.html`, so the camera is never touched until a user explicitly triggers tracking — see `useColorReveal.js`'s `startTracking`), then calls `webgazer.begin()`. There is deliberately no mouse-position fallback — this app is gaze-only; if the camera/library isn't available, `start()` resolves to `"unavailable"` instead of silently switching input modes, and the UI shows a retry screen.

  Raw WebGazer output is noisy and prone to occasional large spikes ("荒ぶり"), so each axis goes through two stages before an event fires: `MedianFilter` (`src/lib/medianFilter.js`, window size `config.gaze.medianWindow`) rejects single-frame outliers, then `OneEuroFilter` (`src/lib/oneEuroFilter.js`) smooths what remains — heavier smoothing when the gaze point is roughly still, less lag when it's moving fast. Tune via `config.gaze.oneEuro.{minCutoff,beta,dCutoff}`: lower `minCutoff` = smoother at rest, higher `beta` = faster tracking of quick movements at the cost of more residual jitter. If tuning these, `median3`/One-Euro reference implementations are the standard approach for exactly this problem (noisy pointer/gaze data) — don't reach for a plain moving average, it trades off lag vs. noise far worse (see the git history for the before/after).

  Another accuracy lever set before `.begin()`: `webgazer.params.camConstraints` requests `ideal: 1920x1080` webcam capture (WebGazer's own default is only `ideal: 640x480`) for a sharper eye/face image. (`webgazer.setTracker(...)`'s only valid value in this build is `"TFFacemesh"` and `setRegression`'s valid values are `"ridge"` / `"weightedRidge"` / `"threadedRidge"` — confirmed by reading the minified webgazer.js source, since none of this is in the sparse public docs.)

  Regression is `"ridge"` (all samples weighted equally), not `"weightedRidge"`. `weightedRidge` was tried briefly but reverted: it upweights recent samples, and with the fixation-based calibration below producing ~33 near-duplicate samples per point over a continuous dwell, "recent" effectively meant "the last calibration point looked at" — the fit ended up skewed toward wherever calibration happened to end, making tracking noticeably worse than the plain-`ridge` click-based calibration it was compared against.

  **Gotchas:**
  - WebGazer's only tracker in the currently-loaded version is `TFFacemesh` (`setTracker("clmtrackr")` throws "Invalid tracker selection" — clmtrackr was removed). TFFacemesh's default asset path (`webgazer.params.faceMeshSolutionPath`, default `"./mediapipe/face_mesh"`) is relative to *our* origin, not the CDN webgazer.js was loaded from, so without overriding it the MediaPipe WASM/model files 404 against our own dev server / GitHub Pages path and gaze detection silently never starts (no console error beyond failed resource loads — check the Network tab, not just console.error). `gazeTracker.js` points it at `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh` before calling `.begin()`; do the same if you ever reset that line.
  - WebGazer attaches document-level `click`/`mousemove` listeners on `.begin()` and treats the cursor position as ground-truth gaze for continuously retraining its ridge regression (its built-in self-calibration trick). Left enabled, the predicted gaze visibly tracks the mouse cursor instead of actual eye position — looked like a bug, was actually "working as designed." `gazeTracker.js` calls `webgazer.removeMouseEventListeners()` right after `.begin()` to stop this, since this app has no mouse input at all. This means WebGazer gets zero calibration data unless something else supplies it deliberately — see the calibration screen below.
- `src/lib/colorRevealRenderer.js` — `ColorRevealRenderer` wraps a `<canvas>` 2D context that sits on top of the always-visible line-art `<img>`. It keeps two offscreen canvases: one holding the full shading/color image, one accumulating white circles ("revealed so far") at gaze coordinates. Each render draws the color image then punches it down to only the revealed area via `destination-in` compositing against the accumulated mask. Revealed areas persist. `revealedRatio()` samples the mask's alpha channel to estimate reveal completion.
- `src/lib/sessionLogger.js` — `SessionLogger` records the gaze path and time-to-completion for a viewing session, and can serialize/download it as JSON for the evaluation experiment.
- `src/lib/config.js` — the tunable constants (reveal radius, smoothing window) referenced by the above. Change parameters here rather than inline.
- `src/hooks/useColorReveal.js` — the only place the three classes above are wired into React. It owns their lifecycle (construct on mount, resize handling, `gaze.stop()` on unmount) and exposes `{ loggerRef, startTracking, calibrate, setPaintingEnabled }`. `startTracking()` must be called from a user gesture (a button click in `src/App.jsx`) since it's what triggers the camera permission prompt. Gaze events are received from the moment WebGazer starts, but `handleGaze` no-ops until `setPaintingEnabled(true)` is called — this gates actual reveal-painting (and starts the session logger) behind calibration, so the noisy/untrained pre-calibration gaze estimate never paints anything. `calibrate(x, y)` forwards to `GazeTracker#calibrate`, called by `src/components/CalibrationScreen.jsx`.
- `src/components/CalibrationScreen.jsx` — a click-to-calibrate screen (4 corners + center, `CLICKS_PER_POINT` = 3 each — simplified down from an initial 9-point/5-click version that felt too tedious) shown after the camera starts and before painting is enabled. Each click calls `webgazer.recordScreenPosition(x, y, "click")` via `GazeTracker#calibrate` to explicitly feed a training sample (this is the *only* calibration data WebGazer gets now that its automatic mouse-based self-calibration is disabled — see the gotcha above). `src/App.jsx` renders this whenever `trackingMode === "webgazer" && !calibrated`; completing it calls `setPaintingEnabled(true)`.
- `src/App.jsx` supplies refs to the line-art `<img>`, a hidden color-source `<img>` (used only as a `drawImage` source, never shown directly — see `.viewer__colorSource` in `src/index.css`), and the overlay `<canvas>`, then renders UI around what the hook and calibration state report: a start overlay before tracking begins, a retry screen if WebGazer/the camera is unavailable, the calibration screen, and a download button once `onCompleted` fires.

This split exists because canvas/webcam handling is inherently imperative and doesn't benefit from React's render cycle — new features here should generally stay in `src/lib/` as plain classes, with `useColorReveal.js` as the only integration point into React.

Line-art and color assets must share the same coordinate system (same `viewBox`/paths) so the two layers align pixel-for-pixel — see `public/assets/artwork-lineart.svg` and `artwork-color.svg`.

### Asset paths under the Pages base path

The app deploys to a GitHub Pages *project* page (`https://kuratomo001-ux.github.io/eye-tracking-art-viewer/`), so `vite.config.js` sets `base: "/eye-tracking-art-viewer/"`. Any asset referenced from `public/` must be built as `` `${import.meta.env.BASE_URL}...` `` (see `src/App.jsx`'s `lineArtSrc`/`colorSrc`) rather than a hardcoded absolute path — a literal `/assets/...` path breaks once deployed under the subpath.

### Deployment

`.github/workflows/deploy.yml` builds with `npm ci && npm run build` and deploys `dist/` via the official `actions/upload-pages-artifact` + `actions/deploy-pages` actions on every push to `main`. Pages is configured with `build_type: workflow` (not branch-based).

## Privacy note for this repo

This repository is public. Do not add personally identifying information (advisor's real name/email, lab name, student's full name) to committed files — refer to "指導教員" (academic advisor) generically instead, per the precedent already set in `docs/policy.md` and the README (a prior commit history rewrite removed this kind of info once already).
