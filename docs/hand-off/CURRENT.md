# Current handoff — live working-tree delta

Template per [`../README.md`](../README.md). Sliding window: immediate previous
slice plus one next action only.

## Working tree

- Current delta: **P12.5 closeout — shipped 2026-08-28, uncommitted.** Canonical
  Camera timeline/shell/design docs now express the P12 selection-only,
  explicit-entry, binary-transport, one-shell contract. Superseded P11 test
  assertions are migrated or explicitly relic-scoped. Browser QA exposed and
  fixed one lifecycle defect: unmounting Camera 3D while switching to Camera
  Plan no longer tears down a paused main-editor preview session. The relic
  keeps its frozen teardown behavior. P12 umbrella and slice briefs are
  archived; tracker and router now identify P3B.7a/P3B.8 as the remaining gate.
- Previous delta: **P12.4 — integrated temporal mini-player + lane scrubbing**
  (shipped 2026-08-27, uncommitted). Main-editor transport is Previous /
  Play-Pause / Next with active-scope scrubbing, timecode, POV/Observer, and
  Center/Follow. Expanded mode owns the five-lane ruler/playhead surface.
  Main-editor Repeat/loop/Replay/Reverse are absent; `+ View Key` remains a
  live 3D Sequence-only action. `/museum/editor` remains frozen.

## Next action

- Close **P3B.7a/P3B.8** browser/visual QA. This is the sole remaining hard
  gate. After it closes, P14 Camera Plan passive footprints is first scheduled.

## Verification

- Full Vitest: 167 files passed, 1 skipped; 2,274 tests passed, 1 skipped.
- `npm run check`: 0 errors / 0 warnings.
- `npm run build`: passed; known unused-import and chunk-size warnings only.
- Focused P12 closeout contracts: 111 tests passed.
- Browser QA passed main-editor Sequence, Edge, and static Camera scopes;
  Play/Pause and focused-viewport Escape; Camera Plan ↔ Camera 3D continuity;
  expanded/collapsed and 650px narrow chrome; Scope/More keyboard focus return;
  relic isolation; no-flow shell; and `/museum` visitor purity. Gap behavior is
  contract-covered rather than manually reconstructed in this pass.

## Known bugs / deferred

- P3.4/P3.5 remain undone/not accepted and low-priority deferred.
- Direct 3D wall/interior-anchor picks remain deferred.
- Layout hover feed and anchor-helper octahedra remain disconnected.
- Drafted-room `focusRoom` retains a latent Paris-default path outside the
  fixed editor flow.
- Runtime logs retain known Svelte `ownership_invalid_mutation` warnings for
  `cameraPlan` and `layoutInteraction`; static checking is clean.

## Traps

- Both Plan workspaces stay mounted. Hidden cells retain `inert` and
  `plan-cell--hidden`; shared `view` remains one Plan|3D axis.
- Camera 3D rig unmount during a main-editor Camera Plan switch must preserve
  the paused preview session. Leaving the Camera workspace stops it through
  `setWorkspace`; the relic retains stop-on-unmount/stop-on-Escape behavior.
- P12 ordinary selection never enters Camera/Edge scope. Only explicit preview
  actions do; sequenced-node selection in Sequence seeks + pauses.
- Camera timeline edge keys include direction; preview-route memo keys on
  `preview.runId`, never cloned route identity.
- Camera means guided PerspectiveCamera navigation, never webcam.

## Non-negotiables

- `/museum` is visitor-only and its chunks contain no editor/layout code.
  Editor ships at `/`, `/editor`, and frozen relic `/museum/editor`.
- No commits unless the user asks.
- One nav + one motion: `camera-route.ts` + `camera-motion.ts` only.
- Svelte 5 runes / Threlte; no second selection, history, graph, motion,
  geometry, or transform system.
