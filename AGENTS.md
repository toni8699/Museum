# Agent context — Personal / Museum

**Bootstrap only.** Durable hub: [`docs/README.md`](./docs/README.md) (**routing table — do not load every component file**). Live slice: [`docs/hand-off/CURRENT.md`](./docs/hand-off/CURRENT.md). Human overview: [`README.md`](./README.md).

If conflict: **`docs/` component files + hub win** over this file for product detail; **this file wins** for the hard rules below.

## Repo facts

- npm workspaces; **only app** `@portfolio/museum`.
- “Camera” = **3D guided PerspectiveCamera navigation**, not webcam.
- Root `dev` / `build` / `check` / `test` target museum only.

## Hard rules

1. **One nav + one motion** — `camera-route.ts` + `camera-motion.ts` only.
2. **Architecture SoT today** — `rooms.ts` until B4/B5. New rooms → `LayoutDocument`; layout must not drive `/museum` before those gates.
3. **Scene SoT** — `museum-scene.json` v6; interior connection anchors only; never persist generated endpoints.
4. **Visitor isolation** — editor prod 404 by default; no editor/layout UI in visitor chunks. Sole exception: an explicit build-time `VITE_MUSEUM_EDITOR=1` demo deploy may expose `/editor` and `/` as the editor (see root `README.md`); without that flag the editor must 404 and stay out of the visitor bundle.
5. Editor helpers outside `MuseumScene` / visitor imports.
6. No nav arrays in `rooms.ts`; no second graph/motion; prefer Floor/Wall/Ceiling planes.
7. Svelte 5 runes; Threlte patterns; `scroll-travel` unused.
8. **No commits** unless user asks.
9. **Token discipline** — read `docs/README.md` routing table, then **only** the listed file(s) for your task.

## Where to look

| Need | File |
|------|------|
| Which doc to open | [`docs/README.md`](./docs/README.md) |
| Vision | [`docs/north-star.md`](./docs/north-star.md) |
| `rooms.ts` / layout boundary | [`docs/architecture.md`](./docs/architecture.md) |
| Component contracts | [`docs/components/`](./docs/components/) (one file) |
| What to build now | [`docs/hand-off/CURRENT.md`](./docs/hand-off/CURRENT.md) |
| P0 tasks | [`docs/plans/2026-08-10-layout-cad-foundation.md`](./docs/plans/2026-08-10-layout-cad-foundation.md) — task section only |
