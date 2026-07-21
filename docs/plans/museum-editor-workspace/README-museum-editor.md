# Museum Editor Workspace Releases

**Status:** Proposed implementation authority after Phase 6.6 Slice 6.  
**Baseline:** current Phase 6.6 work is staged and uncommitted. Preserve it. Do not commit unless requested.  
**Locked decisions:** one looped guided tour; `Scene` and `Camera` workspaces; camera placement accepts any tagged room floor.

## Main Problem

The earlier plan combined four products:

1. Editor shell redesign.
2. Camera timeline and graph authoring.
3. Primitive/light scene schema.
4. Texture import, material instances, and package export.

They now ship as five ordered releases. Each release has its own gate and handoff. No release may pull schema or behavior forward from a later release.

## Release Map

| Phase | Release | Outcome | Complexity | Recommended model | Reasoning |
|---:|---|---|---:|---|---|
| 1 | [Editor layout](./phase-1-editor-layout.md) | Persistent shell; no schema or camera behavior change | High | `gpt-5.6-sol` | High |
| 2 | [Camera editing MVP](./phase-2-camera-editing-mvp.md) | Discover, scrub, preview, and drag existing camera keys | Very High | `gpt-5.6-sol` | XHigh |
| 3 | [Camera graph authoring](./phase-3-camera-graph-authoring.md) | Add/connect/delete/reorder cameras; framing handles; timing last | Extreme | `gpt-5.6-sol` | Max |
| 4 | [Scene creation](./phase-4-scene-creation.md) | Real primitive/light entities and schema migration | Extreme | `gpt-5.6-sol` | Max |
| 5 | [Textures](./phase-5-textures.md) | Texture/material MVP; package export as follow-on | Extreme | `gpt-5.6-sol` | Max |

## Required Order

1. Shell.
2. Inspector extraction.
3. Timeline frame.
4. Camera discovery.
5. Timeline selection and scrub.
6. Whole-tour playback.
7. Camera-key dragging.
8. Graph authoring.
9. Guided-order editing.
10. Framing controls.
11. Timing schema.
12. Primitives and lights.
13. Textures and package export.

Do not combine timing, entity union, and texture/material changes into one schema migration. Planned canonical versions:

- Current camera-view baseline: v3.
- Phase 3 timing: v4.
- Phase 4 entity union: v5.
- Phase 5 materials/textures: v6.

If the checked-in schema version changes before a phase starts, preserve the separation and increment from the actual baseline.

## Product Shell

```text
┌──────────────────────────────────────────────────────────────────────┐
│ Museum Editor | Scene Camera | Undo Redo | Preview… | Project actions│
├──────────────┬───────────────────────────────────┬───────────────────┤
│ Scene Assets │                                   │ Inspector         │
│              │            3D VIEWPORT            │                   │
│ tree/search  │  Select Move Rotate Scale Add     │ selection fields  │
│ thumbnails   │                                   │                   │
├──────────────┴───────────────────────────────────┴───────────────────┤
│ Camera timeline — collapsed in Scene; open in Camera                │
└──────────────────────────────────────────────────────────────────────┘
```

Persistent regions:

- Top application bar.
- Left `Scene` / `Assets` tabs.
- Center viewport with local toolbar.
- One contextual right inspector.
- Bottom camera timeline.

Workspace switching changes attention, default filters, helper visibility, and timeline state. It does not replace the world, document, history, or selection registry.

## Shared UX Contracts

### Top bar

- App-wide actions only.
- Workspace-specific preview label:
  - Scene: `Preview Museum`.
  - Camera: `Preview Tour`.
- Phase 1 project actions: `Import`, `Copy JSON`, `Download JSON`, `Reset`.
- True filesystem `Save` is deferred.
- Package export is deferred to Phase 5 and does not block texture MVP.
- Transform tools stay in the viewport toolbar.

### Left sidebar

- Persistent `[ Scene ] [ Assets ]` tabs.
- Camera workspace adds `[ All ] [ Cameras ]`; it defaults to `Cameras` but never locks the user out of scene objects.
- User may select a wall, painting, or piano while framing a camera.

### Timeline

- Two states only:
  - Collapsed: `36px`.
  - Open: resizable `220–360px`, default `280px`.
- Camera workspace auto-opens it.
- Scene workspace remembers the user's current-session choice.
- Lane names:
  - `Guided Route`.
  - `Camera Framing`.
- Do not expose independent Position, Target, or FOV animation curves.

### Object creation

Long-term Add menu:

```text
Asset
Box
Plane
Cylinder
Sphere
Light
Camera
```

Only expose enabled commands in each release. Texture is never a scene object.

## Shared Camera Model

Use these terms consistently:

1. **Camera node** — visitor stop; eye, target, and FOV.
2. **Connection** — graph edge between two camera nodes.
3. **Position path** — movement geometry for one connection.
4. **Camera key** — interior framing breakpoint; path progress, target, and FOV.
5. **Guided order** — ordered camera-node subset forming one reciprocal cycle.

Camera-key position remains derived from exact connection-path progress. Never persist a duplicate position. Never create a second navigation graph, route builder, curve compiler, or camera sampler.

## Repository Contracts

- `apps/museum/src/lib/content/museum-scene.json` is the editable scene/tour source.
- `rooms.ts` owns static architecture only.
- `scene-codec.ts` is the strict migration/validation boundary.
- `scene.ts` resolves room-local data and generates connection endpoints.
- `camera-route.ts` owns graph route assembly.
- `camera-motion.ts` is the only motion/curve compiler.
- Editor helpers remain outside visitor imports and `MuseumScene`.
- Production `/museum` shows no editor helpers.
- Production `/dev/museum-editor` remains 404 and excludes real editor modules from visitor chunks.
- All document mutations are atomic, undoable, and cancel-safe.
- Session layout state never enters JSON, dirty comparison, or history.

## Read First

1. `AGENTS.md`
2. `docs/agent-handoffs/phase-6.6-slice-6.md`
3. This README
4. The selected phase plan
5. `docs/CAMERA_AND_LAYOUT.md`
6. `docs/plans/camera-path-authoring.md`
7. `docs/plans/camera-view-authoring.md`

## Release Gate

Start a phase only after the previous phase passes its automated and browser acceptance checks. Create a separate interim handoff after every slice. Do not edit later-phase schema during an earlier release.
