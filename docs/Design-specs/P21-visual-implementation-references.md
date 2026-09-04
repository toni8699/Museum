# Museum Editor — P21 Visual Implementation References

**Status:** normative visual implementation companion to [`Design-Plan(P21+).md`](./Design-Plan(P21+).md) — 2026-09-04.  
**Scope:** concrete P21 composition for the Project Shell, core Spatial workspaces, and Visitor Preview.  
**Visual registry:** [`../../Design-png/README.md`](../../Design-png/README.md).

This document closes one ambiguity in the P21 umbrella design: P21 is **not** complete when the old controls have merely been moved into two header rows. P21 must implement the two-row shell **and visually reconcile the existing Spatial editor into the registered P21 compositions**.

The parent design plan remains authoritative for shell/IA, routing, persistence presentation, Project Hub, first-run behavior, and Visitor Preview. Existing Scene/Camera workspace specifications remain authoritative for behavior and ownership. This companion establishes which PNGs implementation should use for broad visual composition.

---

## 1. Authority order

For P21 implementation, use this precedence:

```text
source + tests
→ architecture and workspace behavior specifications
→ Design-Plan(P21+).md                         shell / IA / routing
→ Design-specs.md                              tokens / typography / visual language
→ this companion + Design-png/P21/*           concrete composition
```

Rules:

1. **Behavior beats pixels.** A generated image cannot redefine selection, history, transforms, topology, Sequence, Timeline semantics, document ownership, or persistence behavior.
2. **P21 PNGs beat legacy chrome.** If an older Scene/Camera composition disagrees with the P21 set on Row 1/Row 2 placement, toolbar placement, panel framing, persistence chrome, current terminology, or broad workspace composition, the P21 composition wins.
3. **Minor generated-image artifacts are non-authoritative.** Incidental orientation-widget differences, omitted graph/sidebar rows, placeholder metadata, decorative controls, or text-generation mistakes do not override source/specs.
4. **Legacy images remain valid for specialized states** when the P21 primary set does not replace that state; their old shell/chrome is ignored.

---

## 2. Primary P21 implementation compositions

Use these registered images as the implementation-facing visual targets:

| File | Surface/state | Visual implementation role |
|---|---|---|
| `Design-png/P21/scene-plan-layout.png` | Scene → Plan → Layout · empty/first-run | **Shell/chrome master.** Owns Row 1/Row 2 visual hierarchy, Plan surface treatment, panel proportions, first-run treatment, and status-bar density. |
| `Design-png/P21/scene-plan-arrange.png` | Scene → Plan → Arrange · selected Scene entity | Owns populated Arrange composition, owner-aware Plan Inspector treatment, passive architecture hierarchy, direct yaw affordance, and Arrange density. |
| `Design-png/P21/scene-3d.png` | Scene → 3D · selected Scene entity | Owns broad Scene 3D composition, hierarchy/Inspector density, dark viewport treatment, selected-object emphasis, and contextual Row 2 composition. |
| `Design-png/P21/camera-plan.png` | Camera → Plan · selected connection + expanded Timeline | Owns broad Camera Plan composition, Plan-vs-topology hierarchy, Camera sidebar density, connection Inspector layout, passive footprint presentation, and expanded Timeline placement. |
| `Design-png/P21/camera-3d.png` | Camera → 3D · selected camera + expanded Timeline | Owns broad Camera 3D composition, Camera sidebar, framing/path overlay density, Inspector composition, and shared expanded Timeline treatment. |
| `Design-png/P21/Preview.png` | Project-level Visitor Preview | Owns Preview's full-screen visual isolation: visitor runtime content, minimal editor-owned Preview/Exit chrome, and absence of authoring shell/gizmos/Timeline. |

The first five images must read as states of **one exact editor shell**. Workspace-specific content changes; the shared application frame does not drift.

---

## 3. What the P21 images govern

The P21 primary set is normative for:

- broad Row 1 / Row 2 visual composition;
- control density and restrained segmented-control treatment;
- left/right panel framing and approximate proportions;
- Plan vs. 3D surface identity;
- visual hierarchy between chrome, authoring surface, selection, and status;
- contextual-tool placement in Row 2 rather than permanent floating viewport toolbars;
- Scene Plan Layout / Arrange visual differentiation;
- Camera Plan / Camera 3D relationship to the persistent Camera Timeline;
- Visitor Preview's removal of normal editor chrome;
- the general professional dark-navy DCC/CAD visual direction.

P21 implementation should therefore compare the resulting UI against the registered compositions during visual QA, not only against the textual shell dimensions.

---

## 4. What the P21 images do not govern

The PNGs do **not** independently define:

- `LayoutDocument` / `SceneDocument` ownership;
- room-local transform semantics;
- selection or history behavior;
- exact keyboard shortcuts;
- camera graph topology;
- Sequence ordering or mutation rules;
- per-direction connection timing semantics;
- Camera Preview scopes or transport rules;
- Timeline projection semantics;
- asset persistence/storage behavior;
- Visitor runtime architecture;
- orientation-widget behavior already governed by dedicated specs/current implementation.

Examples:

```text
Camera connection rendered ambiguously in a PNG
→ source + Camera specs still require undirected topology / zero topology arrows

Camera sidebar omits a valid connection in a generated image
→ source/model/sidebar spec still governs the actual graph

Orientation cube differs slightly from the shipped widget
→ existing orientation behavior/render contract wins
```

---

## 5. Strict P21 vs. future visual direction

Strict P21 exposes `Spatial` only in project navigation until future project surfaces are built.

Future references live under `Design-png/Future/`:

- `project-hub-cover-enabled.png`
- `experience-3d-concept.png`
- `assets-concept.png`
- `publish-concept.png`

Those images are deliberate visual/product North-Star references. Their overall surface identity and polish are useful direction, but their internal feature details remain illustrative unless separately ratified.

In particular:

- Experience must continue to reference Spatial geometry/camera truth rather than create a second motion system.
- Assets must remain one user-facing asset system; source is metadata/filtering rather than competing stores.
- Publish remains a project-level supporting surface with one clear release destination/action hierarchy.
- The cover-enabled Hub is a future visual target; the P21 baseline may omit the visual cover shelf until the cover pipeline exists.

---

## 6. P21 completion criterion

For design purposes, P21 is visually complete only when all of the following are true:

```text
two-row Project Shell implemented
+
existing Spatial controls re-hosted into the correct row
+
permanent floating workspace toolbars removed/reconciled
+
Scene Plan Layout matches the P21 shell/chrome master direction
+
Scene Plan Arrange matches the owner-aware populated direction
+
Scene 3D matches the registered composition/density
+
Camera Plan and Camera 3D share the canonical Camera sidebar/Timeline relationship
+
Visitor Preview has clean visitor-only takeover presentation
```

This is a **visual/compositional completion rule**, not permission to change any governing behavior contract while matching the screenshots.
