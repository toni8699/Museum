# Agent context — Personal / Museum

**Bootstrap only.** Durable hub: [`docs/README.md`](./docs/README.md) (**routing table — do not load every component file**). Live slice: [`docs/hand-off/CURRENT.md`](./docs/hand-off/CURRENT.md). Human overview: [`README.md`](./README.md).

Conflict: **`docs/` component files + hub win** over this file for product detail; **this file wins** for hard rules below.

## Repo facts

- npm workspaces; **only app** `@portfolio/museum`.
- “Camera” = **3D guided PerspectiveCamera navigation**, not webcam.
- Root `dev` / `build` / `check` / `test` target museum only.

## Hard rules

1. **One nav + one motion** — `camera-route.ts` + `camera-motion.ts` only.
2. **Architecture SoT today** — `rooms.ts` until B4/B5. New rooms → `LayoutDocument`; layout must not drive `/museum` before those gates.
3. **Scene SoT** — `museum-scene.json` v6; interior connection anchors only; never persist generated endpoints.
4. **Visitor isolation** — the editor ships in production at `/`, `/editor`, and `/museum/editor` (no build-flag gating). `/museum` is visitor-only: no editor/layout UI or editor code in its chunks.
5. Editor helpers outside `MuseumScene` / visitor imports.
6. No nav arrays in `rooms.ts`; no second graph/motion; prefer Floor/Wall/Ceiling planes.
7. Svelte 5 runes; Threlte patterns; `scroll-travel` unused.
8. **No commits** unless user asks.
9. **Token discipline (progressive disclosure)** — read `docs/README.md`
   (the context router), then **only** the referenced file(s) required for the
   task. Never preload the tree; archive is historical evidence, not current
   product truth. A task should need 80–200 relevant lines.
10. **Truth precedence** — when live docs conflict, highest wins:
    `source code + tests → hand-off/CURRENT.md → active plan → component
    contract → architecture.md → north-star.md → archive`. Status authority
    (what's next) is the tracker's job; direction/priority conflicts are
    owner decisions, not doc conflicts.

## Where to look

| Need | File |
|------|------|
| Which doc to open | [`docs/README.md`](./docs/README.md) (router) |
| Plan status / what's next | [`docs/plans/README.md`](./docs/plans/README.md) (tracker) |
| Live working-tree state | [`docs/hand-off/CURRENT.md`](./docs/hand-off/CURRENT.md) |
| Vision | [`docs/north-star.md`](./docs/north-star.md) |
| Ownership / boundaries | [`docs/architecture.md`](./docs/architecture.md) |
| Component contracts | [`docs/components/`](./docs/components/) (one file) |
| Historical (opt-in) | [`docs/archive/`](./docs/archive/) |
