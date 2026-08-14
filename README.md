# Spatial Sketch Editor

**Layout-first editor for 3D experiences**: draw floor plan, place openings + objects,
author camera tour, ship serialized project that separate visitor runtime renders.
**Chopin museum** = first project built with it: serialized `MuseumProject`
(layout + scene + camera tour) that editor builds + visitor renders.

Editor not tied to museums; any indoor space (gallery, office, store, venue) sketched
as plan → compiled to 3D → toured.

## What's inside

| Entry point | What it is |
|---|---|
| `/` or `/editor` | **Editor** (when enabled; see demo deploy below). Root `/` renders editor whenever editor enabled, else project landing page |
| `/museum` | **Chopin museum** visitor experience: one project built with editor |
| `/dev/materials` · `/dev/assets` | Dev previews for PBR materials + GLB assets |
| `/dev/perf` | G3 performance harness (generated 10/100/1,000-room fixtures + Node/browser/WebGL metrics) |

## Editor

Three workspaces:

- **Layout**: CAD surface. Draft rooms (Rect, Polygon), bend walls into auto-Bezier curves,
  place Door/Window openings (rectangular/rounded/pointed profiles), place Box/Cylinder/Sphere
  objects, relocate/rotate rooms as rigid units, edit via numeric inspectors. 0.25 m grid snap,
  Shift 15° rotation snap, shared undo/redo. Plan = mutation surface; 3D view = live read-only
  preview of same compiled geometry.
- **Scene**: legacy entity authoring: models, shapes, lights, textures, materials, clusters,
  full 3D gizmos (Select/Move/Rotate/Scale, Drop to Floor).
- **Camera**: tour authoring: camera nodes, connections, guided order, camera-timeline lanes,
  in-editor preview. Nodes placed on tagged room floors.

Export: layout JSON, scene JSON, or museumpack package. Visitor consumes serialized
project; no runtime geometry compiler.

## Chopin museum (first project)

- Guided tour next/back through Chopin rooms + free-tour mode across graph-connected stops
- Smooth rounded + auto-Bézier camera paths, reduced-motion support
- Central piano chamber; no route-line overlay in visitor view
- Shared materials for floors, walls, ceilings, wood, plaster, brass
- Paris Salon asset slice with furniture, lighting, decorative GLB models
- Responsive HUD with room titles, navigation, tour controls

## Run locally

Requires Node.js 20+ and WebGL-capable browser.

```bash
npm install
npm run dev
```

- `/` or `/editor` → editor
- `/museum` → Chopin museum visitor

Useful commands:

```bash
npm run build   # Create a production build
npm run check   # Run Svelte and TypeScript checks
npm test        # Run the test suite
```

## Demo the editor on a deployed site

Production builds normally exclude editor (its `/editor` route returns 404, editor code
not bundled; `/` stays project landing). To ship build that includes editor as tool
(e.g. Vercel demo deploy), set build-time flag:

```bash
VITE_MUSEUM_EDITOR=1 npm run build   # or set VITE_MUSEUM_EDITOR=1 as a Vercel env var and redeploy
```

With flag, `/` + `/editor` both render editor in production; without it, `/editor` 404s,
`/` = project landing, editor stays out of bundle. `/dev/*` routes remain development-only.
Editor is client-side only (no server writes); everything lives in browser, exports via JSON.

## Visitor controls

- **Next / Back:** HUD buttons, arrow keys, `Space`, `Backspace`
- **Navigation nodes:** Click glowing nodes when available
- **M:** Toggle guided + free-tour modes
- **R:** Toggle reduced motion
- **Paris Salon:** Drag scene or use arrow keys to look around

## Technology

SvelteKit, Svelte 5, Threlte, Three.js, TypeScript, npm-workspaces monorepo
(`apps/museum` + `packages/*`).

## Status

Editor is the product. Direction: prove single-floor room/complex workflow, migrate
projects into serialized layout + scene data, then author camera tours on top. G1 (shared
geometry compiler) + B5 (serialized project runtime cutover) shipped; G2 (explicit Plan
render boundary) in progress. Multi-story = later goal, gated on single-floor workflow
reliable + polished. Chopin's Paris Salon = first detailed asset slice; exhibit
interactions + final artwork in progress.
