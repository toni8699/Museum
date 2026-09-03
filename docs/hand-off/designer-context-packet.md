# Designer Context Packet — Museum Editor → Freebuff

**Audience:** an external product/UI/UX designer who has never seen this codebase.
**Purpose:** everything needed to later propose the overall product flow, information architecture, shell, dashboard/project experience, and editor chrome — without opening the repository.
**Prepared:** 2026-09-03, from the current working tree and current dated specs. This is a context packet, **not** a design proposal.
**Status legend used throughout:** ✅ Implemented (in the current tree; deployment state is stated separately) · 🧱 Scaffolded (works but is intentionally minimal/placeholder) · 🔜 Planned (brief/contract exists, not yet implemented) · ⭐ North Star (ratified direction, not scheduled).

---

## 1. Product in one paragraph

Museum Editor is a **web-native authoring platform for interactive spatial/3D experiences** — museums and exhibitions, architectural and historical walkthroughs, 3D portfolios, product showrooms, educational experiences, and interactive spatial stories. Creators **build and direct the world** (rooms, walls, objects, lighting — "Spatial"), then, long-term, **shape how visitors understand and navigate that world** (menus, contextual content, interactions — "Experience"), preview, and publish — without Blender, a game engine, or deployment knowledge. It is explicitly **not** a general 3D mesh editor, a game engine, a BIM system, a Webflow-like website builder, or a Figma/Canva-style 2D design suite. The Chopin museum is a proving use case, not the product category. (`docs/north-star.md` — product vision; ratified 2026-08-31.)

---

## 2. Current vs future product map

```text
TODAY (implemented / scaffolded)                     FUTURE (North Star)

Entry (/)                                            Project
  ↓ 🧱 scaffolding (plain card, 2 actions)              ├─ Spatial ✅ (current editor)
Project Hub (/projects)                                 │   ├─ Scene
  ↓ 🧱 scaffolding (New Project + list only)            │   │   ├─ Plan → Layout | Arrange
Project Shell (/project/:id)                            │   │   └─ 3D
  ↓ 🧱 scaffolding (thin bar, Spatial only)             │   └─ Camera
Spatial Editor (EditorApp) ✅                            │       ├─ Plan
  ├─ Scene                                              │       └─ 3D
  │   ├─ Plan → Layout | Arrange ✅                     ├─ Experience ⭐ (future)
  │   └─ 3D ✅                                          │   ├─ Navigation
  └─ Camera                                             │   ├─ Content
      ├─ Plan ✅                                        │   └─ Interactions (Event → Target → Action)
      └─ 3D ✅                                          ├─ Assets ✅ locally (P20 registry + Spatial
      └─ Timeline ✅                                        integration; not deployed; no Assets surface)
                                                        └─ Publish ⭐ (future)
```

- **Entry → Project Hub → Project Shell → Spatial** is implemented end-to-end as scaffolding (P19.4, `docs/plans/2026-09-02-P19.4-editor-shell.md`). The current shell/dashboard styling is **temporary and is not an approved visual direction** (explicitly stated in the P19.4 plan: "It does not implement the final Project Hub or Project Shell product design").
- **Spatial** is the real, mature editor. **Experience and Publish are North Star only — nothing exists.** **Assets** is mid-flight: the durable project-asset registry and its Spatial texture integration (P20.1/P20.2) are implemented locally but **not deployed**; P20.3's conversion/refresh work remains planned. There is **no Assets workspace** and none is planned soon (P20 explicitly says "Do not build the final project-level Assets workspace yet").
- Cloud Save/Load and Google sign-in are implemented locally but **gated on owner-run Render/Neon/Google OAuth production provisioning**. R2 provisioning separately gates durable project-asset upload. None of these cloud capabilities is live in production yet.

---

## 3. Current user flow

### Guest-first authoring (the core product decision)

A visitor can author everything **before signing in**:

```text
Open /
→ "Start creating" (no account, no backend call)
→ new local project (random UUID) at /project/:id/spatial
→ author freely (Scene/Camera × Plan/3D, undo/redo, preview)
→ Save… → auth gate dialog ("Sign in with Google to save this project")
→ draft preserved in browser session (15-min handoff), full-page Google OAuth
→ return → draft restored → first cloud Save → project becomes cloud-owned
```

(`docs/plans/2026-09-02-P19.4-editor-shell.md` §P19.4.3; implementation in `apps/editor/src/routes/+page.svelte`, `apps/editor/src/lib/editor/app/EditorApp.svelte`.)

**Authentication is a cloud-capability gate, not an application gate.** Guest gets everything except: cloud Save, cloud Load, owned project list, durable asset upload, future Publish. There are **no guest accounts, no email/password** — Google OAuth only (Google OIDC Authorization Code + PKCE, app-owned secure session). (`docs/plans/2026-09-02-P19.4-editor-shell.md` "Authentication behavior"; `docs/architecture.md` platform boundary.)

### The full current flow

1. **Guest enters** `/` → "Start creating" OR "Continue with Google" (`apps/editor/src/routes/+page.svelte`).
2. **Creates project** → fresh UUID `project:<uuid>`, navigates to `/project/:id/spatial`; editor boots blank (Scene → Plan) (`EditorApp.svelte` boot; `apps/editor/src/routes/editor/+page.svelte` is a compat redirect that does the same).
3. **Edits** in Spatial (see §5–6).
4. **Save (guest)** → Project menu → "Save cloud project" → auth gate → Google → handoff resume → saved (`EditorProjectMenu.svelte`; `EditorApp.svelte` `continueSaveAuthentication`/`resumePendingCloudSave`).
5. **Save (signed in)** → validated whole-project snapshot → versioned JSONB cloud save; name + version shown in Project menu; Save sets clean baseline (dirty edits made mid-save stay dirty).
6. **Reopen** → `/projects` → "My Projects" list (name + version) → Open (`?load=1`) → guarded Load with dirty-confirmation and stale-state re-check; the one-shot `?load=1` is stripped from the URL.
7. **Logout** → Sign out in Hub or Project menu; owned list clears.

Export/import (all guest-accessible): Copy/Download scene JSON, Copy/Download layout JSON (separate documents), portable package export (`Export package…` — self-contained zip embedding binary bytes, package-local URIs), import file/package/pasted JSON (`EditorProjectMenu.svelte`).

---

## 4. Current route map (SvelteKit)

| Route | File | What it does | Status |
|---|---|---|---|
| `/` | `apps/editor/src/routes/+page.svelte` | **Entry.** Card with "Start a project" heading, `Start creating` (→ fresh project) and `Continue with Google` (→ `/projects` after OAuth). Also the OAuth return trampoline: `?auth=success&intent=save` resumes a pending Save draft via sessionStorage; cancelled/failed states offer Retry/Discard. | 🧱 scaffold (works; purple temporary styling) |
| `/projects` | `apps/editor/src/routes/projects/+page.svelte` | **Project Hub.** Session check → guest view ("New Project" + "Your work is not saved to the cloud." + "Continue with Google", **no fake cloud list**) or authenticated view ("My Projects" list: name, version, Open with `?load=1`; Sign out). | 🧱 scaffold |
| `/project/[projectId]/+layout.svelte` | same | **Project Shell.** Thin bar: "Projects" link, raw project-id string, one nav item: **Spatial** (marked `aria-current`). Wraps the editor full-height. | 🧱 scaffold (see §7) |
| `/project/[projectId]/spatial/+page.svelte` | same | Mounts `EditorApp` with `projectId`, `loadOwnedProject` (`?load=1`), `resumePendingSave` (`?resume-save=1`); strips one-shot params after navigation. | ✅ |
| `/editor` | `apps/editor/src/routes/editor/+page.svelte` | Compatibility redirect → fresh project at `/project/:id/spatial` (replaces the old direct editor mount). | ✅ |
| `/museum` | `apps/editor/src/routes/museum/+page.svelte` | **Frozen Chopin visitor demo** (checked-in project). Read-only, no auth/API. This is *not* a preview of the user's project. | frozen |
| `/museum/editor` | `apps/editor/src/routes/museum/editor/+page.svelte` | Frozen legacy editor relic. Must never change behavior. | frozen |
| `/dev/*` | `apps/editor/src/routes/dev/` | Developer scratch pages (materials, perf, assets). | dev-only |

Future routes explicitly reserved by the P19.4 plan (not implemented): `/project/[projectId]/experience`, `/project/[projectId]/assets`, `/project/[projectId]/publish`.

---

## 5. Current Spatial editor — information architecture

The canonical model is **two independent axes**: **Domain** (`Scene | Camera`) × **View** (`Plan | 3D`), plus one **Scene-Plan-local mode** (`Layout | Arrange`). This model is ratified and must not be flattened or renamed. Domain-first, representation-second; `Plan | 3D` order never reverses. (`docs/Design-specs/Design-shell-specs.md` §1; `docs/Design-specs/Design-specs.md` §18.)

```text
Scene
├─ Plan      → Layout (architecture) | Arrange (move existing objects in 2D)
└─ 3D        → scene composition: models, shapes, lights, materials, placement
Camera
├─ Plan      → camera graph: nodes, connections, paths, timing labels
└─ 3D        → movement + framing: pose, look target, FOV, framing helpers
└─ Timeline  → Camera-domain dock (Plan and 3D share it; Scene never has it)
```

**Shell regions** (all implemented; `apps/editor/src/lib/editor/app/EditorApp.svelte` grid: `top / left / center / right / status`):

| Region | Component | Contents |
|---|---|---|
| Top app bar | `EditorAppBar.svelte` | Brand + project name; `[Scene \| Camera]` and `[Plan \| 3D]` segmented controls; Saved/Unsaved pill; Undo/Redo; "Preview Museum" link (Scene 3D only — opens the **frozen demo**, not your project); **Project** menu (name field, Save cloud project, Sign in/out, owned projects list, JSON/package import-export, Reset, validation readout). |
| Left panel | `EditorSidebar.svelte` | **Scene domain:** `Hierarchy \| Assets` tabs (UnifiedProjectTree = environment/rooms/objects/lights/cameras as project structure; Asset Library). **Camera domain:** dedicated Camera Sidebar: `Environment · Sequence Inspector · Unsequenced · Connections`. |
| Center | `PlanWorkspace.svelte` / `CameraPlanWorkspace.svelte` / `Workspace3DView.svelte` | The viewport. Both Plan surfaces stay mounted (hidden cell is `inert`), so pan/zoom survive domain switches. Camera domain also mounts the **Camera Timeline** dock here. |
| Right | `EditorInspector.svelte` | One Inspector shell; contents route by selection (no selection / room / wall / opening / scene object / light / camera node / connection / path anchor / transition / multi-select). |
| Bottom | `StatusBar.svelte` | Workspace label, selection count, save state; nav hints (`Alt+Drag orbit`, etc.); grid/snap/units. Informational only — no authoring actions. |

Switching rules: `Plan ↔ 3D` keeps domain and feels cheap; `Scene ↔ Camera` swaps sidebar + toolbar + Inspector context and mounts/unmounts the Camera Timeline **instantly, no animation**; timeline expansion/playhead/selection survive both directions; boot state is **Scene → Plan**. (`Design-shell-specs.md` §19–21.)

**Toolbars are workspace-contextual** — the header never holds manipulation tools:

- Scene Plan Layout: Select · Rect room · Polygon room · door/window openings (measured/snap-aware) — `apps/editor/src/lib/editor/layout/LayoutDraftToolbar.svelte`.
- Scene Plan Arrange: Select/direct-drag, footprint rotation handle, delete (no permanent Move/Rotate tools).
- Scene 3D: Select · Move · Rotate · Scale · Add Asset (via library) · Local/World · Snap; plus selected-object transform gizmo and the upper-right XYZ orientation box.
- Camera Plan: Select · Add Camera · Connect · View; Select+drag moves nodes; timing authored on the plan edge.
- Camera 3D: Select · Move · Rotate · Add Camera · Path · Frame · View. (`Design-specs.md` §22; `Design-shell-specs.md` §16.)

---

## 6. Important current features (UX-oriented)

### Scene Plan
- **Layout:** rooms (rect/polygon drafting), walls, door/window openings, dimensions/measurement language, snap guides; room drag relocates the room + its owned layout objects as **one** gesture; grid 0.25 m snapping; selection kinds: room/wall/opening. (`LayoutPlanViewport.svelte`, `LayoutDraftToolbar.svelte`.)
- **Arrange:** 2D manipulation of *already placed* movable content — eligible scene entities **and** layout objects, each routed through its own owner pipeline; X/Z drag + yaw rotation handle (Shift = 15° snap); Y (elevation) is preserved, never edited in Plan; architecture stays read-only context. Passive dashed footprints in Layout mode with a hover "Edit in Arrange" bridge. (`Design-specs.md` §6/§29; P10.)
- Scene Plan is a true-to-scale drafting surface (bright paper-like background) — not a schematic.

### Scene 3D
- Object placement from the **Asset Library** (left panel tab): catalogue **Models** (categories + curation status), **Shapes** (primitives: box/plane/cylinder/sphere), **Lights** (point/spot/directional), **Textures**. Double-click or Place button starts placement; drop onto floor/room.
- **TransformControls gizmo** (Move/Rotate/Scale, independent + uniform scale), blue selection outlines (rotation-aware), multi-select, delete/duplicate.
- **Upper-right XYZ orientation box** (Scene 3D only) — view utility: click an axis/face to snap the camera view; never selects or mutates.
- **Materials/textures:** Inspector-driven material editing; texture registration from **Public URI**, **Local file** (session bytes, packaged on export), and **Cloud file** (upload to project registry — see §6 Assets); textures drag-and-drop onto entities; per-URI load states with Retry; recently-used list.
- **Undo/redo** is document-wide and deterministic: one completed gesture = one history entry.
- No hierarchy parenting/outliner tree beyond the flat project tree (rooms → objects); no grouping UI beyond clusters.

### Camera Plan
- Camera nodes sit at **real world positions** on the architectural plan (no separate graph coordinates); guided-sequence nodes numbered ① ② ③, **unsequenced** cameras shown with a distinct green-ring marker; **connections are undirected — no arrowheads ever** (topology ≠ playback order).
- **Timing is authored on the plan edge:** select a connection → per-direction duration (A→B / B→A) in Inspector; edge shows a timing label; bending the path recomputes length and derived speed while duration is preserved.
- Path anchors (interior curve handles) editable in X/Z; Y preserved.
- Sidebar Sequence Inspector: drag-only reorder (no order arrows); cameras move between Sequence and Unsequenced sections without deletion; validity rules (adjacent sequence nodes must be connected; invalid drops explain the missing connection). (`docs/Design-specs/Camera-flow-specs.md`.)

### Camera 3D
- Full 3D museum as context; selected camera shows pose gizmo, frustum (8–15% blue fill), look target + dashed look-at line, path spline + anchors; framing helpers (rule-of-thirds-style guide), FOV authoring, roll; progressive disclosure ("not every helper must always be visible" — `Shell-camera-workspaces.md` §10).
- POV ↔ Observer toggle for authoring from the camera's eye vs. a floating observer view.

### Timeline / Preview (Camera domain only; `EditorCameraTimelineFrame.svelte`)
The UX model in plain language:
- **Three preview scopes:** **Camera** (a single authored viewpoint — static pose, no fake time), **Edge** (one connection's movement, local time + scrub), **Sequence** (the whole guided tour, global time). Ordinary selection never changes scope; only explicit **Preview Camera / Preview Edge / Preview Sequence** actions install a scope. (P8/P11/P12 ratified contract, `docs/Design-specs/Shell-camera-workspaces.md` §12.)
- **Transport:** binary Play/Pause; Previous/Next jump between camera-node boundaries; Play at the end restarts at 0; no loop/repeat/reverse/stop chrome; Escape pauses without teardown; **paused/complete playback leaves the scene inspectable and editable** (authoring auto-pauses first).
- **Timeline presentation:** collapsed 48px "temporal mini-player"; expanded ~288px (240–300 resizable) with five visual lanes — Camera Path, Shots, FOV, Look At, Roll — projected from two backing data lanes; playhead scrubbing in the expanded ruler; tabular timecodes; keyframe glyphs are shape-coded (circle/diamond/square). Timeline is Camera-domain infrastructure: it survives Plan↔3D switches and disappears only when leaving Camera.

### Assets
- **Today:** built-in catalogue (models/shapes/lights/textures) + texture registration from public URI / local file / cloud file; local-file bytes are session-only and must be package-exported to persist. All placement/selection/history/transform paths are shared regardless of source. (`EditorAssetLibrary.svelte`.)
- **P20 project registry (✅ implemented locally, not live):** authenticated owned projects can upload PNG/WebP/JPEG (≤25 MiB, server-validated) to a **project asset registry** (metadata in Postgres, bytes in private Cloudflare R2); the scene references assets only by logical URI `/project-assets/{assetId}` — never a storage URL; upload → ready → "Use texture" → existing placement path. Cloud Save now blocks on non-durable (`/local/…`, package) references; durable conversion and automatic refresh/Load resolution remain planned for P20.3. No GLB import, no delete/GC, no provider search, no dedup yet. Built-ins create no registry rows. (`docs/plans/2026-08-19-P20-Project-assets-registry-R2.md`, `docs/plans/2026-09-03-P20.2-spatial-registry-integration.md`.)
- **Long-term:** one **project-level Asset Registry** shared by Spatial and Experience, with **Built-in / Upload / Online** as source filters over one system — never three stores (North Star; P20 S0 decisions).

### Persistence
- **Guest:** everything in-browser; project ID assigned at creation; plain JSON + portable package export/import.
- **Cloud:** Google OAuth gate → versioned immutable project saves (whole semantic `ProjectDocument` JSON); owned-project list; explicit Load; dirty-confirmation; first Save preserves the project's original ID (the local project *becomes* the cloud project — no identity rewrite).
- **Cloud Save blockers:** an active gesture/transaction, invalid layout geometry, unresolved texture bytes, non-durable texture references.
- No autosave, no offline-first persistence, no project thumbnails/folders/templates yet — explicitly out of scope (P19.4).

---

## 7. Project Hub and Project Shell today

**Both are deliberate scaffolding** — functional, minimal, and explicitly *not* the product design.

**Project Hub (`/projects`):** session check → two states only: guest (New Project + sign-in prompt, no fake list) or authenticated (flat "My Projects" list: name, version, Open; Sign out). Explicitly **not** implemented: folders, search, thumbnails, sorting UI, trash, favorites, teams, shared projects, templates, duplication.

**Project Shell (`/project/[id]/+layout.svelte`):** owns **only** app-level navigation — a thin bar with a Projects link, the project-id string, and a single **Spatial** nav item. Future mode entries (`Experience`, `Assets`, `Publish`) are *planned routes only*; the plan says they may be omitted or shown as clearly-unavailable placeholders later, and explicitly says **not to design inactive product surfaces now**. The shell deliberately does **not** own project name, save state, auth/session chrome, or any editor document state — those stay inside `EditorApp`'s Project menu until a second project-level workspace exists. (`docs/plans/2026-09-02-P19.4-editor-shell.md` §P19.4.2.)

**Consequence for you:** project name, save state, and account status currently live *inside the editor's Project menu* (a dropdown), not in the shell bar. This is a known temporary placement, not a design decision.

---

## 8. Long-term North Star (what the designer may plan *for*, without assuming it exists)

```text
Project
├─ Spatial      → today's editor: build + stage + direct (Scene|Camera × Plan|3D)
├─ Experience   → how visitors understand/navigate/react: Navigation · Content · Interactions
│                  (menu items reference real cameras; content panels; Event→Target→Action rules
│                   that listen to canonical camera events — never a second camera system)
├─ Assets       → one project-level asset registry (Built-in / Upload / Online as filters),
│                  consumed by Spatial and Experience alike
└─ Publish      → visitor-safe runtime + Experience UI + project data/assets → hosted URL,
                   embeds, downloadable builds (later)
```

Key long-term rules: **Experience references Spatial, never duplicates it** (no second scene, camera graph, path, or room model; a "Piano" menu item resolves to the existing authored camera and the canonical motion system moves the visitor; reduced-motion changes presentation only). **Assets belong to the project, not to a mode.** The authority flow: *Spatial authors world + movement → Experience observes/references → Interaction rules react to semantic events → one canonical visitor runtime executes*. (`docs/north-star.md` "Final conceptual hierarchy".)

---

## 9. UX/design philosophy already established

Extracted from the ratified specs (each claim cited):

1. **Professional 3D-editor density, not SaaS dashboard.** "The UI should feel closer to professional DCC / spatial editor than admin dashboard… world/content gets most space, controls stay dense" (`Design-specs.md` §39); 4px spacing grid, 8–10px control padding, panels edge-to-edge, "This is a dense authoring tool" (§12–13).
2. **Contextual controls instead of everything-at-once.** "Toolbar should expose workspace intent rather than every operation the underlying data model technically supports" (`Design-shell-specs.md` §16); per-workspace toolbars, progressive disclosure ("Not every helper must always be visible" — `Shell-camera-workspaces.md` §10), tree-row actions mostly on hover (§20).
3. **Persistent shell, changing workspace.** "The frame stays mounted. Workspace content changes." (`Design-specs.md` §36); the shell is the product's *capability boundary* — each workspace shows exactly what it may author, keeps context visible but inert, and preserves state across switches (`Design-shell-specs.md` §27).
4. **One shared interaction grammar.** Same selection language across Plan/3D/sidebar/Inspector/timeline; one blue accent system; same Inspector grammar everywhere (§19, §29); Scene/Camera × Plan/3D share the "what am I editing / what is context only" question (§27).
5. **Instant, unanimated shell transitions.** No fades on domain/view/sidebar/timeline swaps; hover/selection transitions are 100–160ms; `prefers-reduced-motion` honored (§30).
6. **Direct manipulation, one gesture = one undo.** "pointer down → gesture → live preview → pointer up → one committed command → one undo entry" (§32); Arrange movement is direct drag with a rotation handle, not a tool mode (`Shell-scene-workspaces.md` §6); custom gestures, no generic drag library dictating history semantics (§32).
7. **Reduced modal/blocking interaction.** Compact non-modal transport (P12); Escape pauses without teardown; the auth gate is a small inline dialog in the Project menu, not a forced sign-in wall (P19.4); minimal dialogs (material-choice decision only when a shared material needs splitting).
8. **Preserving inspection while paused/completed.** P12: selection never hijacks scope; paused previews leave the scene inspectable and editable (safe authoring auto-pauses first).
9. **CAD-like precision where useful.** Numeric Inspector fields with tabular numerals, X/Y/Z axis-colored labels, snap, metric units, dimensions, derived speed readouts (e.g. `speed = length ÷ duration`) (§6, §19, §27; `Shell-camera-workspaces.md` §9).
10. **Approachability for non-3D-professionals.** Guest-first entry, semantic construction tools (rooms/walls/openings, not mesh editing), "Start creating" in one click, no account required, curated catalogue with placement metadata (footprint/default scale), camera work expressed as viewpoints/paths/sequences rather than keyframe curves.
11. **Truthful UI.** No arrows on camera-graph connections (topology ≠ sequence); no fake timeline content for static camera scope; no Camera framing controls in Plan; unsequenced cameras visually distinct from sequenced; saved = green, unsaved = amber, errors = red; blue means selected/active — "color communicates state, not decoration" (§39, §10, §7).
12. **Product-specific graphics for product semantics.** Orientation cube, XYZ gizmo, camera node markers, path anchors, keyframe glyphs, and the brand mark are custom — not generic Lucide icons (§5). One icon family (lucide-svelte), one font (Inter Variable), no display font (§5–6).
13. **Bright Plan vs dark shell.** Plan is a deliberately bright drafting surface (`#F5F3EE`) against a dark blue-gray chrome; context objects render at 35–55% strength; Camera Plan's backdrop is slightly more subdued so camera topology is the foreground (§9).

---

## 10. Non-negotiable architecture constraints (translated for design)

These are *design traps to avoid*, not implementation trivia:

1. **One project, one Spatial world.** Never propose separate editor systems for different surfaces; Spatial stays `Scene | Camera` × `Plan | 3D` with Scene-Plan-local `Layout | Arrange` — don't rename or flatten these axes in IA proposals.
2. **Two documents, presented together.** `LayoutDocument` (architecture: rooms/walls/openings, room ownership) and `SceneDocument` (entities/materials/lights/cameras) are separate sources of truth. UI may present them together (the unified tree does), but don't design gestures that merge them — e.g., "move wall + furniture in one compound operation" would violate the one-gesture-one-document rule.
3. **Room-local transforms.** Scene-object transforms are relative to their room; moving a room moves its objects in world space while `SceneDocument` stays untouched. A future hierarchy/outliner UX must respect this (no world-space "parent room" hack).
4. **Exactly one camera/navigation system.** One camera graph, one route system, one motion evaluator. Anything labeled "camera", "tour", "route", or "navigation" in a design must resolve to the existing Spatial camera system — Experience cannot add another.
5. **One selection + one history.** No per-panel independent undo histories or selections; every completed gesture produces exactly one undo entry tagged to one owner document.
6. **One asset registry.** Built-in / Upload / Online are filters or badges over one project asset system, never independent "Spatial Assets / Experience Assets / Upload Assets" stores. Asset *source* is metadata, not a top-level navigation structure (North Star; P20 S0).
7. **Visitor/editor isolation.** The visitor runtime must stay free of editor session/auth/history/gizmo machinery. Any "preview" or "publish" surface must be planned as a separate runtime consuming safe project data.
8. **Plan never edits height.** Camera Plan and Scene Plan Arrange edit X/Z (+yaw); Y is authored 3D state, preserved and only shown read-only. Camera Plan never shows frustum/look-target/FOV/orientation controls; Scene Plan never shows the 3D gizmo or orientation box.
9. **Connections ≠ sequence.** The graph says where movement is *possible* (undirected, no arrows); the sequence says which connected path is the guided tour. UI must keep these visually and behaviorally distinct.
10. **The timeline belongs to Camera domain** — never design it as a Scene feature or a Camera-3D-only feature.
11. **Cloud capabilities are gated, authoring is not.** Design must keep guest authoring frictionless; auth UI should appear as a capability gate (Save, owned list, uploads) — not as a wall at entry.
12. **Technology reality:** SvelteKit + Svelte 5 + TypeScript + Threlte/Three.js (WebGL) with an SVG Plan renderer; the product must stay a web app with a live 3D viewport — no native-app assumptions; small-screen behavior is a responsive reflow of the same shell (EditorApp has 78rem/62rem/44rem breakpoints that stack panels), not a separate app.

Sources: `docs/north-star.md` "Sacred contracts" (1–12); `docs/architecture.md`; `docs/hand-off/CURRENT.md` "Non-negotiables"; `Design-shell-specs.md` §14–15, §23.

---

## 11. Open product/UX questions (unresolved — do not invent answers)

1. **Public introduction page:** nothing exists beyond a minimal entry card. What belongs there? (The North Star mentions future Landing/Examples/Guides surfaces, unscheduled.)
2. **Authenticated users and the introduction:** currently the entry page is identical for everyone (no session check); should signed-in users skip it to the Hub?
3. **Project Hub contents:** what makes a dashboard that feels like Canva/Figma-level ease without becoming generic SaaS? Folders/templates/thumbnails are all deferred — when and how?
4. **Project Shell contents:** what should the shell bar/container actually present — project name, save state, account, mode nav? Where do name/save/account chrome move when Experience/Assets/Publish arrive?
5. **Save/name/account state placement:** today it's inside the editor's Project menu (a dropdown); the shell deliberately avoids duplicating it. This is a temporary compromise — where should it live in the final IA?
6. **Assets placement:** should Assets be a top-level shell destination, a contextual editor panel, or both? (P20 keeps it contextual in the Spatial Texture tab; the final Assets surface is explicitly not designed.)
7. **Experience and Publish entry:** how do they enter the hierarchy (shell tabs? modes? later)? When?
8. **First-time guest vs returning creator:** the first-run experience is a blank editor booting to Scene → Plan with no onboarding. How much should empty/new projects teach the workflow (inline hints, sample content, guided first steps)?
9. **How much 3D-editor complexity immediately:** the full professional shell is exposed on entry. Where is the line between "approachable creative tool" and "dense DCC" for the entry experience?
10. **Templates/examples:** explicitly not implemented and unscheduled; when do they become useful?
11. **Mobile/small screens:** the editor reflows into stacked panels below 62rem/44rem but there is no touch design, and there's no statement of which platforms the product officially targets; how should limitations (if any) be communicated?
12. **"Preview Museum" is a trap:** the app bar's Preview link opens the *frozen Chopin demo*, not the current project. A real project-preview surface is planned with P22's Publish/visitor runtime (direction only) — the designer should treat the current link as temporary developer plumbing.

---

## 12. Reference-platform opportunities (external research, not codebase truth)

Useful product-flow patterns to investigate (as *flow* references only — do not copy visual identity):

- **Canva** — guest-first creation (start designing before sign-up), lightweight dashboard, template-first empty states, low-friction "create" entry.
- **Figma** — recent files vs drafts vs projects; the persistent app shell that swaps tool context per document type; auth and collaboration as an overlay on creation, not a wall.
- **PlayCanvas** — the closest structural analogue (web 3D editor): project hub → editor; editor chrome around a live WebGL viewport; publish/share as a first-class outcome distinct from authoring.
- **Webflow** — project-level shell with multiple authored surfaces (Designer/Content/Logic) over one project, and a publish surface that produces a hosted site; useful for thinking about Spatial/Experience/Assets/Publish navigation.
- **Unity Hub / Unity editor** — launcher vs editor separation; the lesson is mostly what *not* to do (heavyweight, installable, overwhelming), but the "project list → open in editor" mental model is worth studying.
- **Blender / DCCs** — only for density and direct-manipulation reference (gizmos, snapping, numeric input), never as the product's feel.

**Why the core artifact changes the flow:** Museum Editor's artifact is an *interactive spatial experience*, not a 2D document or a generic website. Consequences: (a) the center of the product is a live 3D viewport with a Plan counterpart, so dashboard/project-level surfaces must not pretend the artifact is a thumbnail you can fully grasp; (b) "preview" means *experiencing* the authored camera path — a first-class, playable surface, closer to PlayCanvas's preview than to Canva's static preview; (c) the authoring model is spatial + temporal (graph + sequence + timeline), which no 2D-creative-tool flow covers; (d) publishing produces a visitor-safe hosted experience, which keeps authoring machinery strictly out of the visitor surface.

---

## 13. Relevant source index (most important current files/docs)

**Product direction**
- `docs/north-star.md` — ratified product vision, project hierarchy, sacred contracts.
- `docs/architecture.md` — ownership boundaries, two lanes (editor vs frozen visitor), platform boundary.
- `docs/hand-off/CURRENT.md` — live working-tree status, gates, traps, non-negotiables.
- `docs/plans/README.md` — plan tracker with status of every P-number (P19/P20 current).
- `docs/plans/2026-09-02-P19.4-editor-shell.md` — guest-first entry, Hub, Shell scaffold, Save auth gate (the single best doc for the product flow).
- `docs/plans/2026-08-19-P20-Project-assets-registry-R2.md` + `docs/plans/2026-09-03-P20.2-spatial-registry-integration.md` — asset registry status and Spatial integration brief.

**Design specs (canonical UI contracts)**
- `docs/Design-specs/Design-specs.md` — the visual/UI design system (tokens, type, icons, spacing, Inspector, timeline, shell dimensions, final visual priorities).
- `docs/Design-specs/Design-shell-specs.md` — shell composition, workspace ownership, capability matrix, non-leakage rules.
- `docs/Design-specs/Shell-scene-workspaces.md` · `Shell-camera-workspaces.md` — per-workspace exposure contracts.
- `docs/Design-specs/Camera-flow-specs.md` — graph vs sequence mental model, preview behavior.
- `docs/Design-specs/Camera-layout-design.md` — Camera Plan backdrop/footprint design.
- `Design-png/README.md` + `Design-png/` — the canonical registered concept images.

**Code (current implementation truth)**
- Routes: `apps/editor/src/routes/+page.svelte`, `projects/+page.svelte`, `project/[projectId]/+layout.svelte`, `project/[projectId]/spatial/+page.svelte`, `editor/+page.svelte`.
- Shell: `apps/editor/src/lib/editor/app/EditorApp.svelte`, `EditorAppBar.svelte`, `EditorSidebar.svelte`, `StatusBar.svelte`, `CameraSidebar.svelte`, `PlanWorkspace.svelte`, `CameraPlanWorkspace.svelte`, `Workspace3DView.svelte`.
- Features: `EditorAssetLibrary.svelte` (Models/Shapes/Lights/Textures + Public/Local/Cloud sources), `EditorProjectMenu.svelte` (Save/Load/auth/export), `layout/LayoutDraftToolbar.svelte` + `LayoutPlanViewport.svelte` (Scene Plan), `camera/EditorCameraTimelineFrame.svelte` (Timeline), `editor-store.svelte.ts` + `store/texture-library-controller.svelte.ts` (capabilities/history/textures).
- Persistence: `apps/editor/src/lib/editor/project-persistence.ts`; tests `apps/editor/tests/lib/editor/project-persistence.test.ts`, `p20-s2-spatial-registry.test.ts`.

---

*Not a design proposal. Current styling of entry/Hub/Shell is temporary scaffolding. Spatial's `Scene | Camera` × `Plan | 3D` model and all ratified design-spec contracts remain authoritative until a future design process supersedes them.*
