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

- `src/lib/gazeTracker.js` — `GazeTracker` (extends `EventTarget`), emits `"gaze"` events with `{x, y, t}`. Uses `window.webgazer` if present; falls back to mouse position otherwise, so the rest of the app doesn't need to branch on whether a real gaze-estimation library is wired in yet. Smooths raw coordinates with a moving average (`config.gaze.smoothingWindow`).
- `src/lib/colorRevealRenderer.js` — `ColorRevealRenderer` wraps a `<canvas>` 2D context that sits on top of the always-visible line-art `<img>`. It keeps two offscreen canvases: one holding the full shading/color image, one accumulating white circles ("revealed so far") at gaze coordinates. Each render draws the color image then punches it down to only the revealed area via `destination-in` compositing against the accumulated mask. Revealed areas persist. `revealedRatio()` samples the mask's alpha channel to estimate reveal completion.
- `src/lib/sessionLogger.js` — `SessionLogger` records the gaze path and time-to-completion for a viewing session, and can serialize/download it as JSON for the evaluation experiment.
- `src/lib/config.js` — the tunable constants (reveal radius, smoothing window) referenced by the above. Change parameters here rather than inline.
- `src/hooks/useColorReveal.js` — the only place the three classes above are wired into React. It owns their lifecycle (construct on mount, `gaze.start()`/`stop()`, resize handling) and exposes a `loggerRef` so components can trigger a log download. `src/App.jsx` supplies refs to the line-art `<img>`, a hidden color-source `<img>` (used only as a `drawImage` source, never shown directly — see `.viewer__colorSource` in `src/index.css`), and the overlay `<canvas>`, then renders UI around what the hook reports (e.g. a download button once `onCompleted` fires).

This split exists because canvas/webcam handling is inherently imperative and doesn't benefit from React's render cycle — new features here should generally stay in `src/lib/` as plain classes, with `useColorReveal.js` as the only integration point into React.

Line-art and color assets must share the same coordinate system (same `viewBox`/paths) so the two layers align pixel-for-pixel — see `public/assets/artwork-lineart.svg` and `artwork-color.svg`.

### Asset paths under the Pages base path

The app deploys to a GitHub Pages *project* page (`https://kuratomo001-ux.github.io/eye-tracking-art-viewer/`), so `vite.config.js` sets `base: "/eye-tracking-art-viewer/"`. Any asset referenced from `public/` must be built as `` `${import.meta.env.BASE_URL}...` `` (see `src/App.jsx`'s `lineArtSrc`/`colorSrc`) rather than a hardcoded absolute path — a literal `/assets/...` path breaks once deployed under the subpath.

### Deployment

`.github/workflows/deploy.yml` builds with `npm ci && npm run build` and deploys `dist/` via the official `actions/upload-pages-artifact` + `actions/deploy-pages` actions on every push to `main`. Pages is configured with `build_type: workflow` (not branch-based).

## Privacy note for this repo

This repository is public. Do not add personally identifying information (advisor's real name/email, lab name, student's full name) to committed files — refer to "指導教員" (academic advisor) generically instead, per the precedent already set in `docs/policy.md` and the README (a prior commit history rewrite removed this kind of info once already).
