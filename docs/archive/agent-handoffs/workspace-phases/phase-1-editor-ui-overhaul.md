# Final Handoff — Museum Editor Phase 1 UI Overhaul

## Status

- **Release:** Phase 1 — persistent editor layout and UI overhaul.
- **Result:** Complete; automated, production-boundary, and browser acceptance passed.
- **Baseline:** `main` at `26ce3a4`; Slice 1.3 and Phase 1.4 remain uncommitted.
- **Scene/runtime data:** unchanged. No schema, scene JSON, camera route/motion, graph, or visitor behavior changed.
- **Commit:** none created.

## Delivered

- Persistent application shell with top bar, Scene/Assets sidebar, shared viewport, contextual inspector, and camera timeline.
- Scene and Camera workspaces share one store, document, history, selection registry, and viewport.
- App-wide preview and project actions now live in the top bar; Scene JSON persistence controls no longer occupy the contextual inspector.
- Compact viewport toolbar owns Select, Move, Rotate, Scale, Local/World, mode-specific Snap, and restricted connected-camera Add.
- Existing camera transport now lives in a 36 px collapsed or 220–360 px resizable bottom panel.
- Camera auto-opens the timeline while Scene restores its own session-only expansion preference.
- Scene/Assets panels stay mounted so asset search, filters, and selection persist across tab switches.
- Responsive layouts use three desktop columns, a two-panel tablet row, and a single-column narrow stack without horizontal overflow.
- Narrow Project actions are pinned inside the viewport; the toolbar wraps without obscuring the main scene.

## Browser Acceptance

- Desktop `1280×720`: three-column shell, 36 px collapsed timeline, no page overflow.
- Tablet `900×900`: viewport and timeline remain full width; sidebar and inspector sit below without overlap.
- Narrow `390×844`: viewport, timeline, sidebar, and inspector stack in order with no horizontal overflow.
- Expanded narrow timeline remains 280 px and pushes later regions down; it does not overlap them.
- Scene/Camera switching preserves selection; Camera opens the timeline and Scene restores its remembered state.
- Scene/Assets switching preserves an active `chair` filter and contextual asset selection.
- Select, Move, Rotate, Scale, Local/World, and Snap toolbar states were exercised.
- Timeline keyboard resizing reached both 220 px and 360 px clamps; collapse/open remained reachable.
- Director node preview, Visitor mode, Director transition stepping/playback, and Stop all worked from the bottom transport.
- Add Connected Camera exposed only the existing restricted command.

## Verification

- `npm run check` — 0 errors, 0 warnings.
- `npm test -- --run` — 20 files / 292 tests passed.
- `npm run build` — passed.
- `git diff --check` — passed.
- Production HTTP smoke: `/museum` returned 200; `/dev/museum-editor` returned 404.
- Production output search found no `Viewport tools`, `Project actions`, `Camera timeline`, `EditorViewportToolbar`, or `Add connected camera` symbols.

Build output retains existing third-party unused-import, large-chunk, adapter-auto, and npm CLI forwarding notices.

## Next Release Boundary

Phase 2 may add camera discovery, timeline selection/scrub, whole-tour playback, and dragging existing camera keys. Do not pull Phase 3 graph authoring, timing schema, primitives/lights, or textures forward.
