# Spatial Sketch Editor

Layout-first editor for indoor 3D. Draw a floor plan. Place openings and objects. Author a camera tour. Export one file. A separate visitor runtime renders it.

Local-first: everything works offline in your browser, and save/load runs
through portable export/import. Accounts, cloud project save, and hosted
publish are part of the final product vision (see [`docs/north-star.md`](docs/north-star.md))
— not yet scheduled. The roadmap is gated: the current camera timeline (P12)
and orientation/preview QA (P3B) must close before anything else is
implemented. The server, when it arrives, stays an optional sync/save/publish
target and never becomes a boot dependency.

## Example

**Chopin museum** is the first project built with it. Guided tour, free roam, reduced motion. Paris Salon included.

Any indoor space works. Gallery, office, store, venue.

## Features

- **Plan editor:** draw rooms, bend walls into curves, snap to grid
- **Openings:** doors, windows, round/pointed profiles
- **Objects:** boxes, cylinders, spheres, GLB assets
- **Camera tours:** place nodes, connect paths, smooth rides
- **3D view:** live preview of your compiled plan
- **Undo / redo:** shared across the editor
- **Portable project:** export JSON, import anywhere

## Run

Needs Node.js 20+ and a WebGL browser.

```bash
npm install
npm run dev
```

- `/` or `/editor`: main editor. 2D CAD plan -> 3D render
- `/museum`: legacy code. Chopin museum preview
- `/museum/editor`: legacy editor

```bash
npm run build   # production build
npm run check   # svelte + TS checks
npm test        # tests
```
