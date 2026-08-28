# Design Specification (Frozen): Passive Object Footprints on Camera Plan

**Document Type:** Final Design Review & Implementation Specification  
**Surface:** Museum Editor — Camera Plan (Tour Drafting Surface)  
**Date:** 2026-08-28  
**Status:** Frozen / Implementation-Ready  
**Scope:** Visibility & 2D Spatial Context Only (Non-Collision / Non-Validation)  
**Amends:** `Design-specs.md` §3 — supersedes the prior "Camera Plan passes no Scene footprint projection" rule; the master spec is amended to reference this specification.

---

## 1. Product Contract & Core Principles

```
┌────────────────────────────────────────────────────────────────────────┐
│                          CORE PRODUCT RULE                             │
├────────────────────────────────────────────────────────────────────────┤
│  Camera Plan renders passive floor footprints of eligible physical     │
│  objects solely as 2D spatial context beneath the camera graph.        │
│                                                                        │
│  Footprints communicate projected floor presence so the designer       │
│  understands what occupies the space, but DO NOT indicate collision,   │
│  path validity, or guaranteed clearance bounds.                        │
└────────────────────────────────────────────────────────────────────────┘
```

### 1.1 Projection Context vs. 3D Motion
* **Pure $X/Z$ Spatial Reference:** Camera Plan is an orthographic $X/Z$ drafting surface. It answers **where** camera nodes and connections sit horizontally across the floor plan. Camera height ($Y$), look direction, tilt, and framing are authored in 3D contexts.
* **Permissive Footprint Overlap:** A camera connection may legitimately cross an object footprint in Plan (e.g., flying over a low display case, bench, or floor pedestal). The 2D renderer treats this as standard visual layering without warnings, error states, or blocked-path flags.
* **Separation of Validation:** True collision/clearance validation, if added later, must evaluate actual 3D camera motion and scene geometry rather than infer validity from Camera Plan footprint overlap.

---

## 2. Scope of Footprint Ingestion

Camera Plan will consume **only existing canonical footprint render data** already produced by the shared 2D drafting pipeline:

* **Included (Eligible Canonical Footprints):**
  * Placed catalogue assets with pre-existing canonical 2D floor footprint projections.
  * Plan-authored primitives (boxes, cylinders) with defined 2D layout geometry.
  * Native Layout-object identities with valid floor projections.
  * Clustered arrangements — rendered as the footprints of their member objects (no group outline).
* **Excluded / Deferred:**
  * Imported meshes or custom 3D model types that lack canonical 2D footprint data in the current layout pipeline.
  * Lights, ceiling fixtures, and unassociated floating primitives without floor projections.
* **No New Geometry Generation:** Camera Plan will not synthesize custom convex hulls, collision boundaries, or clearance offsets. If an object produces a canonical 2D projection on the Scene Plan, that exact projection renders passively on the Camera Plan.

---

## 3. Visual Specification & Token Architecture

Camera Plan uses dedicated semantic aliases of the **shared passive footprint presentation** already used by Scene Plan footprints (the muted plan ink for the outline and the neutral ~12% gray tint for the fill). Initial appearance matches the shared footprint language exactly; Camera-specific contrast may be tuned during density QA without changing semantics.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        RENDER STACK (Z-ORDER)                          │
├────────────────────────────────────────────────────────────────────────┤
│  [Z: 600] Camera Nodes, Selection Rings, Tangent/Path Handles          │
│  [Z: 500] Camera Path Curves (Undirected Topology)                     │
│  [Z: 400] Node Order & Timing Badges (Opaque Backing Plate)            │
│  [Z: 300] In-Progress Camera Placement Ghosts & Crosshairs            │
│ ────────────────────────────────────────────────────────────────────── │
│  [Z: 200] PASSIVE OBJECT FOOTPRINTS (NEW LAYER)                        │
│           ├── Outline: stroke-dasharray (4px 3px), non-scaling-stroke  │
│           └── Fill: Subdued neutral tint                               │
│ ────────────────────────────────────────────────────────────────────── │
│  [Z: 100] Architectural Openings & Walls (Solid strokes)               │
│  [Z: 000] Room Floor Polygons (Active Floor Hit-Target)                │
└────────────────────────────────────────────────────────────────────────┘
```

### 3.1 Token Mapping & Visual Defaults

| Property | Token / Spec | Implementation & Visual QA Rule |
| :--- | :--- | :--- |
| **Stroke Token** | `--editor-camera-footprint-stroke` | Alias of the shared passive footprint outline ink (`--editor-plan-muted`, the Scene Plan footprint stroke). Tuned only if density QA on toned paper requires. |
| **Fill Token** | `--editor-camera-footprint-fill` | Alias of the shared passive footprint tint (the neutral ~12% gray fill used by Scene Plan footprints). |
| **Stroke Weight** | `1.5px` baseline (shared language) | QA tune range `1px`–`1.5px`; adjust only if the toned camera paper needs more or less separation. |
| **Dash Pattern** | `5 4` (`stroke-dasharray="5 4"`) | Shared footprint rhythm (QA alternative `4 3`); fixed screen-space, will not alias into solid wall lines. |
| **Rendering Flag** | `vector-effect="non-scaling-stroke"` | Dash pattern remains stable across all zoom factors. |
| **Interactivity** | `pointer-events: none` | Completely inert. No hover, selection, drag, or tooltips. |

### 3.2 Plan-Primitive Parity
On the Camera Plan surface only, plan-authored primitives drop their legacy faint beige styling and adopt `--editor-camera-footprint-stroke` and `--editor-camera-footprint-fill`. All eligible objects share a single, unified footprint language there; authored identity, behavior, and Scene Plan appearance are unchanged.

---

## 4. Multi-Scale Zoom Behavior

Screen-space stroke and dash rendering ensures predictable readability without requiring dynamic LOD or culling algorithms for this release:

```
 ROOM OVERVIEW (25% - 33%)          PATH DRAFTING (100%)              CLOSE-UP (200% - 300%)
 ┌─────────────────────────┐        ┌─────────────────────────┐       ┌─────────────────────────┐
 │ ┌- - -┐                 │        │ ┌ - - - - - - - - - ┐   │       │ ┌ - - - - - - - - - - - │
 │ ┊ Vit ┊  (01)───(02)    │        │ ┊  Central Vitrine  ┊   │       │ ┊                       │
 │ └- - -┘        │        │        │ ┊ (Floor Presence)  ┊   │       │ ┊   Central Vitrine     │
 │                │        │        │ └ - - - - - - - - - ┘   │       │ ┊   (Canonical Form)    │
 │      ┌- - -┐  (03)      │        │          │              │       │ ┊                       │
 │      ┊ Ped ┊            │        │          │              │       │ ┊                       │
 │      └- - -┘            │        │       (Node 02)         │       │ └ - - - - - - - - - - - │
 └─────────────────────────┘        └─────────────────────────┘       └─────────────────────────┘
  • Fixed screen stroke              • Balanced drafting context       • Fixed screen stroke
  • Shared 5/4 dash rhythm           • Footprint sits quietly behind   • Interior tint defines
  • Never reads as solid wall          connection curves (no arrows)     projected boundary
```

---

## 5. Density Sample: Exhibition Gallery

Below is an exhibition gallery scenario. The camera path connects Node 01 through Node 04 with no direction drawn on the connections: the Plan never shows arrowheads, and tour sequence is communicated via node numbering, not path arrows. The path passes near wall cases and crosses over *Low Pedestal A*.

```
═══════════════════════════════════════════════════════════════════════════════════════════════════════
 WALL [Architectural: Solid 3px]
═══════════════════════════════════════════════════════════════════════════════════════════════════════
  │  ┌ - - - - - - - - - - - - - - - - - ┐                      ┌ - - - - - - - - - - - - - - - - - ┐  │
  │  ┊ Perimeter Display Case North-A   ┊                      ┊ Perimeter Display Case North-B   ┊  │
  │  └ - - - - - - - - - - - - - - - - - ┘                      └ - - - - - - - - - - - - - - - - - ┘  │
  │                                                                                                    │
  │    ( Node 01 )                                                                                     │
  │        │                                                                                           │
  │        │    Camera Connection Curve [Solid Undirected 2.5px]                                       │
  │        │                                                                                           │
  │        │            ┌ - - - - - - - - - - - - - - - - - ┐                                          │
  │        │            ┊                                   ┊                                          │
  │        │            ┊   Monolithic Central Vitrine      ┊                                          │
  │        └── ( Node 02 )  (Canonical Floor Footprint)     ┊                                          │
  │                │    ┊                                   ┊                                          │
  │                │    └ - - - - - - - - - - - - - - - - - ┘                                          │
  │                │                                                                                   │
  │                │                                              ┌ - - - - - - ┐                      │
  │                │                                              ┊ Pedestal B  ┊                      │
  │                │   [Path crosses low pedestal footprint;      ┊(Floor Pres.)┊                      │
  │                │    elevation handled in 3D / motion]         └ - - - - - - ┘                      │
  │                │                                                     │                             │
  │                │           ┌ - - - - - - ┐                           │                             │
  │                └───────────┊ Low Pedestal┊───────────────────────────┘                             │
  │                            ┊ A (Floor)   ┊                                                         │
  │                            └ - - - - - - ┘                                                         │
  │                                   │                                                                │
  │                                   │                                                                │
  │                                ( Node 03 ) ─────── ( Node 04 ) ─────── [Exit Door]                 │
  │                                                                                                    │
═══════════════════════════════════════════════════════════════════════════════════════════════════════
 WALL [Architectural: Solid 3px]
═══════════════════════════════════════════════════════════════════════════════════════════════════════
```

---

## 6. Interplay States

Footprints remain **visually constant** across all graph operations. They do not fade, pulse, highlight, or diminish when nodes, handles, or curves are manipulated.

```
       STATE A: SELECTED CONNECTION                STATE B: SELECTED NODE & PATH HANDLES
  ┌─────────────────────────────────────┐       ┌─────────────────────────────────────┐
  │                                     │       │                o [Path Handle]      │
  │   ┌ - - - - - ┐                     │       │   ┌ - - - - - ┐ \                   │
  │   ┊ Footprint ┊   ─── Path ───      │       │   ┊ Footprint ┊  \                  │
  │   └ - - - - - ┘  (Active Accent)    │       │   └ - - - - - ┘   ( Node 03 )       │
  │         │                           │       │         │      [Selected Ring]      │
  │   Active connection passes cleanly  │       │         │      /                    │
  │   OVER footprint. No direction drawn.│       │   Handles sit above footprint.      │
  └─────────────────────────────────────┘       └─────────────────────────────────────┘

       STATE C: PLACEMENT GHOST                     STATE D: LABELS & BADGES
  ┌─────────────────────────────────────┐       ┌─────────────────────────────────────┐
  │                                     │       │                                     │
  │   ┌ - - - - - - - - - ┐             │       │   ┌ - - - - - ┐  ┌───────────┐      │
  │   ┊ Footprint         ┊             │       │   ┊ Footprint ┊  │ 00:04.5s  │      │
  │   ┊                   ┊             │       │   └ - - - - - ┘  └───────────┘      │
  │   └ - - - - - - - - - ┘             │       │         │        (Canvas Halo)     │
  │             + [Placement Ghost]     │       │   Halo behind glyphs clips      │
  │   Ghost cursor floats freely over   │       │   dashed lines cleanly.          │
  │   floor and footprints alike.       │       │                                     │
  └─────────────────────────────────────┘       └─────────────────────────────────────┘
```

### State Definitions

* **Selected Connection (State A):** Active path curves render on layer `Z:500` with active stroke styling (`--editor-plan-selection`). Footprint dashes remain passive on `Z:200` underneath. No direction arrows or intersection warnings.
* **Selected Node & Path Handles (State B):** Selection ring and path handles/anchors render on layer `Z:600`. Framing graphics (frustums, FOV cones, look-targets) are **not** present on Camera Plan. Footprint styling stays constant.
* **Camera Placement Ghost (State C):** When appending or inserting a node, the ghost icon and tentative path line render at `Z:300`. The author can place a camera anywhere on the canvas, including directly over a footprint.
* **Timing & Order Badges (State D):** Metadata badges on `Z:400` keep the existing canvas-paper stroke halo behind their glyphs, so dashed footprint strokes never break up typography. No new backing plate is introduced.

---

## 7. Interaction & Hit-Testing Model

```
 USER POINTER CLICK / TAP
           │
           ▼
 ┌────────────────────────────────────────────────────────┐
 │ Layer Z:600 - Camera Graph Interactive Elements        │  ──> [HIT: Select/Drag Node/Handle]
 └────────────────────────────────────────────────────────┘
           │ (miss)
           ▼
 ┌────────────────────────────────────────────────────────┐
 │ Layer Z:200 - Object Footprints (pointer-events: none) │  ──> [IGNORED / PASS-THROUGH]
 └────────────────────────────────────────────────────────┘
           │ (passes directly through)
           ▼
 ┌────────────────────────────────────────────────────────┐
 │ Layer Z:000 - Architectural Floor Geometry            │  ──> [HIT: "Add Camera" Click Target]
 └────────────────────────────────────────────────────────┘
```

1. **Footprint Layer is Fully Inert:** The footprint layer enforces `pointer-events: none`. Footprints never intercept clicks, hovers, drags, or selections.
2. **Floor Hit-Testing Unaltered:** Clicks over footprint areas pass through to the architectural floor polygon (`Z:000`). "Click Floor to Add Camera" operates uniformly across the room without dead zones.

---

## 8. Implementation Checklist

- [ ] Define `--editor-camera-footprint-stroke` and `--editor-camera-footprint-fill` as semantic aliases of the shared passive footprint presentation (outline ink + neutral tint).
- [ ] Camera Plan renders passive footprints of every eligible object (catalogue assets, plan primitives, layout objects, cluster members) as one layer above architecture and below the camera graph, reusing the shared 2D plan's existing footprint layer.
- [ ] Footprints are fully inert (no hover, selection, drag, or tooltip); pointer clicks fall through to floor hit-testing so "Add Camera" works over footprints without dead zones.
- [ ] Footprint outlines use the shared dash/stroke language — `vector-effect="non-scaling-stroke"`, `stroke-dasharray="5 4"`, ~1.5px baseline (QA tune range 1px–1.5px; `4 3` dash alternative).
- [ ] Plan-authored primitives adopt the unified footprint presentation on the Camera Plan surface only.
- [ ] Connections are drawn without direction chevrons/arrowheads — direction is never rendered on the edge (sequenced direction is implied by order). No frustums, look-targets, or FOV cones in Camera Plan (already enforced).
- [ ] Label glyphs keep the canvas-paper stroke halo so dashed footprints never break up typography.
- [ ] Conduct visual density QA to finalize stroke weight and tint balance on toned canvas paper.


# Specification Ratified & Implementation Handoff

**Status:** APPROVED & RATIFIED (Score: 9.5/10)  
**Surface:** Museum Editor — Camera Plan  
**Target:** Implementation Phase  

The design review is officially closed and ratified. The terminology, layer, direction-wording, and label clarifications have been folded into the final handoff specification below.

---

## 1. Ratified Terminology & Wording Updates

1. **Path Controls:** Replaced "tangent handles" with canonical **"path handles / anchors"** to remain agnostic to the underlying curve interpolation model.
2. **Layer Stacking:** Shifted from illustrative numeric z-indexes to structural DOM/renderer layer ordering: **"canonical passive-footprint layer, rendered above architecture and below the camera graph."**
3. **Floor Hit-Testing Contract:** Updated placement rule to specify **"any valid floor location, including where a passive footprint is visible,"** maintaining strict floor-polygon hit boundaries (disallowing clicks in empty canvas/void space).
4. **Direction Wording:** Connections are **drawn without direction chevrons/arrowheads** — direction is visualization-only and never rendered on the edge. Unsequenced connections carry no implied direction; in a sequenced tour, direction is implied by sequence order and communicated via node numbering, not drawn arrows.
5. **Label Treatment (kept):** Labels keep the existing **canvas-paper stroke halo** behind their glyphs; no new opaque backing plate is introduced.

---

## 2. Ratified Pipeline & Architecture

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        CANONICAL DATAFLOW                              │
├────────────────────────────────────────────────────────────────────────┤
│  Canonical Footprint Data (Layout / Scene Source)                      │
│        │                                                               │
│        ▼                                                               │
│  Shared 2D Plan Renderer Pipeline                                      │
│        │                                                               │
│        ▼                                                               │
│  Camera Plan Passive Presentation Layer                                │
│        ├── Stroke: var(--editor-camera-footprint-stroke)               │
│        ├── Fill:   var(--editor-camera-footprint-fill)                 │
│        ├── Style:  stroke-dasharray="4 3", non-scaling-stroke          │
│        └── Events: pointer-events="none"                               │
│                                                                        │
│  [✓] No hit targets   [✓] No mutation   [✓] No collision semantics     │
└────────────────────────────────────────────────────────────────────────┘
```

* **Document Boundary:** Preserves strict separation between `LayoutDocument` / `SceneDocument` (which own physical object data and canonical projections) and the camera tour document (which owns path topology and camera nodes).
* **Spatial Reference Only:** Footprints communicate projected floor presence without imposing 2D collision constraints on a path that operates in full 3D.

---

## 3. Final Engineering Implementation Checklist

- [ ] **Token Aliases:** Define `--editor-camera-footprint-stroke` / `--editor-camera-footprint-fill` as aliases of the shared passive footprint presentation (outline ink + neutral tint).
- [ ] **Footprint Layer:** Camera Plan renders passive footprints of all eligible objects on the shared 2D plan's existing footprint layer — above architecture, below the camera graph. No new rendering layer is built.
- [ ] **Pointer Isolation:** Footprints are fully inert (`pointer-events: none`); floor hit-testing for "Add Camera" operates across all valid floor polygons, including over footprints.
- [ ] **Stroke & Dash Contract:** Shared footprint language — `vector-effect="non-scaling-stroke"`, `stroke-dasharray="5 4"`, ~1.5px baseline (QA tune range 1px–1.5px, `4 3` dash alternative).
- [ ] **Canonical Source Ingestion:** Consume only pre-existing canonical 2D floor footprint data (catalogue assets, plan primitives, recognized layout objects, cluster members). Do not synthesize new projection geometries.
- [ ] **Plan-Primitive Unification:** Plan-authored primitives adopt the unified `--editor-camera-footprint-*` presentation on the Camera Plan surface only.
- [ ] **Graph Integrity:** Connections are drawn without direction chevrons/arrowheads (sequenced direction is implied by order); camera nodes show no frustum/FOV cone overlays (already enforced); labels keep the canvas-paper stroke halo.
- [ ] **Visual QA:** Complete density visual QA on toned canvas paper to finalize contrast and stroke weight balance.

**Ready for development.**