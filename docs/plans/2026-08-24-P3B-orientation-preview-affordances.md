# P3B — Orientation Box, Plan Parity, and Camera Preview Affordances

**Date:** 2026-08-24
**Status:** In progress — standalone follow-up after P3 close
**Tracker:** `docs/plans/README.md` — **P3B**, depends on P3 + P8 S2–S4
**Historical source:** `P3 umbrella` — extracted P3.4/P3.5 and P3B scope

---

## Purpose and current shell contract

P3B completes the remaining interaction and visual-parity work around the accepted P3 baseline for the current product shell:

```text
Scene | Camera
Plan  | 3D
```

These are two explicit shell axes producing four intentional views inside one persistent editor shell.

```text
Scene → Plan
Scene → 3D
Camera → Plan
Camera → 3D
```

Scene Plan additionally owns the local:

```text
Layout | Arrange
```

mode.

Current implementation names such as `CameraPlanViewport`, `CameraPlanInspector`, and Scene 3D viewport components are valid locations for this work.

P3B does not:

* create additional workspaces;
* duplicate shell state;
* alter the domain/view model;
* add a second navigation system;
* add a second camera-motion system;
* add another selection store;
* add another Plan coordinate model.

P3B is editor-only.

```text
/ and /editor             active editor lane
/museum                   frozen visitor relic
/museum/editor            frozen legacy editor relic
```

---

# Outcome

P3B executes as sequential groups.

Complete the current group before starting the next.

```text
Group A → Group B → Group C → Core QA → Deferred tail
```

P3B delivers:

1. **Group A — Plan-surface parity**

   * reconcile Scene Plan and Camera Plan presentation;
   * preserve their existing Plan math and authority.

2. **Group B — Scene 3D orientation utility**

   * ship the custom Scene 3D XYZ orientation widget;
   * derive its visual orientation from the active Scene 3D camera;
   * provide cardinal view snapping without introducing another camera authority.

3. **Group C — Camera preview affordances**

   * make selection, preview scope, transport, sequence preview, and edge direction explicit across Camera Plan, Camera 3D, Inspector, Sidebar, and Timeline.

4. **Deferred P3.4/P3.5 tail**

   * revisit existing context-menu adapters after broader testing;
   * do not block core P3B shipment.

P3B reuses the existing:

```text
EditorStore
preview FSM
camera-route.ts
camera-motion.ts
selection actions
timeline identities
Plan transforms
Plan hit resolvers
OrbitControls / editor camera infrastructure
```

---

# Cross-cutting invariants

* One editor shell with `Scene | Camera` over `Plan | 3D`.
* One 3D canvas.
* One canonical selection model per domain.
* One Camera timeline owned by Camera domain.
* Camera timeline state survives Camera Plan ↔ Camera 3D.
* One camera route authority: `camera-route.ts`.
* One camera motion authority: `camera-motion.ts`.
* Scene 3D orientation snapping is viewport presentation, not Camera-domain authoring.
* Plan remains SVG top-down world X/Z projection:

```text
screen X ← world X
screen Y ← world Z
world Y  ← vertical height
```

* Camera Plan connections remain undirected.
* Direction appears only in explicit preview/playback actions.
* Selection never starts playback.
* Selection never changes preview scope.
* Selection never resets the playhead.
* Selection never replaces an active preview.
* Selection and preview scope remain independent.
* Preview actions use Play/CirclePlay semantics.
* Eye remains visibility/view semantics.
* No document/history mutation from the orientation widget.
* All work stays editor-only and preserves relic isolation.

---


# Shipped groups (archived)

Group A — Plan-surface parity (P3B.4a → P3B.4b) and Group B — Scene 3D
orientation utility (P3B.1–P3B.4) shipped 2026-08-24/25. Their full contracts,
acceptance lists, and Group A/B definition-of-done sections are archived →
`archive/plans/2026-08-24-P3B-groups-a-b-shipped.md`.

---

# Group C — Camera Preview Affordance Reconciliation

## P3B.5 → P3B.6

Canonical interaction grammar:

```text
Click
→ select

Preview action
→ change preview scope

Play / Pause
→ control current preview
```

Normal selection never:

```text
starts playback
changes preview scope
resets playhead
replaces active preview
```

Selection and preview remain independent.

---

## Node preview

Sequenced and unsequenced nodes use identical action:

```text
Preview Camera
```

Example scope label:

```text
Preview: Camera · Central Hall
```

A camera pose does not require Sequence membership to preview.

---

## Sequence preview

Sequence preview belongs to:

```text
Sequence Inspector
and/or
Camera Timeline
```

not individual topology edges.

Example:

```text
Preview: Sequence · Main Visitor Tour
```

Full-sequence playback follows explicit Sequence order and existing graph adjacency.

---

## Edge preview

Topology remains undirected.

### Sequence-adjacent connection

Expose one direct labeled preview action.

Direction derives only from:

```text
sequence predecessor
→ immediate sequence successor
```

Never derive direction from:

```text
endpoint storage order
timing key order
selection
pointer side
name sorting
```

### Non-sequence-adjacent / unsequenced connection

Expose:

```text
Preview Edge
```

Then compact explicit direction choice:

```text
Camera A → Camera B
Camera B → Camera A
```

This is direction selection for one undirected topology edge.

It is not a second topology model.

Existing `Reverse` may remain transport behavior after edge preview begins.

Example active label:

```text
Preview: Edge · Camera A → Camera B
```

### Unsequenced-edge selection parity (P3B.6)

**Requested 2026-08-25.** Edge preview for unsequenced connections requires
that the unsequenced edge is actually selectable and visibly responds in
Camera Plan.

Current state: an edge between two unsequenced nodes is a **retained
(inactive) connection** (S10.1.3). It renders desaturated/dashed, and although
the hit-test and click handler do select it in the store, the retained
presentation wins over selection in three places, so the edge gives zero
visual feedback and reads as "not clickable":

```text
plan-render-model.ts   retained style beats selected style
camera-plan-hover.ts   retained edges never get the hover token
PlanSvg.svelte         .camera-edge.retained declared after .selected
```

P3B.6 must make unsequenced-edge selection visually truthful:

* clicking a retained edge shows selection (backdrop click still deselects);
* hover on a retained edge shows the hover cue;
* selection/hover overlay the retained base without collapsing it into the
  active-edge look — the desaturated/dashed base remains distinguishable
  until selected (e.g. a `camera-edge-retained-selected` token or equivalent
  token precedence fix);
* the retained context menu (timing / reverse / delete) stays available;
* retained-connection semantics (S10.1.3) are unchanged — a retained
  connection stays inactive unless the user sequences its nodes.

This is interaction/parity work inside Group C, not a change to retained-connection
semantics (S10.1.3).

---

## Camera Plan / Camera 3D parity

Camera Plan and Camera 3D reuse same Camera preview commands.

Camera 3D does not receive a second preview engine.

Camera Plan does not receive framing controls merely because preview can enter 3D.

Previewing from Camera Plan may switch representation to Camera 3D while preserving canonical Camera selection.

---

# Core QA

## P3B.7a — Focused regression

Verify:

### Plan

* Scene Plan and Camera Plan parity;
* X/Z ruler semantics;
* no Plan transform regression;
* corner key remains presentation-only.

### Orientation widget

* Scene 3D only;
* correct six cardinal face identities;
* design-reference oblique pose renders TOP + FRONT + RIGHT;
* editor neutral camera constants remain unchanged;
* dynamic camera-derived projection without cardinal snap;
* ordinary OrbitControls drag publishes new quaternion/projection snapshot;
* DOM overlay changes without cardinal snap;
* projected cube geometry derives from immutable per-frame snapshots;
* pure projection fixtures pin cube vertices, face ordering, axis anchors, shading, and SVG coordinates;
* material-change thresholds compare against the last published snapshot;
* slow sub-threshold orbit eventually publishes accumulated movement;
* only front-facing cube faces are painted;
* all six cardinal faces pointer/keyboard reachable (visible polygon + opposite-face proxy);
* near-edge visible face switches to proxy hit geometry below 14px and returns above 16px;
* hidden proxy never wins over overlapping painted geometry;
* hidden proxy exposes mandatory hover/focus cue and pointer cursor;
* light neutral face palette and dark edge/label treatment;
* Z/X/Y axes truthful projections at arbitrary camera orientations;
* 88 × 88 CSS px outer box; SVG 88 × 88 with viewBox 0 0 88 88; neither CSS padding nor border rescales SVG;
* retired `--editor-orientation-padding` has no source or registry references;
* cube/axes occupy intended geometry budget;
* face-label edge-on fade contract;
* bidirectional axis foreshortening reticle contract;
* hover/pressed/active/focus/disabled tokens locally registered;
* generic oblique orientation has no active face;
* active state appears only within 0.999 dot threshold;
* pointer threshold: ≤ threshold activates, > threshold cancels;
* cancelled gesture does not leak to OrbitControls;
* SVG root has no `role="img"`; interactive descendants remain exposed to assistive technology;
* preview-disabled targets expose `aria-disabled`, leave Tab order, and remain guarded no-ops;
* shell hover remains navy token;
* face hover uses white 14% overlay token;
* back-face culling;
* edge-on label fade;
* no selection mutation;
* no history;
* no document write;
* reduced-motion direct snap;
* invalid basis atomic no-op.

### Camera preview

* click selects only;
* Preview Camera changes node-preview scope;
* Preview Sequence changes sequence-preview scope;
* sequence edge direction derives from Sequence adjacency;
* unsequenced edge requires explicit direction choice;
* topology remains visually undirected;
* Reverse remains transport behavior only;
* unsequenced (retained) edge click selects, hover cues, and backdrop click
  deselects, with the retained base presentation preserved.

---

## P3B.7b — Deferred P3.4/P3.5 acceptance tail

Existing context-menu adapters remain low-priority/deferred.

After core P3B:

* retest;
* accept if stable;
* fix only if touched code regressed them;
* report independently from core P3B.

They do not block core shipment.

---

## P3B.8 — Browser QA

Verify all four canonical views:

```text
Scene Plan
Scene 3D
Camera Plan
Camera 3D
```

Check:

* shell continuity;
* Scene/Camera isolation;
* timeline continuity;
* selection preservation;
* hover/focus behavior;
* high-DPI SVG rendering;
* orientation widget clipping;
* reduced motion;
* keyboard activation;
* pointer isolation;
* Camera preview transport;
* no relic-route regression.

---

# Sequential Execution Order

```text
1. Group A
   P3B.4a
   P3B.4b

2. Group B
   P3B.1
   P3B.2
   P3B.3
   P3B.4

3. Group C
   P3B.5
   P3B.6

4. Core QA
   P3B.7a
   P3B.8

5. Deferred tail
   P3B.7b
```

The OrbitControls polar handoff was resolved by fixture on 2026-08-24 (see
P3B.4 Status); Group B proceeds without a stop gate.

---

# Definition of Done

## Group C

* Selection and preview scope remain independent.
* Node preview semantics identical for sequenced and unsequenced cameras.
* Sequence preview belongs to Sequence/timeline surface.
* Edge-preview direction explicit and deterministic.
* Camera topology remains undirected.
* Unsequenced (retained) edges are selectable in Camera Plan and show
  selection/hover feedback without losing their retained base presentation.

## Core

* Focused tests pass.
* Browser QA passes.
* No second graph, motion, timeline, selection, coordinate, framing, or persistence system introduced.

## Deferred tail

* P3.4/P3.5 context-menu acceptance reported separately.
* Deferred status does not block core P3B shipment.
