# Museum Editor: Unified Product Shell & Information Architecture
### Canonical Design Plan (P21+ Baseline)

**Status:** P21+ target authority — reconciles the ratified shell direction with
current implementation status (2026-09-03). This document states the **target**;
it does not claim the two-row shell is implemented today. The current tree
remains the pre-P21 stacked Project Shell scaffold + `EditorAppBar`.

---

## Authority & Supersession

For P21+ product-shell concerns this document is the canonical target authority:

```text
Design-Plan(P21+).md
→ canonical target authority for:
   - /
   - /projects
   - Project Shell
   - Row 1 / Row 2 chrome placement
   - Spatial control placement
   - persistence/account presentation
   - project-level Visitor Preview
   - future Experience / Assets / Publish placement

Existing workspace specs
→ remain authoritative for:
   - Scene / Camera behavior
   - Plan / 3D capabilities
   - Layout / Arrange behavior
   - selection
   - history semantics
   - camera topology / Sequence
   - Timeline behavior
   - Inspector behavior
   - direct manipulation
   - document ownership

Design-specs.md
→ remains authoritative for visual language/tokens except where
  Design-Plan(P21+) explicitly supersedes shell dimensions or placement.
```

> Where older shell documents describe a single 56px editor header or permanent
> floating viewport toolbars, the P21+ two-row shell supersedes those placement
> rules. The underlying workspace capabilities remain unchanged.

> Wireframes for Experience, Assets and Publish are shell-composition
> illustrations only. Their internal product models are not ratified by this
> document.

Where a status column says **Wired**, the underlying control already exists
today in the pre-P21 shell (Project Shell scaffold / `EditorAppBar`) and would
be re-hosted into the P21+ rows; **P21 Target** means the P21+ implementation
adds or relocates it. Nothing here implies the old behavior has already been
implemented away.

---

## A. Purpose and Scope

This document establishes the ratified Information Architecture (IA), persistent application shell, project hub, persistence/account presentation, and workspace chrome for **Museum Editor**. It serves as the single design authority for P21 and subsequent implementation phases.

### What This Plan Governs
1. **Public Entry & Launch Flow:** Route behavior and session detection at `/`.
2. **Project Hub:** Structure, listing, and session states at `/projects`.
3. **Project Shell:** The compact two-level application frame at `/project/:id`.
4. **Spatial Chrome Integration:** Canonical placement of Spatial authoring axes, sub-modes, and contextual tools.
5. **Persistence & Account Presentation:** Decoupling storage location from sync/dirty state.
6. **First-Run Experience:** Non-modal, zero-bloat onboarding for empty projects.
7. **Visitor Preview:** Project-level visitor simulation takeover (`/project/:id/preview`) executing on a transient snapshot.
8. **Future Project Surfaces:** Canonical IA placement and shell relationships for `Experience`, `Assets`, and `Publish`.

### What This Plan Explicitly Does Not Redefine
* **Spatial Document Boundaries:** The separation of `LayoutDocument` (architecture) and `SceneDocument` (entities/lighting) remains authoritative.
* **Canonical Spatial Axes:** `Domain (Scene | Camera)` × `View (Plan | 3D)` and Scene Plan `[Layout | Arrange]` are fixed.
* **Camera Graph & Sequence Semantics:** Undirected topological connections, directed sequence playback, and preview scopes (`Camera | Edge | Sequence`) are inviolable.
* **Visitor Engine Internals:** Three.js rendering pipelines, shader graphs, and runtime asset-caching strategies.
* **Internal Features of Deferred Workspaces:** Internal interaction models, staging trees, storage quotas, and deployment pipelines for `Experience`, `Assets`, and `Publish` are illustrative only and will receive dedicated specifications prior to implementation.

---

## B. Canonical Information Architecture

```text
/                                    (Public Entry & Launch)
└── /projects                        (Project Hub)
└── /project/:id                     (Project Shell Frame)
    ├── /spatial                     (Spatial Workspace — Scene/Camera × Plan/3D)
    ├── /experience                  (Experience Workspace — Navigation/Content/Interactions) [Deferred]
    ├── /assets                      (Assets Workspace — Project Registry Management) [Deferred]
    ├── /publish                     (Publish Workspace — Release Management & Hosting) [Deferred]
    └── /preview                     (Visitor Preview Takeover — In-Memory Visitor Runtime)
```

### Conceptual Entity Hierarchy
```text
Project Shell Context (Identity · persistence tier · workspace routing · history controls · session)
 ├── Spatial Workspace (World authoring & staging)
 │    ├── Scene Domain
 │    │    ├── Plan View → [Layout Mode | Arrange Mode]
 │    │    └── 3D View
 │    └── Camera Domain
 │         ├── Plan View (Topological graph, path anchors) [Mounts Timeline]
 │         └── 3D View (Framing, FOV, frustum authoring) [Mounts Timeline]
 ├── Experience Workspace (Visitor navigation, content cards, interaction triggers) [Deferred]
 ├── Assets Workspace (Project-level asset registry management) [Deferred]
 ├── Publish Workspace (Deployment, custom domains, embeds, releases) [Deferred]
 └── Visitor Preview (Full-project interactive visitor simulation)
```

> **Project-navigation hierarchy (North Star reconciliation).** Row 1 renders
> `Spatial | Experience | Assets | Publish` as one compact physical navigation
> group, but the four entries are **not** equivalent creative workspaces:

```text
Project
├─ Creative authoring
│  ├─ Spatial
│  └─ Experience
├─ Assets
└─ Publish
```

> Spatial and Experience are the two primary creative modes; Assets and
> Publish are project-level supporting surfaces. The UI may still visually
> present them in one compact navigation group. Routes stay exactly:
> `/project/:id/spatial` · `/project/:id/experience` · `/project/:id/assets`
> · `/project/:id/publish` · `/project/:id/preview`.

> **History Architecture Clarification:** Undo/Redo is an **editor/session
> capability**, not serialized document state. Row 1 owns the stable physical
> history-control slot:
>
> - **Spatial** — the controls bind to the existing chronological tagged
>   Scene/Layout history stack.
> - **Experience** — history semantics are deferred until Experience ownership
>   is designed.
> - **Assets** — registry/API operations do not enter Spatial editor history.
> - **Publish** — publishing/platform operations do not enter Spatial editor
>   history.
>
> Invariant: leaving Spatial must never allow a visible global Undo button to
> unexpectedly undo hidden Spatial work. Future non-Spatial surfaces therefore
> either bind the fixed slot to a deliberately compatible history model or
> disable/hide the actions while preserving the shell layout. Document history
> remains owned by client runtime stores and is never serialized into
> `ProjectDocument`.

---

## C. Persistent Shell Specification

The application shell uses a **Compact Two-Level Architecture (68px total height)**. This design provides physical stability: controls in Row 2 never change location or layout when future project surfaces are enabled in Row 1.

**Target shell dimensions — supersede the single-app-bar model:**

```text
Current pre-P21 implementation:
56px editor app bar + separate project scaffold

P21+ target:
36px Project Row
+ 32px Workspace Ribbon
= 68px total persistent top chrome

Status:
24px target
```

The runtime CSS variables `--editor-appbar-height` (56px) and
`--editor-status-height` (32px) still carry the pre-P21 values; P21
implementation must migrate them (Row 1 = 36px, Row 2 = 32px, status = 24px)
rather than altering code in this documentation pass.

```text
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ ROW 1: PROJECT SHELL (36px) — Global Project Context                                                   │
│ [← Hub] │ "Chopin Salon" ✎  [☁ Cloud] [● Saved] [···]  │ [Spatial | Experience | Assets | Publish] │ [↺ ↻] [▶ Preview] [Avatar] │
├────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ ROW 2: WORKSPACE RIBBON (32px) — Active Workspace Scope (Canonical Contextual Toolbar)                 │
│ [ Scene | Camera ] [ Plan | 3D ] │ Mode: [Layout | Arrange] │ [Rect Room] [Poly Room] [Opening] │ Snap: 0.25m │
└────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 1. Row 1: Project Shell (Height: 36px / 2.25rem)
Owns global identity, cloud persistence status, workspace navigation, global undo/redo, visitor preview, and user session.

| Position | Control | Component / Behavior | Status |
|---|---|---|---|
| **Far Left** | Hub Link | `← Projects` icon button (`28×28px`). Navigates to `/projects`. | Wired |
| **Left** | Project Name | Inline-editable text field (`13px font-weight: 600`, max 240px). Blur or `Enter` commits rename. | Wired |
| **Left** | Persistence Tier | Badge: `[Local Session]` (Guest/volatile) vs. `[☁ Cloud]` (Cloud-owned). | P21 Target |
| **Left** | Sync / Save Pill | State pill: `Saved ✓` / `[Save (⌘S)]` / `Saving... ⟳` / `[Save Blocked ⚠]`. | P21 Target |
| **Left** | Document Menu | `···` button: Whole-project actions (Export Package, Export JSON, Import, Reset). | Wired |
| **Center** | Project Navigation | Segmented nav: `[ Spatial \| Experience \| Assets \| Publish ]`. **P21 rule:** Only `Spatial` is exposed; remaining entries are unrendered until their respective project surfaces are built. | P21 Target |
| **Right** | Global History | `[ ↺ Undo ]` `[ ↻ Redo ]` icon button pair (`⌘Z` / `⌘⇧Z`). Operates on document-wide history stack. | Wired |
| **Right** | Visitor Preview | Secondary accent button: `▶ Preview` (`height: 28px`). Invokes Visitor Preview takeover. | P21 Target |
| **Far Right** | Account Profile | Guest: `Sign in` button. Authenticated: Google avatar circle (`24×24px`) with menu. | Wired |

**Row 1 persistence cluster semantics.** The two persistence elements report
different things:

```text
[Local Session / Cloud]
→ ProjectDocument persistence location

[Saved / Save / Saving / Save Blocked]
→ authored ProjectDocument snapshot state
```

The Row 1 save state reports the authored `ProjectDocument` baseline. It does
not mean every project-level remote operation is synchronized:

- Asset upload → project-registry persistence → separate operation/status
- Future Publish → deployment/release state → separate operation/status

A successfully uploaded R2 asset may already be durable while the current
`ProjectDocument` remains dirty. Do not merge registry upload state,
deployment state, and `ProjectDocument` dirty state into one Boolean.

### 2. Row 2: Workspace Ribbon (Height: 32px / 2.0rem)
Row 2 is the **canonical workspace toolbar**. It answers: *"What can I author in this active workspace right now?"*

> **Architectural Decision:** Row 2 **supersedes and replaces permanent floating viewport toolbars** (e.g., `LayoutDraftToolbar.svelte`). Viewport overlays are strictly limited to direct spatial manipulation fixtures:
> - Transform Gizmos (Move / Rotate / Scale)
> - Viewport Orientation Cube (Scene 3D upper-right)
> - Footprint direct-rotation handles (Scene Plan Arrange)
> - Camera path spline bezier handles and frustum cones (Camera domain)

#### Row 2 Routing Rules:
- **Zone A (Fixed Left — 240px):** Mode & View Toggles.
  - In `Spatial`: Contains `[ Scene | Camera ]` (28px height segmented switch) and `[ Plan | 3D ]` (28px height segmented switch).
  - In future project surfaces (`Experience`, `Assets`, `Publish`), Zone A holds the top-level section filters for that surface.
- **Zone B (Contextual Center):** Active Authoring Tools.
  - Dynamically populates tools for the active domain/view mode.
- **Zone C (Fixed Right — 180px):** View & Precision Utilities.
  - Snapping toggle & increment selector (`Snap: 0.25m`), Grid visibility, Metric display readouts.

### 3. Sizing & Token Compliance

This design targets the shared visual design tokens (`docs/Design-specs/Design-specs.md` §7–§8 and `apps/editor/src/lib/editor/styles/tokens.css`). Tokens named below as existing exist in the current token file; every other surface is explicitly marked as a **P21 implementation token change/addition** — nothing is invented and presented as already shipped.

- **Active / selection accent:** `--editor-accent` (`#2F8CFF`). *(Do not use `#3B82F6`, which is reserved strictly for `--editor-axis-z` and is never a generic UI accent.)*
- **Row 1 / Row 2 chrome backgrounds:** the current token file defines no
  dedicated row-1/row-2 shell band surfaces. **P21 implementation token
  change/addition** — propose `--editor-bg-row-1` and `--editor-bg-row-2` in
  the dark-blue shell family, with bottom borders from the existing
  `--editor-border-subtle` / `--editor-border-normal` tokens. Do not claim
  `--editor-bg-panel` / `--editor-bg-panel-raised` are row chrome without a
  deliberate mapping decision at implementation time.
- **Drafting Canvas (Plan):** `--editor-plan-bg` (`#F5F3EE`) — exists today
  (bright technical drafting paper).
- **Viewport Canvas (3D):** the 3D viewport sits on the app background token
  `--editor-bg-app` (`#071019`) — exists today. No separate viewport token is
  claimed.
- **Status Bar:** bottom `24px` target height — **P21 dimension change**
  (current runtime `--editor-status-height` is `32px`); surface/text tokens
  come from the existing shell/text token families.

---

## D. Workspace Shell States

The wireframes below demonstrate physical layout stability across all authoring states.

### 1. Spatial → Scene → Plan → Layout
*Architecture drafting mode: rooms, walls, door/window openings.*

```text
+----------------------------------------------------------------------------------------------------+
| [<-] Chopin Salon Paris    [Cloud] [Saved v]      [...] | [SPATIAL]  Experience  Assets  Publish | [<-] [->] [> Preview] [User] |
+----------------------------------------------------------------------------------------------------+
| [SCENE | Camera]  [PLAN | 3D] | Mode: [LAYOUT | Arrange] | Tools: [Select] [Rect Room] [Poly] [Opening] | Snap: 0.25m  Grid: On |
+------------------+-----------------------------------------------------------------+---------------+
| ARCHITECTURE     | SVG PLAN DRAFTING SURFACE (#F5F3EE)                             | ROOM INSPECTOR|
|------------------|                                                                 |---------------|
| Rooms (2)        |       +----------- 8.00m -----------+                           | Selected:     |
|  * Salon A       |       |                             |                           | Room "Salon A"|
|  - Vestibule     |       |                             |                           |               |
|                  | 6.00m |           Salon A           | 6.00m                     | Dimensions:   |
| Openings (3)     |       |                             |                           | W: 8.00m      |
|  - Main Door     |       |                             |                           | L: 6.00m      |
|  - Window East   |       +-----------[ Door ]----------+                           | H: 3.50m      |
+------------------+-----------------------------------------------------------------+---------------+
| Status: Layout Drafting Active | Snap: 0.25m | Metric Units (m) | Cursor: X: 4.25m, Z: -2.00m      |
+----------------------------------------------------------------------------------------------------+
```

### 2. Spatial → Scene → Plan → Arrange
*2D manipulation of placed objects and architectural fixtures in X/Z space.*

```text
+----------------------------------------------------------------------------------------------------+
| [<-] Chopin Salon Paris    [Cloud] [Saved v]      [...] | [SPATIAL]  Experience  Assets  Publish | [<-] [->] [> Preview] [User] |
+----------------------------------------------------------------------------------------------------+
| [SCENE | Camera]  [PLAN | 3D] | Mode: [Layout | ARRANGE] | Tools: [Select / Direct Drag] [Delete]       | Snap: 0.25m  Grid: On |
+------------------+-----------------------------------------------------------------+---------------+
| SCENE HIERARCHY  | SVG PLAN ARRANGE SURFACE (#F5F3EE)                              | INSPECTOR     |
|------------------|                                                                 |---------------|
| Salon A          |       +-----------------------------+                           | [SCENE ENTITY]|
|  * Grand Piano   |       |                             |                           | Grand Piano   |
|  - Bench         |       |       [==== Piano ====]     |                           | X: 1.25m      |
| Architecture     |       |       (Rotate Handle ø)     |                           | Z: -2.10m     |
|  * Partition A   |       |                             |                           | Elevation (Y):|
|                  |       |       [ Partition A ]       |                           | 0.00m         |
|                  |       +-----------------------------+                           | (Preserved ·  |
|                  |  (Architecture is read-only reference context)                  |  Edit in 3D)  |
|                  |                                                                 |---------------|
|                  |                                                                 | [LAYOUT OBJ]  |
|                  |                                                                 | Partition A   |
|                  |                                                                 | X: 0.00m      |
|                  |                                                                 | Z: -3.50m     |
|                  |                                                                 | (Layout Rules)|
+------------------+-----------------------------------------------------------------+---------------+
| Status: Arrange Mode Active | Drag moves X/Z | Shift+Drag snaps Yaw to 15 deg | Y Preserved        |
+----------------------------------------------------------------------------------------------------+
```

### 3. Spatial → Scene → 3D
*Full composition: 3D entities, models, primitives, lighting, materials.*

```text
+----------------------------------------------------------------------------------------------------+
| [<-] Chopin Salon Paris    [Cloud] [Saved v]      [...] | [SPATIAL]  Experience  Assets  Publish | [<-] [->] [> Preview] [User] |
+----------------------------------------------------------------------------------------------------+
| [SCENE | Camera]  [Plan | 3D] | Tools: [Select] [Move] [Rotate] [Scale] | Transform: [Local | World]  | Snap: 0.25m  Snap: 15°|
+------------------+-----------------------------------------------------------------+---------------+
| SCENE ENTITIES   | WEBGL 3D VIEWPORT                                               | MATERIAL INSP.|
|------------------|                                              [XYZ Cube]         |---------------|
| Hierarchy Assets |                                                                 | Mesh: Body    |
| - Environment    |                     [ Selected Object ]                         | Material: Wood|
| - Lights (2)     |                     [ 3D Transform Gizmo ]                      |               |
| - Models (6)     |                                                                 | Roughness:0.35|
|   * Grand Piano  |                                                                 | Metalness:0.05|
|   - Velvet Bench |                                                                 | Texture:      |
|                  |                                                                 | Texture:      |
|                  |                                                                 | tex_walnut_d  |
|                  |                                                                 | (catalogue)   |
+------------------+-----------------------------------------------------------------+---------------+
| Status: Scene 3D Active | 1 Object Selected | Alt+Drag: Orbit | Middle-Click: Pan | Scroll: Zoom   |
+----------------------------------------------------------------------------------------------------+
```

### 4. Spatial → Camera → Plan
*Camera graph authoring: node placement, undirected connections, edge timing.*

```text
+----------------------------------------------------------------------------------------------------+
| [<-] Chopin Salon Paris    [Cloud] [Saved v]      [...] | [SPATIAL]  Experience  Assets  Publish | [<-] [->] [> Preview] [User] |
+----------------------------------------------------------------------------------------------------+
| [Scene | CAMERA]  [PLAN | 3D] | Tools: [Select] [Add Camera] [Connect Nodes]               | Snap: 0.25m  Grid: On |
+------------------+-----------------------------------------------------------------+---------------+
| CAMERA GRAPH     | SVG CAMERA PLAN VIEWPORT                                        | EDGE INSPECTOR|
|------------------|                                                                 |---------------|
| Sequence (3)     |           (1) Entry Node                                        | Connection:   |
|  1. Entry        |                  \                                              | 1 — 2         |
| >2. Piano Close  |                   \  Edge A: 4.0s (Undirected)                  | (Undirected)  |
|  3. Overview     |                    \                                            |               |
|                  |                    (2) Piano Close                              | Duration A->B:|
| Unsequenced (1)  |                    /                                            | 4.00s         |
|  * Balcony Cam   |                   /  Edge B: 3.5s                               | Duration B->A:|
|                  |                  (3) Overview                                   | 4.00s         |
+------------------+-----------------------------------------------------------------+---------------+
| CAMERA TIMELINE DOCK (Plan and 3D Shared Dock)                                                     |
|----------------------------------------------------------------------------------------------------|
| [|> Play] [|<] [>|]  00:04.00 / 00:07.50 | Scope: [Preview Sequence v]              [Snap: 0.5s]    |
|----------------------------------------------------------------------------------------------------|
| Sequence:        [=== Shot 1: Entry ===][========= Shot 2: Piano Close =========]                  |
+----------------------------------------------------------------------------------------------------+
| Status: Camera Plan Active | Edge Selected | Connections are Undirected (No Arrows) | Y Preserved  |
+----------------------------------------------------------------------------------------------------+
```

### 5. Spatial → Camera → 3D
*Camera posing, frustum inspection, look-at targets, path curves, framing guides.*

```text
+----------------------------------------------------------------------------------------------------+
| [<-] Chopin Salon Paris    [Cloud] [Saved v]      [...] | [SPATIAL]  Experience  Assets  Publish | [<-] [->] [> Preview] [User] |
+----------------------------------------------------------------------------------------------------+
| [Scene | CAMERA]  [Plan | 3D] | Tools: [Select] [Move] [Rotate] [Add Cam] [Path] [Frame] [View]  | View: [Observer | POV]|
+------------------+-----------------------------------------------------------------+---------------+
| CAMERA SEQUENCE  | WEBGL CAMERA 3D VIEWPORT                                        | CAMERA INSP.  |
|------------------|                                                                 |---------------|
| Sequence (3)     |                                                                 | Camera Node #2|
|  1. Entry        |                  Camera Node #02                                | Pose (X,Y,Z): |
| >2. Piano Close  |                  [Frustum Cone] \                               | X:  2.10m     |
|  3. Overview     |                     |            \ Spline Path                  | Y:  1.65m     |
|                  |                     v             \                             | Z: -1.80m     |
| Framing Guides:  |               [Look Target]        Camera Node #03              |               |
|  [Rule of 3rds]  |                                                                 | FOV: 50 deg   |
|                  |                                                                 | Roll: 0 deg   |
|                  |                                                                 | Look Target:  |
|                  |                                                                 | -> Grand Piano|
+------------------+-----------------------------------------------------------------+---------------+
| CAMERA TIMELINE DOCK                                                                               |
|----------------------------------------------------------------------------------------------------|
| [|> Play] [|<] [>|]  00:04.00 / 00:07.50 | Scope: [Preview Sequence v]              [Snap: 0.5s]    |
|----------------------------------------------------------------------------------------------------|
| Sequence:        [=== Shot 1: Entry ===][========= Shot 2: Piano Close =========]                  |
+----------------------------------------------------------------------------------------------------+
| Status: Camera 3D Active | Observer Mode | Full X/Y/Z Authority | Esc Pauses Playback              |
+----------------------------------------------------------------------------------------------------+
```

### 6. Experience Workspace (Future / Deferred)
*Illustrative content used to validate shell composition. Internal workspace capabilities remain deferred and require their own product/architecture design.*

```text
+----------------------------------------------------------------------------------------------------+
| [<-] Chopin Salon Paris    [Cloud] [Saved v]      [...] | Spatial  [EXPERIENCE]  Assets  Publish | [<-] [->] [> Preview] [User] |
+----------------------------------------------------------------------------------------------------+
| Sections: [Navigation | Content | Interactions] | Flow: [Guided Tour v]               | [ + Add Menu Item ]   |
+------------------+-----------------------------------------------------------------+---------------+
| NAVIGATION TREE  | EXPERIENCE STAGING CANVAS (Spatial Context Overlay)             | ITEM CONFIG   |
|------------------|                                                                 |---------------|
| Visitor Menu     |      +---------------------------------------------------+      | Menu Label:   |
|  - Welcome       |      | Authored Visitor Navigation:                      |      | "The Piano"   |
|  * The Piano     |      | [ Welcome ]  [* The Piano *]  [ Art Collection ]  |      |               |
|  - Collection    |      +---------------------------------------------------+      | Resolves To:  |
|                  |                                                                 | Camera Node #2|
| Content Panels   |      (Menu items reference canonical Spatial Camera Nodes.       | (No Duplicate |
|  - Bio Card      |       Zero secondary camera systems permitted.)                 |  Camera Data) |
+------------------+-----------------------------------------------------------------+---------------+
| Status: Experience Navigation Active | References Spatial World Directly                            |
+----------------------------------------------------------------------------------------------------+
```

### 7. Assets Surface (Future / Deferred)
*Illustrative content used to validate shell composition. Internal surface capabilities remain deferred and require their own product/architecture design.*

```text
+----------------------------------------------------------------------------------------------------+
| [<-] Chopin Salon Paris    [Cloud] [Saved v]      [...] | Spatial  Experience  [ASSETS]  Publish | [<-] [->] [> Preview] [User] |
+----------------------------------------------------------------------------------------------------+
| Type: [All | 3D Models | Images | Audio] | Source: [All | Upload | Built-in] | Search: [ Filter... ] | [+ Upload] |
+------------------+-----------------------------------------------------------------+---------------+
| COLLECTIONS      | PROJECT ASSET REGISTRY TABLE                                    | ASSET DETAILS |
|------------------|-----------------------------------------------------------------|---------------|
| * All Items (18) | Name                   Type       Size     Usage        Status   | grand_piano   |
| - Architecture   |-----------------------------------------------------------------| Type: 3D Model|
| - Furniture      | grand_piano.glb        3D Model   4.2 MB   1 Instance   Ready    | Format: GLB   |
| - Audio Clips    | oak_parquet_diff.webp  Image      1.1 MB   3 Surfaces   Ready    | Size: 4.2 MB  |
|                  | chandelier_point.glb   3D Model   850 KB   1 Instance   Ready    | Used in:      |
|                  | audio_chopin_nocturne  Audio      6.2 MB   Unassigned   Ready    | - Salon A     |
+------------------+-----------------------------------------------------------------+---------------+
| Status: Registry rows are uploaded files | Registry-backed via /project-assets; built-ins stay catalogue   |
+----------------------------------------------------------------------------------------------------+
```

### 8. Publish Surface (Future / Deferred)
*Illustrative content used to validate shell composition. Internal surface capabilities remain deferred and require their own product/architecture design.*

```text
+----------------------------------------------------------------------------------------------------+
| [<-] Chopin Salon Paris    [Cloud] [Saved v]      [...] | Spatial  Experience  Assets  [PUBLISH] | [<-] [->] [> Preview] [User] |
+----------------------------------------------------------------------------------------------------+
| Target: [Production | Staging] | Release: v14 | Status: [Live]                      | [ Publish Changes ] |
+------------------+-----------------------------------------------------------------+---------------+
| PUBLISH SECTIONS | PRODUCTION RELEASE OVERVIEW                                     | ACCESS CONFIG |
|------------------|-----------------------------------------------------------------|---------------|
| * Overview       | Live Destination: https://spaces.museumeditor.com/s/chopin      | Privacy:      |
| - Custom Domain  | Last Published: Today, 2:15 PM by Alexander Liszt               | (•) Public    |
| - Embed Snippet  | Build Validation: Clean (0 Geometry Errors, 18 Assets Verified) | ( ) Unlisted  |
| - Version Log    |                                                                 | ( ) Password  |
|                  | Visitor Sharing URL:                                            |               |
|                  | [ https://spaces.museumeditor.com/s/chopin             ] [Copy] | SEO Title:    |
|                  |                                                                 | "Chopin Salon"|
+------------------+-----------------------------------------------------------------+---------------+
| Status: Ready for Production Deployment | CDN Edge Verified                                         |
+----------------------------------------------------------------------------------------------------+
```

### 9. Visitor Preview Takeover (`/project/:id/preview`)
*Full-screen visitor simulation running on transient project snapshot.*

```text
+----------------------------------------------------------------------------------------------------+
| [ 👁 VISITOR PREVIEW ]         Viewing Current Draft (In-Memory)             [ ✕ Exit Preview (Esc) ] |
+----------------------------------------------------------------------------------------------------+
|                                                                                                    |
|                                                                                                    |
|                                                                                                    |
|                                   VISITOR RUNTIME CANVAS                                           |
|                            (Zero Authoring Tools, Gizmos, or Frustums)                              |
|                                                                                                    |
|                                                                                                    |
|                                                                                                    |
|         +------------------------------------------------------------------------------+           |
|         | Authored Visitor Navigation:                                                 |           |
|         | [ Welcome ]      [* The Grand Piano *]      [ North Gallery ]                |           |
|         +------------------------------------------------------------------------------+           |
+----------------------------------------------------------------------------------------------------+
```

---

## E. Public Entry (`/`)

This plan governs `/`, including normal (non-OAuth) entry behavior.

### Guest

```text
/
→ public entry
→ Start creating
   → create client project UUID
   → /project/:id/spatial
   → no auth/backend gate

OR

→ Continue with Google
   → OAuth
   → /projects
```

### Authenticated returning creator

A normal visit with a valid authenticated session routes straight to the
Project Hub — an authenticated creator is **not** forced through the guest
landing every visit:

```text
valid authenticated session
→ /projects
```

### OAuth return priority

OAuth return behavior takes precedence over the normal entry redirect and is
not redesigned here:

```text
intent=projects
→ /projects

intent=save
→ validate/read pending 15-minute Save handoff
→ restore original project ID
→ /project/:id/spatial?resume-save=1
```

> Authentication remains a cloud-capability gate, never an authoring gate.

---

## F. Project Hub (`/projects`)

The Hub serves as the management directory for projects.

```text
+----------------------------------------------------------------------------------------------------+
| MUSEUM EDITOR                                                                 [alexander.l@work v] |
+----------------------------------------------------------------------------------------------------+
|                                                                                                    |
|   Projects                                                                      [ + New Project ]  |
|                                                                                                    |
|   RECENT PROJECTS [Target Capability — Omitted in P21 until cover pipeline exists]                 |
|   +--------------------------+  +--------------------------+  +--------------------------+         |
|   | [ 16:9 Chosen/Fallback ] |  | [ 16:9 Chosen/Fallback ] |  | [ 16:9 Chosen/Fallback ] |         |
|   |                          |  |                          |  |                          |         |
|   | Chopin Salon Paris       |  | Modernist Pavilion       |  | 19th Century Sculpture   |         |
|   | Edited 14m ago · Cloud   |  | Edited 2d ago · Cloud    |  | Edited Aug 28 · Cloud    |         |
|   +--------------------------+  +--------------------------+  +--------------------------+         |
|                                                                                                    |
|   ALL PROJECTS                                                                                     |
|   +--------------------------------------------------------------------------------------------+   |
|   | Name                         Version   Last Modified        Location     Status    Actions |   |
|   |--------------------------------------------------------------------------------------------|   |
|   | Chopin Salon Paris           v14       Today, 4:15 PM       Cloud        Saved     [Open]  |   |
|   | Modernist Pavilion           v3        Yesterday, 2:10 PM   Cloud        Saved     [Open]  |   |
|   +--------------------------------------------------------------------------------------------+   |
|                                                                                                    |
+----------------------------------------------------------------------------------------------------+
```

### 1. Hub States
- **Current P21 Guest State:**
  - Displays informational callout: *"You are in a temporary guest session. Projects authored on this device exist only in your current browser session. Sign in with Google to save your projects permanently to the cloud."*
  - **No false promises:** The Hub does **not** list past local drafts or offer resume actions once a browser tab is closed.
  - Prominent action: `[ Continue with Google ]`.
- **Target Post-IndexedDB Guest State:**
  - When durable local persistence is implemented, the Hub displays an `Active Local Drafts` section showing projects saved to device storage, with `[Resume]` and `[Sync to Cloud]` actions.
- **Authenticated State:**
  - Lists owned cloud projects sorted by `Last Modified` descending.
  - Avatar menu in header provides `Sign out`.
- **New Project Action:**
  - One-click `+ New Project` button.
  - Generates client UUID, mounts `/project/:id/spatial`. Never intercepts creation with metadata or template dialogs.

### 2. P21 Baseline vs. Target Composition
- **P21 Now (No Cover Pipeline):** The `RECENT PROJECTS` shelf is omitted. The view opens directly with the `ALL PROJECTS` data table taking full height.
- **Target (Generated Covers):** The 16:9 `RECENT PROJECTS` shelf sits above the table. It uses an **explicitly chosen cover viewpoint** when authored by the creator, falling back to an automated snapshot. The exact fallback snapshot algorithm is deferred.

---

## G. Persistence and Account UX

To prevent creator confusion, **Persistence Location** (where the project is stored) and **Sync State** (whether mutations are saved) are separated into two explicit UI elements in Row 1.

```text
ROW 1 PERSISTENCE CLUSTER:
┌─────────────────────────────────────────────────────────────┐
│ "Chopin Salon" ✎   [☁ Cloud]  [● Save changes (⌘S)]   [···] │
└─────────────────────────────────────────────────────────────┘
                     ▲          ▲
                     │          └─ Axis 2: Sync / Mutation State
                     └──────────── Axis 1: Persistence Location Tier
```

### 1. State Matrix & Exact UI Presentation

| Scenario | Location Badge | Sync State Pill | Action on Click |
|---|---|---|---|
| **Guest Volatile Session (Unsaved Edits)** | `[Local Session]` | `Unsaved changes` `[Save to Cloud]` | Opens Google OAuth Dialog (15-min handoff). |
| **Guest Volatile Session (Clean/Boot)** | `[Local Session]` | `Session active` | Tooltip: *"Draft exists only in current browser tab."* |
| **Durable Local Draft** *(Target)* | `[Local Draft]` | `Saved to device ✓` | Future IndexedDB sync confirmation. |
| **Cloud Project (Clean)** | `[☁ Cloud]` | `Saved ✓` | Tooltip: *"All changes saved to cloud (v14) at 4:15 PM"*. |
| **Cloud Project (Dirty)** | `[☁ Cloud]` | `[● Save changes (⌘S)]` | **Interactive:** Commits snapshot to Postgres JSONB. |
| **Cloud Project (Saving)** | `[☁ Cloud]` | `Saving... ⟳` | Disabled while in flight. |
| **Cloud Project (Save Blocked)**| `[☁ Cloud]` | `[⚠ Save Blocked]` | Opens popover listing blockers (e.g., active wall drag). |

### 2. Authentication Flow & Handoff
- Auth is Google OAuth (PKCE) only.
- Guest clicks `Save to Cloud`: current `ProjectDocument` serializes to `sessionStorage` (15-minute expiration). Full-page redirect to Google.
- The `intent=save` callback returns to the entry surface, whose
  session-storage trampoline validates the pending 15-minute handoff, restores
  the original project ID, and resumes at `/project/:id/spatial?resume-save=1`.
  The document restores from `sessionStorage`, commits the initial cloud
  version, and transitions the badge from `[Local Session]` to `[☁ Cloud]`.
  Project ID is preserved.

---

## H. First-Run / Empty-Project Experience

To eliminate blank-canvas disorientation without introducing patronizing onboarding wizards, the editor uses a non-modal **Ghost Blueprint Watermark**.

```text
              SVG PLAN CANVAS (#F5F3EE Technical Drafting Surface)
  ┌────────────────────────────────────────────────────────────────────────┐
  │                                                                        │
  │                  ┌ - - - - - - - - - - - - - - - - - ┐                 │
  │                  ╎                                   ╎                 │
  │                  ╎        DRAW YOUR FIRST ROOM       ╎                 │
  │                  ╎                                   ╎                 │
  │                  ╎                                   ╎                 │
  │                  ╎      Use Rectangle Room or        ╎                 │
  │                  ╎      Polygon Room in the          ╎                 │
  │                  ╎      toolbar above ↑              ╎                 │
  │                  ╎                                   ╎                 │
  │                  ╎        10.0m × 8.0m               ╎                 │
  │                  └ - - - - - - - - - - - - - - - - - ┘                 │
  │                                                                        │
  └────────────────────────────────────────────────────────────────────────┘
```

### First-Run Rules:
1. **The Ghost Watermark:** A dashed blueprint rectangle ($10\text{m} \times 8\text{m}$) rendered with 20% opacity outline in CAD slate-blue (`#64748B`) at world origin $(0, 0)$.
2. **Directional Guidance (not dead controls):** The overlay is
   `pointer-events: none`, so it must not render button-like controls. It
   displays plain directional guidance — e.g., `Draw your first room`, then
   `Use Rectangle Room or Polygon Room in the toolbar above ↑`. Keyboard
   shortcuts are only shown if explicitly ratified.
3. **Zero Interaction Blocking:** Watermark has `pointer-events: none`. It cannot intercept clicks, pans, or drags.
4. **Session-Scoped Dismissal:** The watermark unmounts automatically once the project is no longer empty, or for the remainder of the editor session upon first tool use. Dismissal is **not** serialized into `ProjectDocument`.
5. **Inspector Primer:** The right Inspector displays a reference card while selection count is zero:
   - Tool explanations for Rectangle and Polygon rooms.
   - Snapping and unit status ($0.25\text{m}$ grid).

---

## I. Visitor Preview (`/project/:id/preview`)

Visitor Preview answers: *"What will visitors actually experience?"*

```text
CURRENT PROJECT (In-Memory Draft)
        │
        ▼ (Transient JSON Snapshot Serialization)
VISITOR-SAFE RUNTIME VIEWPORT
        │
        ├── Authored Visitor UI (Navigation menus, info cards, hot-spots)
        └── Minimal Floating Chrome: [ 👁 VISITOR PREVIEW ] [ ✕ Exit (Esc) ]
```

### Architectural Contract:
1. **Observable UX Contract:** 
   - **Enter:** Triggered via `▶ Preview` in Row 1. Pushes URL `/project/:id/preview`. The visitor runtime receives a transient, validated project snapshot.
   - **Exit:** Hitting `Escape` or clicking `[✕ Exit Preview]` returns the creator to the previous authoring workspace, restoring previous selection, camera pose, and editor session state exactly.
   - *Mounting mechanics (hidden mounted editor, shell state retention, or session coordinator) remain an implementation detail.*
2. **Transient In-Memory Snapshot:** Preview executes on the live in-memory `ProjectDocument`. Guests and unsaved cloud drafts preview immediately without requiring a backend save.
3. **Zero Authoring / Debug Chrome:** Editor gizmos, path curves, frustums, and debug camera transport bars (`⏮ / ⏭ / Play Tour / Timecode`) are **strictly prohibited**.
4. **Authored Visitor UI Only:** Only UI authored inside `Experience` or default visitor navigation (walk/look/orbit) is rendered.
5. **Distinction from Camera Preview:**
   - **Camera Preview (Timeline):** Authoring tool for tuning edge curves, durations, and camera transitions within the Spatial editor.
   - **Visitor Preview (Runtime):** Experiencing the holistic compiled project as an end visitor.

---

## J. Unified Assets Architecture

There is **one user-facing Project Asset System**. Asset source is
metadata/acquisition context — not a separate store and not a top-level silo.
Registry-backed identity (`/project-assets/{assetId}`) applies to **uploaded
project files**, not to every asset.

```text
ONE USER-FACING PROJECT ASSET SYSTEM

Built-in / catalogue assets
→ deterministic catalogue/static identity
→ no project registry row required in current P20 behavior
→ no R2 object

Uploaded project files
→ Project Asset Registry
→ logical /project-assets/{assetId}
→ metadata in Postgres
→ bytes in private R2

Online / provider acquisition
→ future source/import mechanism
→ exact durable representation deferred
```

### Relationship Rules:
1. **Registry authority is scoped to registry-backed project files.** Uploaded
   project files are referenced through the stable logical project-asset
   identity `/project-assets/{assetId}` and resolve bytes from private
   Cloudflare R2. Built-in/catalogue assets retain their existing deterministic
   catalogue identity and do not require registry rows; online/provider
   acquisition is a future mechanism with its durable representation deferred.
   Projects do **not** reference assets solely via `/project-assets/{assetId}`.
   Do not create `SpatialAssetStore`, `ExperienceAssetStore`, `BuiltInAssetStore`,
   or `CloudAssetStore` as competing product authorities — placement/assignment
   keeps one path, consumed by Spatial and future Experience.
2. **Spatial Assets Panel:** Acts as a task-oriented placement picker. Filterable by type (`3D Models | Textures | Lights`) and source (`All | Built-in | Uploads`).
3. **Assets Workspace (Future):** Central management surface over the same underlying registry. May later support management capabilities such as replacement, cleanup, usage inspection, and storage management; exact capabilities are deferred.

---

## K. Current → Target Migration Map

| Existing Element / Scaffold | Current Location | Proposed Permanent Location | Nature of Change |
|---|---|---|---|
| **Top Layout Shell** | `+layout.svelte` (thin bar) | **Row 1 (36px)** | Expanded to host Identity, Persistence, Workspaces, Undo/Redo, Preview, Avatar. |
| **Editor App Bar** | `EditorAppBar.svelte` | Split into **Row 1** and **Row 2** | Decomposed: Global controls to Row 1; contextual tools to Row 2. |
| **Project Menu Dropdown** | `EditorProjectMenu.svelte` | Dissolved | Renaming, Save, Auth, and History elevated to visible Row 1 elements. |
| **Save State** | Read-only pill in App Bar | **Row 1 Left** (adjacent to Name) | Separated into Location Badge (`[Cloud]`) and Action Pill (`[Save]`). |
| **Project Name** | Inside dropdown menu | **Row 1 Left** | Direct inline-editable field in persistent shell. |
| **Authentication UI** | Inside dropdown menu | **Row 1 Far Right** | Elevated to persistent Google profile avatar / Sign-in button. |
| **`[Scene \| Camera]`** | App bar center | **Row 2 Left** (Zone A) | Permanently anchored in Workspace Ribbon. Never relocates. |
| **`[Plan \| 3D]`** | App bar center | **Row 2 Left** (Zone A) | Permanently anchored in Workspace Ribbon. Never relocates. |
| **`[Layout \| Arrange]`** | Canvas floating toolbar | **Row 2 Center-Left** | Relocated from floating canvas into Row 2 contextual ribbon. |
| **Floating Canvas Toolbars** | Floating over viewport | **Row 2 Center** (Zone B) | **Superseded.** Contextual tools now live canonically in Row 2. |
| **Undo / Redo** | App bar right | **Row 1 Right** | Elevates document-wide history to global project shell. |
| **"Preview Museum" Link** | App bar right (links `/museum`) | **Row 1 Right (`▶ Preview`)** | Removed frozen demo link; replaced with true Visitor Preview takeover. |
| **Hub Project List** | `/projects` (plain table) | `/projects` (polished hub) | Polished tabular list; ready for Recent Cards addition. |

---

## L. Target vs. Implementation Dependency Matrix

| Capability / Surface | Status | Current Reality (Tree) | Future Prerequisite Dependency |
|---|---|---|---|
| **Two-Level Shell Structure** | **P21 Target** | Scaffolded stacked headers | Implementation in `+layout.svelte` & `EditorApp.svelte`. |
| **Row 2 Contextual Toolbar** | **P21 Target** | Floating viewport toolbars | Refactor toolbars out of canvas into Row 2 ribbon. |
| **Inline Project Rename** | **P21 Target** | Buried in Project Menu | Wire inline input to document metadata store. |
| **Separated Persistence UI** | **P21 Target** | Single status pill in menu | Separate local/cloud and clean/dirty reactive stores. |
| **Visitor Preview Takeover** | **P21 Target** | Frozen `/museum` link | Mount visitor runtime with serialized draft snapshot. |
| **Ghost Blueprint Watermark**| **P21 Target** | Blank SVG grid | SVG overlay in `PlanWorkspace.svelte` auto-dismissing on edit. |
| **Durable Local Persistence**| **Deferred** | Volatile browser session | Client-side IndexedDB document persistence layer. |
| **Hub Recent Cover Shelf** | **Deferred** | Text-only table in `/projects`| Automated snapshot/cover pipeline. |
| **Experience Workspace** | **Deferred** | None (Reserved route) | P23: Visitor UX data model and staging canvas. |
| **Assets Manager Surface** | **Deferred** | Contextual Texture tab (P20)| P22: Dedicated registry management interface. |
| **Publish Surface** | **Deferred** | None (Reserved route) | North Star: Hosting, custom domain, and CDN deployment engine. |

---

## M. Canonical Decisions / Non-Decisions

### Ratified by This Plan
1. **The Compact Two-Level Shell (68px):** Row 1 (36px) owns global project context; Row 2 (32px) owns workspace contextual authoring.
2. **Physical Stability of Spatial Controls:** `[Scene | Camera]`, `[Plan | 3D]`, and `[Layout | Arrange]` sit in Row 2 and **never move** when future project surfaces are enabled in Row 1.
3. **Row 2 Replaces Permanent Floating Viewport Toolbars:** Contextual toolbars are absorbed into Row 2; viewports retain only direct-manipulation spatial fixtures.
4. **Global History in Row 1:** Undo/Redo is explicitly a global project control in Row 1, while remaining session/store infrastructure.
5. **Visitor Preview as Project-Level Runtime:** Preview is an in-memory visitor simulation overlay (`/project/:id/preview`) with clean visitor UI and minimal exit chrome.
6. **Publish as a Project Workspace:** Publish is a peer workspace destination in Row 1 (`/project/:id/publish`), not a duplicated global header button.
7. **Two-Axis Persistence Presentation:** Storage tier (`[Local Session]` vs. `[Cloud]`) is explicitly decoupled from sync state (`Saved` vs. `Save`).
8. **Unified Asset System:** Exactly one asset registry with metadata-driven filtering; no independent asset silos. Bytes resolve from static bundles, R2, or external sources.
9. **Design System Token Integrity:** Active accent is `--editor-accent` (`#2F8CFF`); `--editor-axis-z` (`#3B82F6`) stays a spatial Z-axis color, never a generic UI accent. Row 1/Row 2 chrome background tokens are P21 additions as specified in §C.3.
10. **Camera Graph Invariant:** Connections are strictly undirected (`1 — 2`), with zero arrowheads.

### Explicitly Deferred / Not Ratified by This Plan
1. **Experience Workspace Internals:** The tree structure, content staging overlays, and event/action binding models are illustrative and require a future specification.
2. **Publish Pipeline Mechanics:** Deployment build systems, custom domain CNAME verification, password encryption, and analytics are deferred.
3. **Durable Local Storage Engine:** Implementing an IndexedDB client-side database for guest persistence is deferred beyond P21.
4. **Automated Cover Generator:** The snapshot fallback algorithm for Hub cards is deferred.