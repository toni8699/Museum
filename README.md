# Personal Portfolios

npm workspaces monorepo for personal portfolio experiments. The live product today is a **Phase 1 graybox** of an interactive Chopin museum in 3D.

## Quick start

```bash
npm install
npm run dev:museum
```

Open the printed local URL, then go to `/museum`.

| Script | Purpose |
|--------|---------|
| `npm run dev:museum` | Run the museum app |
| `npm run build:museum` | Production build |
| `npm run check -w @portfolio/museum` | Typecheck |

Requires **Node ≥ 20** and a WebGL-capable browser. No env vars or backend.

> Root scripts `dev`, `dev:chopin`, and `dev:brownie` still point at apps that are not in this tree. Use `dev:museum` / `build:museum`.

## What’s in the repo

```
apps/museum/          ← SvelteKit + Threlte graybox museum (active)
packages/
  scroll-travel/      ← scroll → camera path helpers (for portfolio apps)
  audio-plink/        ← tiny Web Audio clicks
  note-cursor/        ← custom ♪ cursor trail
  portfolio-content/  ← copy for Chopin / Brownie personas
  portfolio-hud/      ← HUD widgets for scroll portfolios
  tsconfig/           ← shared TS base
```

Shared packages were built for scroll-driven portfolio sites (`chopin` / `brownie`). Those apps are not present; the museum uses its own node-to-node camera system and does not import the HUD / cursor packages.

## Museum overview

An immersive single-viewport experience: walk a circular narrative through Chopin’s life via guided camera moves between discrete stops.

**Stack:** SvelteKit 2 · Svelte 5 · Threlte · Three.js

**Routes**

- `/` — short landing (“Graybox visitor flow”)
- `/museum` — full-bleed 3D scene + HUD overlay

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

Phase 1 is intentionally graybox: primitive geometry, placeholder props, fog lighting, no final art or exhibits. Narrative content and interaction rules live in data (`rooms.ts`); the shell and camera both read from that graph.

## Status

**Phase 1 graybox** — layout and guided navigation are the product. Final materials, exhibits, audio, free-look, and collision are out of scope for this phase.

For agents and deeper camera/layout work, see [`AGENTS.md`](./AGENTS.md) and [`docs/CAMERA_AND_LAYOUT.md`](./docs/CAMERA_AND_LAYOUT.md).
