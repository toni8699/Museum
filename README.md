# Spatial Sketch Editor

Layout-first editor for indoor 3D experiences — draw a floor plan, place
openings and objects, author a camera tour, and ship it as a serialized
project that a separate visitor runtime renders. The Chopin museum is the
first project built with it; any indoor space (gallery, office, store, venue)
can be sketched as a plan, compiled to 3D, and toured.

## What's inside

| Route | What it is |
|---|---|
| `/` or `/editor` | **Main editor** — H1 Plan · 3D editor. Boots into an empty project: draw rooms/openings in Plan, switch to 3D, place assets, author the camera tour, export a portable project |
| `/museum` | **Museum preview** — the Chopin museum visitor experience built with the editor (guided tour, free mode, reduced motion) |
| `/museum/editor` | **Legacy editor relic** — frozen pre-H1 Scene · Camera editor, kept as a museum piece; not the active editor |
| `/dev/materials` · `/dev/assets` | Dev previews for PBR materials and GLB assets |
| `/dev/perf` | G3 performance harness (generated 10/100/1,000-room fixtures + Node/browser/WebGL metrics) |

The editor always ships: `/` and `/editor` render it in production too, and
`/dev/*` stays development-only. Editing is local-first and client-side — no
server writes and no account/save backend; projects persist through portable
export/import.

## Run locally

Requires Node.js 20+ and a WebGL-capable browser.

```bash
npm install
npm run dev
```

- `/` or `/editor` → main editor
- `/museum` → Chopin museum visitor
- `/museum/editor` → pre-H1 editor relic

```bash
npm run build   # production build
npm run check   # Svelte + TypeScript checks
npm test        # test suite
```

## `/museum` controls

- **Next / Back:** HUD, arrows, `Space`, `Backspace`
- **Navigation nodes:** click glowing nodes
- **M:** guided/free tour
- **R:** reduced motion
- **Paris Salon:** drag or arrow keys to look

## Technology

SvelteKit · Svelte 5 · Threlte · Three.js · TypeScript · npm workspaces.

---

*Agent context lives in [`AGENTS.md`](./AGENTS.md) and [`docs/README.md`](./docs/README.md); this README is for humans.*
