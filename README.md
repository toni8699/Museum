# Museum Editor

The main app is now the **museum editor** — a layout-first authoring tool for 3D museum complexes.
The **Chopin museum** is its first project: a serialized `MuseumProject` (layout + scene + camera
tour) that the editor builds and the visitor experience renders.

## What's inside

| Entry point | What it is |
|---|---|
| `/` or `/editor` | The **editor** (when enabled — see demo deploy below). Root `/` renders the editor whenever the editor is enabled, otherwise the museum landing page |
| `/museum` | The **Chopin museum** visitor experience — one project built with the editor |
| `/dev/materials` · `/dev/assets` | Dev previews for PBR materials and GLB assets |
| `/dev/perf` | The G3 performance harness (generated 10/100/1,000-room fixtures + Node/browser/WebGL metrics) |

## Editor

Three workspaces:

- **Layout** — the CAD surface. Draft rooms (Rect, Polygon), bend walls into auto-Bezier curves,
  place Door/Window openings with rectangular/rounded/pointed profiles, place Box/Cylinder/Sphere
  objects, relocate/rotate rooms as rigid units, edit via numeric inspectors. 0.25 m grid snap,
  Shift 15° rotation snap, shared undo/redo. Plan is the mutation surface; the 3D view is a live
  read-only preview of the same compiled geometry.
- **Scene** — legacy entity authoring: models, shapes, lights, textures, materials, clusters,
  with full 3D gizmos (Select/Move/Rotate/Scale, Drop to Floor).
- **Camera** — tour authoring: camera nodes, connections, guided order, camera-timeline lanes,
  and in-editor preview. Nodes are placed on tagged room floors.

Export: layout JSON, scene JSON, or a museumpack package. The visitor consumes the serialized
project — there is no runtime geometry compiler.

## Museum (Chopin project)

- Guided tour with next/back through the Chopin rooms, plus free-tour mode across all graph-connected stops
- Smooth rounded and auto-Bézier camera paths with reduced-motion support
- Central piano chamber; no route-line overlay in the visitor view
- Shared materials for floors, walls, ceilings, wood, plaster, and brass
- Paris Salon asset slice with furniture, lighting, and decorative GLB models
- Responsive HUD with room titles, navigation, and tour controls

## Run locally

Requires Node.js 20 or newer and a WebGL-capable browser.

```bash
npm install
npm run dev
```

- `/` or `/editor` → the editor
- `/museum` → the Chopin museum visitor

Useful commands:

```bash
npm run build   # Create a production build
npm run check   # Run Svelte and TypeScript checks
npm test        # Run the test suite
```

## Demo the editor on a deployed site

Production builds normally exclude the museum editor (its `/editor` route returns 404 and the
editor code is not bundled; `/` stays the museum landing). To ship a build that includes the editor
as a tool — e.g. a Vercel demo deploy — set the build-time flag:

```bash
VITE_MUSEUM_EDITOR=1 npm run build   # or set VITE_MUSEUM_EDITOR=1 as a Vercel env var and redeploy
```

With the flag, `/` and `/editor` both render the editor in production; without it, `/editor` 404s,
`/` is the museum landing, and the editor stays out of the bundle. The `/dev/*` routes remain
development-only. The editor is client-side only (no server writes); everything lives in the
browser and exports via JSON.

## Museum controls

- **Next / Back:** HUD buttons, arrow keys, `Space`, and `Backspace`
- **Navigation nodes:** Click glowing nodes when available
- **M:** Toggle guided and free-tour modes
- **R:** Toggle reduced motion
- **Paris Salon:** Drag the scene or use arrow keys to look around

## Technology

Built with SvelteKit, Svelte 5, Threlte, Three.js, and TypeScript, in a
npm-workspaces monorepo (`apps/museum` + `packages/*`).

## Status

Layout-first direction: prove a single-floor room/complex workflow, migrate Chopin from `rooms.ts`
into serialized layout + scene data, then author camera tours on top. G1 (shared geometry compiler)
and B5 (serialized project runtime cutover) are shipped; G2 (explicit Plan render boundary) is in
progress. Multi-story buildings are a later goal, gated on the single-floor workflow becoming
reliable and polished. The Paris Salon is the first detailed asset slice; exhibit interactions and
final artwork remain in progress.
