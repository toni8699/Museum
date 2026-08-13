# Interactive Chopin Museum

An experimental 3D museum experience about the life and music of Frédéric Chopin. Visitors move through a circular sequence of rooms using guided camera transitions, connecting places such as Poland, Paris, the composer’s workshop, and a central music chamber.

The project is currently a spatial prototype: the layout, pacing, navigation, and atmosphere are being established before the remaining rooms receive final exhibits and artwork. Editor direction is layout-first: prove a single-floor room/complex workflow before expanding to multi-story buildings.

## Features

- Guided tour through eight narrative stops
- Free-tour mode for exploring all graph-connected stops, including editor-authored free-only nodes
- Smooth rounded and automatically generated Bézier camera paths with reduced-motion support
- Central piano chamber; visitor view intentionally contains no route-line overlay
- Shared materials for floors, walls, ceilings, wood, plaster, and brass
- Paris Salon asset slice with furniture, lighting, and decorative GLB models
- Responsive HUD with room titles, navigation, and tour controls
- Development previews for materials and assets
- Development-only museum editor with scene/tour authoring plus a layout-first CAD workflow in progress

## Run locally

Requires Node.js 20 or newer and a WebGL-capable browser.

```bash
npm install
npm run dev
```

Open the local URL and visit `/museum`.

### Editor layout and scene exports

Editor now has two authoring artifacts:

- **Layout export** (`museum-layout.json`): rooms, floorplans, walls, openings, and layout placeholders. B4 adds an opt-in dev dual-read at `/museum?architecture=layout`; default `/museum` remains on `rooms.ts` until B5.
- **Scene export** (`museum-scene.json`): entities, materials, navigation nodes, connections, and camera paths used by the current visitor experience.

To update the live museum:

1. In `/dev/museum-editor`, use **Copy JSON** or **Download JSON** for the scene document.
2. Replace [`apps/museum/src/lib/content/museum-scene.json`](./apps/museum/src/lib/content/museum-scene.json) with that scene export.
3. Restart or refresh the dev server if needed, then open `/museum`.

Layout exports are not a replacement for `museum-scene.json` yet. Do not put either export under `static/`; the default visitor runtime loads `museum-scene.json` plus `rooms.ts`, while B4 layout mode uses the runtime-safe checked-in compiler fixture.

Useful commands:

```bash
npm run build   # Create a production build
npm run check   # Run Svelte and TypeScript checks
npm test        # Run the test suite
```

## Controls

- **Next / Back:** HUD buttons, arrow keys, `Space`, and `Backspace`
- **Navigation nodes:** Click glowing nodes when available
- **M:** Toggle guided and free-tour modes
- **R:** Toggle reduced motion
- **Paris Salon:** Drag the scene or use arrow keys to look around

## Technology

Built with SvelteKit, Svelte 5, Threlte, Three.js, and TypeScript.

The main application lives in [`apps/museum`](./apps/museum). Additional development views are available at `/dev/materials`, `/dev/assets`, and `/dev/museum-editor`. The museum editor is excluded from production; its route returns 404 in production builds.

## Status

This is an evolving graybox museum and interactive portfolio experiment. The current P0 direction is layout-first: prove a single-floor room/complex drafting workflow, migrate Chopin from `rooms.ts` into serialized layout + scene data, then author camera tours on top. Multi-story buildings and stacked rooms are a later goal, gated on the single-floor workflow becoming reliable and polished. The Paris Salon is the first detailed asset slice; exhibit interactions and final artwork remain in progress.
