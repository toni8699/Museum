# P10 — Plan Arrange Objects (post-P2 redesign)

**Date:** 2026-08-23
**Status:** Shipped 2026-08-24 — P10.0–P10.5 complete; direction and
architecture approved by browser review 2026-08-23. P10.1–P10.3 landed and
were review-fixed 2026-08-23; P10.4/P10.5 closed on the P3 visual baseline.
**Tracker:** [`docs/plans/README.md`](../../plans/README.md) — **P10**, depends on: P2 + P9; coordinate with P3 visual reconciliation.

**Close note (2026-08-24):** P10.4 reconciled Layout-object and Scene-entity
passive/hover/selected states onto one blue selection language, added the
owner-aware hover outline and rotation feedback, and preserved muted read-only
architecture. P10.5 passed the full owner-routing, transform/history, cancel,
selection-memory, render-boundary, and visitor-isolation suite through the P3
full gate: 2,069 passed / 1 skipped, `svelte-check` 0/0, build clean, and
sidebar Browser smoke QA clean. No cross-document gesture or second selection,
history, transform, navigation, or geometry system was introduced.

## Decision requested

P2 shipped Scene Plan staging for eligible `SceneDocument.entities`. It also
made a product boundary visible to users: boxes/cylinders created in Layout
are `LayoutDocument.objects`, so they become inert when Staging is selected.
That boundary is architecturally sound but unintuitive when both kinds of
objects look like movable Plan objects.

This draft proposes a narrow owner-aware **Arrange** surface:

```text
Layout  = build space + create rough layout objects
Arrange = arrange movable objects already in the space
          (layout objects + eligible Scene entities)
```

The documents remain separate. The user should not need to understand that
storage distinction in order to move an object.

> **Arrange unifies object manipulation, not object ownership.**

## Outcome

- Scene Plan exposes one clear object-arrangement intent under the user-facing
  label `Arrange`. The internal `staging` identifier may remain temporarily as
  a compatibility detail.
- Rooms, walls, openings, and architectural dimensions remain Layout-only.
- `LayoutDocument.objects` and eligible `SceneDocument.entities` are both
  selectable targets in Arrange.
- A selected target routes to its existing owner-specific transform, Inspector,
  delete, and history pipeline.
- One gesture mutates one document and creates one correctly tagged history
  entry (`layout` or `scene`).
- No cross-document multi-selection or cross-document gesture is introduced in
  v1.

## Explicit P2 amendment

P2 currently defines Staging selection authority as Scene-only and makes layout
objects inert there. This redesign intentionally changes that product rule for
object-like targets only. It does **not** change P2's room-aware Scene transform
math, Y/pitch/roll preservation, 15° rotation snap, cancellation, history, or
visitor boundaries.

The amendment must be approved before implementation and folded into the
canonical-doc amendment surface below.

## Canonical-doc amendment surface (P10.0)

The shipped P2 and shell contracts encode more old assumptions than a bare
"Staging becomes Arrange" note. P10.0 folds the amendment into at least:

- **`Design-specs/Shell-scene-workspaces.md`** — §6 (Scene → Plan purpose and
  `Layout | Staging` local mode; Staging's "edits Scene entities, writes only
  `SceneDocument`" authority; architecture-stays-read-only contract), §29
  (footprint rendering states — add an Arrange Layout-object presentation
  state beside the staging states), §30 (Scene selection continuity — Staging
  → Layout rule must coexist with an active Layout-object target).
- **`Design-specs/Design-shell-specs.md`** — §1 (canonical workspace model:
  `Layout | Staging` under Scene → Plan becomes `Layout | Arrange`), §16
  (toolbar ownership matrix rows for Arrange), §19 (workspace state
  persistence: preserve the Arrange local mode and both selection slots),
  §21 (view-switch behavior), §22 (capability/visibility matrix rows), §23
  (non-leakage rules — specifically the rule that "a staging gesture
  committing a layout history entry" is a codebase violation becomes **false**
  for an Arrange Layout-object target and must be re-scoped to "a cross-owner
  gesture"), §24 M–Q (codebase review targets: mode authority, hit-test
  authority, footprint states, selection continuity, mutation/history
  tagging), §25 (shell state model), §26 (shell acceptance criteria), §28
  (selection authority — "Staging selection authority: `SceneDocument`" gains
  an Arrange Layout-object authority case), §31 (mode persistence).
- **`Design-specs/Design-specs.md`** — §3 (Plan rendering: shared Plan render
  model now carries both Scene footprints and Layout object candidates), §22
  (contextual viewport toolbar: `Layout | Staging` → `Layout | Arrange`), §29
  (selection hierarchy: add the owner-aware selected-target contract), plus
  every remaining `Layout | Staging` terminology reference.
- **`components/placement.md`** — the Scene Plan staging (P2) contract and the
  Layout objects contract both gain Arrange wording; room-ownership semantics
  are referenced verbatim, not redefined.
- **`north-star.md`** — product language only: "Plan = layout CAD plus Scene
  Plan staging for already-placed floor objects" becomes a general
  "layout CAD plus Arrange for already-placed movable objects". Ownership
  language stays unchanged.
- **P2 archive note** (`docs/archive/plans/2026-08-18-P2-plan-staging.md`),
  the **tracker** dependency language, and the **selection and history
  acceptance tests**.

**`docs/architecture.md` needs no semantic change.** Its ownership table
already assigns rough objects to `project.layout.objects` and scene content to
`project.scene`, and its hard don't — "infer room ownership/adjacency from
coordinates" — is exactly the boundary the Arrange ownership rule below keeps.

## Target interaction contract

### Derived owner routing, not a third selection system

Arrange must extend the shipped remembered Layout and Scene selection slots. It
must not add a canonical `ArrangeSelection`, and it must not copy selected ids
into any Arrange-owned structure. The existing `deriveActiveSelection` /
`EditorActiveSelectionStore` model (three parallel slots — layout / scene /
camera — mapped to exactly one active domain) is the pattern P10 extends:
Arrange adds session **routing** state only, and the actual selected ids live
in the existing Layout and Scene slots exclusively.

Two distinct concepts, kept apart:

```ts
// one pointer candidate — never a selection
type ArrangeHitTarget =
  | { owner: 'layout-object'; id: LayoutObjectId }
  | { owner: 'scene'; id: SceneEntityId };

// session routing state — which owner's slot is the active Arrange target
type ArrangeOwner = 'layout-object' | 'scene' | null;
```

Clicking a Layout object writes canonical Layout selection; clicking a Scene
entity writes canonical Scene selection. `ArrangeHitTarget` is a per-pointer
candidate, resolved fresh on each pointer event; `ArrangeOwner` is the
session-routing authority. Switching owner preserves the inactive selection
slot. Structural Layout targets (rooms/walls/openings) remain read-only
context.

### Selection

- Plain click replaces the active Arrange target.
- Scene-only multi-selection keeps the shipped P2 semantics where practical.
- Layout-object multi-selection is deferred unless the existing Layout
  selection/transaction model can support it without a second group-transform
  system.
- Cross-owner modifier-click switches owner and replaces the active selection
  with the clicked target. It never adds across owners or creates one gesture
  spanning both documents.
- Switching owner preserves the inactive selection slot as memory, matching the
  existing Scene/Layout continuity model.
- **Arrange remembers its last active owner for the session — never an object
  identity.** On entry to Arrange:
  - last owner = `layout-object` and the current canonical Layout selection is
    an eligible Layout object → that object activates.
  - last owner = `layout-object` but the current Layout selection is
    ineligible (room/wall/opening) or stale/missing → **no active Arrange
    target**.
  - last owner = `scene` and the current Scene selection is eligible → that
    selection activates (multi-selection intact).
  - last owner = `scene` but the Scene selection is empty or ineligible (e.g.
    a light) → **no active Arrange target**.
  - Arrange never silently falls back to the other owner and never resurrects
    an older object that left the canonical slot.

```text
Arrange
select Layout Box B

→ Layout mode
select Wall W          (canonical Layout selection = Wall W; B left the slot)

→ Arrange
last owner = layout-object, Layout selection = wall (ineligible)
→ no active Arrange target
B is not resurrected
```

```text
Scene 3D
select Light

→ Arrange
last owner = scene, Scene selection = light (ineligible)
→ no active Arrange target
```

This preserves "no third selection system" strictly: beyond the last-owner
routing value, Arrange holds no object identity.

### Hit testing and presentation

- Arrange composes existing Layout Plan render identities with shipped P2 Scene
  footprints into hit candidates. It does not create another projection model
  or duplicate spatial truth.
- Hit priority is pinned as: containment before edge halo; a currently selected
  target still under the pointer wins; otherwise visual topmost wins; stable
  document/render order breaks same-owner ties.
- **"Selected target wins" means any member of the active owner selection whose
  footprint contains the pointer**, resolved by the normal same-owner stable
  order — not just the primary member. This keeps Scene multi-select
  unambiguous.
- Scene footprints normally win an unselected cross-owner overlap because the
  shipped layer model renders Scene above Layout. The hierarchy remains the
  escape hatch for selecting a buried object.
- Selected target presentation and handles are owner-aware; architecture walls
  and room bodies remain passive.
- Empty Arrange state explains that objects can be created in Layout or placed
  in Scene 3D, rather than presenting a dead hierarchy.

### Mutation routing

```text
layout target → existing Layout transaction + updateLayoutObjectFields/deleteLayoutObject
scene target  → existing Scene document transaction + P2 transform/delete mutators
```

Layout object position/yaw route through the existing Layout transform
pipeline (see source verification below). Its dimensions, shape/type, and
elevation remain read-only in Arrange and editable only under existing Layout
semantics. Scene target edits preserve P2's room-local X/Z/yaw authority and
3D-only Y/pitch/roll state. No new geometry compiler or second gizmo system is
allowed.

#### Room ownership (pinned decision)

**Arrange uses the existing Layout-object relocation semantics verbatim,
including room ownership.** Dragging a Layout object across a room boundary
preserves its `roomId`; P10 does not infer or reassign ownership from
coordinates — consistent with architecture.md's "never infer room
ownership/adjacency from coordinates" hard don't. Reassignment remains
available only through existing Layout semantics (the Inspector room field),
never through Arrange geometry. Scene entities are unaffected: their room-local
transforms already follow the room frame.

### Inspector and hierarchy

Use one Inspector shell with owner-specific fields:

- Layout object: editable Plan X/Z/yaw; dimensions, room ownership, shape/type,
  and elevation are shown read-only where useful.
- Scene entity: P2 Plan X/Z/yaw plus preserved elevation/3D-only state.

The unified hierarchy keeps one tree. In Arrange, Scene entity rows and Layout
object rows become interactive; rooms/walls/openings stay visibly read-only.
Owner badges or a short target subtitle may explain the difference without
exposing document names as the primary UX.

## Source verification (2026-08-23)

Answers to the pre-implementation code questions (review pin 4 + ownership),
from `layout-object-editing.ts`, `LayoutPlanViewport.svelte`,
`layout-interaction.ts`, `layout-preview-state.svelte.ts`,
`EditorInspector.svelte`, and the gizmo adapters:

1. **Can one LayoutObject already rotate independently in Plan?** Not as a
   Plan viewport gesture — the Plan object interaction is translate-only
   (`LayoutObjectDrag`: `candidatePosition` preview, no rotation), and the
   Plan rotation handle is whole-room (room-unit) only. Standalone object
   rotation already exists **numerically in the Inspector** (`updateObjectVector('rotation')`
   → `updateLayoutObjectFields` → `patchLayoutObject`, one `layout`
   transaction) and **gesturally in 3D** via the layout gizmo adapter
   (`layout-gizmo-target.ts` object descriptor: translate world, rotate/scale
   local; `layout-gizmo-candidate.ts` applies relative rotation deltas onto
   the baseline; one `layout` history entry; cancel restores).
2. **Does the existing mutation API accept absolute/relative yaw?** Yes.
   `updateLayoutObjectFields` / `patchLayoutObject` accept an absolute
   `rotation` Vec3 (Y = yaw); the 3D gizmo candidate applies relative deltas
   (`wrapAngle` onto baseline). `profile` objects are rejected as read-only.
3. **Does it already preview/cancel through one layout transaction?** Yes for
   every existing path: Inspector via `runLayoutMutation` (begin → mutate →
   commit/cancel); 3D gizmo via the live-candidate bundle; Plan translate drag
   via `onLayoutTransactionBegin` + snapshot restore + commit/cancel.

**Conclusion:** the Layout pipeline fully supports object yaw authoring today.
P10.3's only genuinely new surface is the **Plan viewport rotate gesture for a
standalone Layout object** — a bounded extension of the existing
object-drag pipeline (extend `LayoutObjectDrag` with a rotation candidate and a
Plan rotate handle, or add a sibling rotation-drag state), reusing
`updateLayoutObjectFields`/`patchLayoutObject` and the layout transaction
facade. It is routing plus one gesture, not a second rotation system. This
slightly raises P10.3's scope over a pure routing slice; product direction is
unchanged.

## Proposed increments

| ID | Content | Depends |
|---|---|---|
| **P10.0** | Lock the `Layout \| Arrange` product model, eligible Layout-object kinds, cross-owner replacement semantics, last-owner (never identity) memory, overlap ordering, dimension-edit boundary, room-ownership-verbatim rule, Plan yaw-gesture scope, and the canonical-doc amendment surface (shell/specs/placement/north-star/P2 archive/tracker/tests); owner approval + doc amendments | P2 + P9 |
| **P10.1** | Add an owner-aware Arrange target resolver over existing Layout Plan render identities and shipped P2 Scene footprints; add pure cross-owner overlap/hit tests including the "any selected member under the pointer wins" rule | P10.0 |
| **P10.2** | Route viewport and unified hierarchy into existing Layout/Scene selection slots; derive the active Arrange owner; preserve inactive selection and last-owner memory; stale/ineligible entry → no active target; add empty-state copy | P10.1 |
| **P10.3** | Route X/Z/yaw, delete, cancel/no-op, and history through existing owner-specific mutators and transactions; reuse shipped Scene P2 behavior unchanged; add the bounded Plan layout-object yaw gesture (rotation candidate + handle) through the existing Layout pipeline | P10.2 |
| **P10.4** | Reconcile passive, hover, selected, and owner-specific handle visuals with P3 tokens | P10.3 + P3 visual baseline |
| **P10.5** | Regression suite, manual interaction matrix, docs close-out, and tracker/archive update | P10.3–P10.4 |

## Non-goals

- Migrating Layout objects into `SceneDocument`.
- Making rooms, walls, openings, cameras, or lights Arrange targets.
- Cross-document group transforms or atomic multi-document history.
- New Plan asset placement, imported-GLB footprints, or light footprints.
- P10-specific room reparenting (ownership follows existing Layout semantics).
- Changes to `/museum`, `/museum/editor`, visitor chunks, or the camera graph.
- A second navigation, motion, geometry, or transform-controls system.

## Verification matrix

- Layout object is selectable, draggable, rotatable where its existing policy
  permits, inspectable, deletable, and undoable in Arrange.
- Scene entity retains P2 drag/rotate/delete behavior and one `scene` entry.
- Layout target creates only one `layout` entry; Scene target creates only one
  `scene` entry.
- Cancelling either owner restores its baseline and creates no history entry.
- Clicking a wall/room/opening in Arrange never activates Layout mutation.
- Cross-owner modifier selection never creates a mixed-document gesture.
- Overlapping Layout/Scene targets have deterministic, tested winner rules;
  Scene multi-select with several members under the pointer resolves by
  same-owner stable order.
- Plan ↔ 3D and Layout/Arrange transitions preserve inactive selection memory.
- Arrange selection-memory sequence is pinned: select Scene A; select Layout B;
  select Scene C; switch to Layout and B is active; return to Arrange and Scene
  C is active because Arrange restores its last active owner.
- **Stale/ineligible entry is pinned (both owners):** Arrange with last owner
  = layout-object but a wall/room/stale Layout selection → no active target,
  no Scene fallback, no resurrected older object. Arrange with last owner =
  scene but an empty/ineligible (e.g. light) Scene selection → no active
  target.
- **Ownership preservation is pinned:** dragging a Layout object across a room
  boundary in Arrange keeps its `roomId` unchanged; no P10 reparenting.
- **Plan yaw gesture is pinned:** standalone Layout-object rotate in Arrange
  previews through the Layout pipeline, cancels restore the baseline, commits
  one `layout` entry, and matches the existing 15° Shift snap convention.
- Layout dimensions, shape/type, and elevation cannot be mutated in Arrange.
- `/museum` visitor build remains free of editor/Layout imports.
- `npm test`, `npm run check`, `npm run build`, and `git diff --check` remain
  green.

## Effort and risk

This is **medium effort / medium product risk**, not a schema migration. The
reviewer estimates roughly **1.5–2× the shipped P2.2/P2.3 interaction work**.
The largest costs are owner-aware hit/selection routing, Inspector branching,
the bounded Plan yaw gesture, and ensuring each owner retains atomic history.
The safest fallback is to keep P2's Scene-only Staging and add explicit
labels/empty-state copy; do not land a partial mixed-document mutation path.

## Source anchors

- `apps/museum/src/lib/editor/layout/LayoutPlanViewport.svelte`
- `apps/museum/src/lib/editor/layout/plan-scene-footprint.ts`
- `apps/museum/src/lib/editor/layout/plan-scene-hit.ts`
- `apps/museum/src/lib/editor/layout/layout-object-editing.ts`
- `apps/museum/src/lib/editor/layout/layout-preview-state.svelte.ts`
- `apps/museum/src/lib/editor/layout/layout-interaction.ts`
- `apps/museum/src/lib/editor/gizmo/layout-gizmo-target.ts`
- `apps/museum/src/lib/editor/gizmo/layout-gizmo-adapter.svelte.ts`
- `apps/museum/src/lib/editor/app/active-editor-selection.svelte.ts`
- `apps/museum/src/lib/editor/UnifiedProjectTree.svelte`
- `apps/museum/src/lib/editor/EditorInspector.svelte`
- `apps/museum/src/lib/editor/layout/layout-mutation-runner.ts`
