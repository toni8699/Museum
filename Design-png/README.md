# Museum Editor visual reference registry

**Status:** active visual registry — P21+ primary visual set promoted 2026-09-04.  
**Authority:** source/tests → architecture + shell/workspace behavior specs → `docs/Design-specs/Design-Plan(P21+).md` for P21+ shell/IA → `docs/Design-specs/Design-specs.md` for visual language/tokens → the visual references registered here.

The P21+ images now define the **primary visual composition and chrome direction** for the editor. Older Scene/Camera images are retained as specialized state/interaction references; they no longer govern shell placement, toolbar placement, persistence chrome, current terminology, or general P21+ visual composition.

## Authority rules

1. **Behavior beats pixels.** If any PNG disagrees with source/tests or a governing behavior spec, the behavior spec wins. Generated-image artifacts do not redefine the product model.
2. **P21 visuals beat legacy shell chrome.** If a legacy image disagrees with `Design-png/P21/*` on Row 1 / Row 2 composition, dimensions, panel framing, active-state styling, toolbar placement, persistence presentation, or current `Layout | Arrange` terminology, the P21 image wins.
3. **Legacy images remain useful for named states.** A legacy image may still govern the specific interaction/state named below when no newer P21 visual replaces that state. Its old shell/chrome is non-authoritative.
4. **Future visuals are directional, not feature contracts.** `Design-png/Future/*` is canonical visual direction for future project surfaces, but internal Experience/Assets/Publish/Hub capabilities remain illustrative unless separately ratified.
5. **Minor generated-image inconsistencies are non-authoritative.** Examples include orientation-widget details, incidental graph/sidebar omissions, placeholder metadata, or decorative controls. Exact behavior continues to come from source/tests and the governing specs.

## P21 primary visual references

These images are the primary implementation-facing compositions for the P21 editor shell and core Spatial workspaces.

| File | Surface/state | Visual authority | Governing behavior |
|---|---|---|---|
| `P21/scene-plan-layout.png` | Scene → Plan → Layout · empty/first-run | **Primary P21 shell/chrome master**; Plan surface, panel proportions, first-run treatment | `Design-Plan(P21+)`; Shell Scene §6; Design §22 |
| `P21/scene-plan-arrange.png` | Scene → Plan → Arrange · selected Scene entity | Primary populated Arrange composition; owner-aware Plan Inspector and direct yaw affordance | Shell Scene §6/§29; P10 |
| `P21/scene-3d.png` | Scene → 3D · selected Scene entity | Primary Scene 3D composition, hierarchy/Inspector density, selected-object treatment | Shell Scene §7; Design §28A |
| `P21/camera-plan.png` | Camera → Plan · selected connection + expanded Timeline | Primary Camera Plan composition, passive footprints, topology/timing/timeline presentation | Shell Camera §9/§12; Camera flow; Camera Plan footprint spec |
| `P21/camera-3d.png` | Camera → 3D · selected camera + expanded Timeline | Primary Camera 3D composition, framing/path overlays, Camera sidebar and Timeline | Shell Camera §10/§12; camera-tour contract |

### Shared P21 shell visual contract

- Row 1: project identity/persistence · project navigation · Undo/Redo · Preview · account.
- Row 2: active Spatial routing and contextual workspace commands.
- Permanent workspace tools live in Row 2; viewports keep only spatially meaningful direct-manipulation overlays.
- `#2F8CFF` is the sole generic active/selection accent; RGB axis colors remain spatial semantics only.
- Scene Plan uses the warm drafting-paper surface; Scene/Camera 3D use the dark professional real-time viewport treatment.
- Only `Spatial` is exposed in the strict P21 implementation state; future project surfaces may be shown in Future references.

## Future / North-Star visual references

These images are intentionally richer future product references. Their **visual hierarchy and surface identity** are useful direction; their exact internal controls, metadata, schemas, and backend capabilities are not ratified by the image alone.

| File | Surface | Status |
|---|---|---|
| `Future/project-hub-cover-enabled.png` | Project Hub with visual project shelf + dense project list | **Future Hub visual North Star**. Cover pipeline and illustrative metadata are deferred. |
| `Future/experience-3d-concept.png` | Experience authoring over shared Spatial truth | **Future Experience polish/reference**. `Event → Target → Action` is directional; exact tree, trigger taxonomy, audio/UI/variables features remain illustrative. Spatial remains authoritative for geometry, camera topology, and motion. |
| `Future/assets-concept.png` | project-level Assets management surface | **Future Assets visual direction**. One asset system; Type/Source are filters. Exact management capabilities remain deferred. |
| `Future/publish-concept.png` | project-level Publish/release surface | **Future Publish visual direction**. Single release destination/action hierarchy is directional; Releases/Settings/custom domain/embed internals remain illustrative unless separately ratified. |

## Legacy / specialized Scene references

The files under `Design-png/Scene/` are **not P21 shell authorities**. Keep them for the specific state or interaction they document when the P21 set does not provide an equivalent.

**Scene 3D XYZ-gizmo authority:**
`Scene/scene-3d-object-selection-xyz-gizmo.png` remains the specialized reference for a complete red X, green Y, blue Z transform gizmo at one pivot. The P21 Scene 3D composition does not supersede this exact gizmo contract.

| File | Retained specialized purpose |
|---|---|
| `Scene/scene-plan-layout.png` | populated Layout-state content reference until a populated P21 Layout visual exists; shell is legacy |
| `Scene/scene-plan-staging.png` | historical pre-P10 staging/footprint reference only; `Arrange` terminology now wins |
| `Scene/scene-empty-plan.png` | legacy empty-Plan reference; superseded visually by `P21/scene-plan-layout.png` |
| `Scene/scene-empty-3d.png` | empty Scene 3D state |
| `Scene/scene-3d-object-selection.png` | legacy selected-object composition; superseded visually by `P21/scene-3d.png` |
| `Scene/scene-3d-object-selection-xyz-gizmo.png` | authoritative complete XYZ transform-gizmo detail |
| `Scene/scene-3d-layout-selection.png` | selected Layout surface in Scene 3D |
| `Scene/scene-3d-assets.png` | Scene 3D contextual asset browse/place state |
| `Scene/scene-object-inspector.png` | detailed object Inspector state |
| `Scene/scene-assets-import.png` | import processing/ready/failed state |

## Legacy / specialized Camera references

The files under `Design-png/Camera/` are **not P21 shell authorities**. They remain useful for camera states not fully represented by the two primary P21 Camera compositions.

**Camera behavior authority:** graph/Sequence semantics come from source/tests and the Camera specs. Connections remain undirected; Sequence is ordered. Directional arrows belong only to preview/playback/timing semantics, never connection topology.

| File | Retained specialized purpose |
|---|---|
| `Camera/camera-plan-overview.png` | legacy Camera Plan overview; visually superseded by `P21/camera-plan.png` |
| `Camera/camera-plan-flow.png` | graph/Sequence authoring behavior |
| `Camera/camera-plan-branch.png` | Unsequenced branch behavior |
| `Camera/camera-3d-overview.png` | legacy Camera 3D overview; visually superseded by `P21/camera-3d.png` |
| `Camera/camera-3d-framing.png` | framing-specific state |
| `Camera/camera-sidebar.png` | historical populated sidebar reference |
| `Camera/camera-sidebar-empty.png` | empty Sequence sidebar |
| `Camera/camera-sidebar-neighbors.png` | legacy neighbor disclosure |
| `Camera/camera-sidebar-neighbor-accordion.png` | specialized shipped neighbor-accordion behavior |
| `Camera/camera-preview-scopes.png` | Camera / Edge / Sequence preview scopes |
| `Camera/camera-preview-edge.png` | Preview Camera + Preview Edge entry |
| `Camera/camera-path-edit.png` | path edit while preserving Sequence |
| `Camera/camera-sequence-reroot.png` | Sequence re-root |
| `Camera/camera-sequence-insert-zones.png` | Start/Between/End insertion validity |
| `Camera/camera-sequence-remove-camera.png` | head/middle/tail removal |
| `Camera/camera-sequence-delete-protection.png` | protected edge/node deletion |
| `Camera/camera-timeline-expanded.png` | legacy expanded Timeline detail; P21 Camera images now own overall composition |
| `Camera/camera-timeline-collapsed.png` | canonical collapsed 48px Timeline state until replaced |
| `Camera/camera-timeline-sequence-only.png` | Sequence-only Timeline projection |

## Other retained visual assets

Top-level legacy images such as `collapsed.png`, `expanded-new.png`, and `x-y-z-box.png` remain in Git history/current tree for their specialized purpose. They do not override the P21 shell. Orientation behavior/render details continue to defer to the dedicated orientation specs and current implementation/tests.

## Visual QA

Review each image at original resolution. For implementation:

- shell/chrome and broad visual hierarchy come from the P21 primary set;
- exact behavior, ownership, topology, selection/history, transforms, and Timeline semantics come from source/tests and the governing specs;
- Future images must not be used to infer an unratified backend or data model;
- legacy images must not reintroduce the pre-P21 app bar, permanent floating toolbar, `Staging` terminology, or old persistence/Preview chrome.

A PNG is implementation-authoritative only to the extent explicitly registered above.
