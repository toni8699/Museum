# Personal Portfolios

npm workspaces monorepo for personal portfolio experiments. The live product today is an interactive Chopin museum in 3D, with a **Phase 4 Paris Salon asset vertical slice** inside the wider graybox.

## Quick start

```bash
npm install
npm run dev
```

Open the printed local URL, then go to `/museum`.

| Script | Purpose |
|--------|---------|
| `npm run dev` / `dev:museum` | Run the museum app |
| `npm run build` / `build:museum` | Production build |
| `npm run check` | Typecheck museum |

Requires **Node ≥ 20** and a WebGL-capable browser. No env vars or backend.

## What’s in the repo

```
apps/museum/          ← SvelteKit + Threlte museum (only app)
packages/
  scroll-travel/      ← scroll → camera path helpers (unused by museum)
  audio-plink/        ← tiny Web Audio clicks
  note-cursor/        ← custom ♪ cursor trail
  portfolio-content/  ← shared copy helpers
  portfolio-hud/      ← HUD widgets
  tsconfig/           ← shared TS base
```

Shared packages are available in the workspace; the museum uses its own node-to-node camera system and does not import the HUD / cursor packages.

## Museum overview

An immersive single-viewport experience: walk a circular narrative through Chopin’s life via guided camera moves between discrete stops.

**Stack:** SvelteKit 2 · Svelte 5 · Threlte · Three.js

**Routes**

- `/` — short landing (“Graybox visitor flow”)
- `/museum` — full-bleed 3D scene + HUD overlay
- `/dev/materials` — isolated architecture-material preview
- `/dev/assets` — GLB inspector, licence metadata, scale checks, and fallbacks

**Controls**

- **Next / Back** (HUD or `→` `↓` `Space` / `←` `↑` `Backspace`)
- Click glowing navigation spheres (when allowed)
- **M** — guided ↔ free tour
- **R** — reduced motion (instant jumps)

## Spatial layout

Seven rooms sit around a central music chamber. A gold “staff path” on the floor follows the tour graph. Doors and sightline cutouts face the chamber where designed.

```
                    [Workshop]
                        |
    [Departure] ---- [Music Chamber] ---- [Legacy]
         |              (center)              |
     [Poland]                              [Entrance]
         |                                    |
         +--------- tour loop closes ---------+

Tour order (8 stops):
  Entrance → Poland → Departure → Paris → Workshop
  → Music Entry → Central Piano → Legacy → (back to Entrance)
```

| Room | Role |
|------|------|
| Entrance | Dark threshold — “The First Note” |
| Poland | Roots and early voice |
| Departure | Distance from home |
| Paris Salon | Artist / teacher / performer |
| Workshop | Composition and manuscripts |
| Music Chamber | Circular focus; graybox grand piano |
| Legacy | Continuing music; returns to entrance |

Most rooms remain intentionally graybox. Paris Salon is the first asset-based slice: an optimized grand piano and repeated chair model sit alongside reusable primitive fallbacks. Narrative content and interaction rules still live in `rooms.ts`; Paris object transforms live separately in `paris-salon-layout.ts` without changing the camera graph.

## Status

**Phase 1–4** — layout, guided navigation, shared architecture materials, and the Paris Salon asset workflow. Production GLBs are cached and safely cloned, source/licence records remain separate, and `/dev/assets` validates models before placement. Other rooms, final portraits, and exhibit interaction remain later work.

For agents and deeper camera/layout work, see [`AGENTS.md`](./AGENTS.md) and [`docs/CAMERA_AND_LAYOUT.md`](./docs/CAMERA_AND_LAYOUT.md).
