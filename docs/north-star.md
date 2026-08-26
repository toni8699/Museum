# North star — final product vision

**Read when:** choosing product direction, defining long-term scope, or reviewing
pitches. **Current implementation priorities and sequencing live in the
tracker:** [`plans/README.md`](./plans/README.md). Current behavior remains
canonical in the architecture/component/design contracts; this document
states the destination, not a claim that every capability already exists.

## Product vision

Build a web-native authoring platform for **interactive spatial experiences**.
The product should let a designer create the space, stage it, direct how a
visitor experiences it, add interactions, and publish the result to the web
without requiring external DCC tools, game-engine scripting, or deployment
knowledge for normal work.

The long-term product loop is:

```text
Build
  → Stage
  → Direct
  → Interact
  → Preview
  → Publish
  → revisit, collaborate, and continue editing
```

Representative outcomes include museums and exhibitions, architectural and
historical walkthroughs, spatial portfolios, product showrooms, educational
experiences, interactive stories, and other 3D-first web experiences. The
Chopin museum is a proving use case, not the product category.

The product should remain useful in an AI-heavy future. Human direct
manipulation, structured authoring, and AI/agent authoring operate on the same
semantic project model. AI may generate or revise large parts of an
experience, but the result remains inspectable, editable, constrained,
versionable, and publishable through the normal editor.

## Core authoring model

The editor remains organized around the explicit `Scene | Camera` and
`Plan | 3D` axes.

```text
Scene
├─ Plan
│  ├─ Layout   → build and refine spatial structure
│  └─ Arrange  → arrange movable authored content in 2D
└─ 3D          → author scene content, materials, lighting, placement

Camera
├─ Plan        → author spatial camera graph/topology and paths
└─ 3D          → author movement, framing, view intent, and experience
```

These are views of one project inside one persistent shell, not separate apps.
The shell may grow new contextual capabilities, but the domain/view model stays
coherent and does not become a collection of unrelated workspaces.

## Build — architectural authoring

Scene Plan grows from rough drafting into a practical architectural authoring
surface for constructing spaces that are good enough to experience directly.
The editor should support precise dimensions, snapping, rooms, walls, floors,
ceilings, openings, doors/windows, multi-floor structures, reusable components,
and progressively richer parametric operations where they materially improve
spatial construction.

Useful higher-level construction tools may include bounded profile/extrude,
revolve, sweep, mirror, arrays/repetition, curve-based walls, roof/stair
helpers, and similarly semantic operations. These extend `LayoutDocument` and
the single geometry compiler; they do not create a second mesh-authoring
system.

The product is **not** a general-purpose DCC replacement. Deep mesh topology
editing, sculpting, UV authoring, rigging, character animation, and bespoke
organic modeling remain better served by external tools and imported assets.

## Stage — scene composition and assets

Scene 3D owns scene-object composition: imported models, primitives,
materials, lights, placement, transforms, visibility, and authored object
properties. Scene Plan Arrange remains the 2D spatial counterpart for supported
existing objects without merging `LayoutDocument` and `SceneDocument`
ownership.

The finished product supports:

- one unified asset library for ready-to-place content
- built-in curated assets shipped with the product
- user uploads, including assets authored or downloaded elsewhere
- online search/import from supported asset providers
- reusable asset libraries and, later, marketplace/store workflows
- asset metadata such as dimensions, placement rules, provenance/license,
  thumbnails, optimization data, animation clips, and semantic capabilities
  where useful
- import/export or round-trip workflows with external 3D tools where useful,
  without making any external tool a prerequisite for normal users

Asset source is metadata and may become a filter; it is not a separate
scene-object system or a required top-level navigation structure. The three
source classes are intentionally broad:

```text
Built-in
Upload
Online
```

Once an asset is accepted into the editor, placement resolves through the same
Scene authoring commands, selection, transforms, history, packaging, and
publishing rules regardless of origin.

Assets may have different implementation forms while sharing the same library
and placement experience. Runtime-ready model representations may carry
normalized scale/pivot, metadata, thumbnails, and optional optimized/LOD
derivatives. Procedural assets keep semantic generator identity plus authored
parameters; generated geometry or cached/baked representations remain derived
runtime data, not authored project truth.

Procedural assets should be used where editable parameters are materially more
valuable than a frozen mesh. Layout-owned procedural construction must extend
`LayoutDocument` and the single canonical geometry compiler; Scene-owned
procedural assets remain Scene-domain entities/assets. Neither creates a
parallel geometry authority.

All byte-backed asset acquisition should converge on one canonical ingest
boundary:

```text
Built-in
Upload
Online
   ↓
validate → normalize → optimize → derive metadata/previews
   ↓
canonical Asset record + runtime representation
   ↓
normal editor placement
```

External tools, providers, generators, and file formats are replaceable
boundaries around this pipeline rather than durable project concepts.
Provider/tool-specific state must stop at adapter/import boundaries. Imported
records preserve provenance needed for safe reuse and publishing, including
source identity, creator, license, attribution, and source reference where
applicable. Credits/attribution should be derivable from project asset metadata
rather than maintained as unrelated manual text.

Generic mesh supply is not the product moat. The value is how assets become
structured, reusable participants in spatial authoring and interaction.

## Direct — experience and camera direction

The current camera graph remains the foundation and must not be replaced by a
second navigation or motion system.

The graph answers:

> Where can the experience move?

Sequence answers:

> Which connected traversal is the primary guided experience?

Long term, Camera authoring grows from camera sequencing into an
**experience-direction system** while preserving manual control as canonical.
A useful semantic model is:

```text
View / Shot
  → Transition
  → Attention Beat
  → Cue
  → optional Branch
```

A node remains a real authored viewpoint. A connection remains authored
spatial/topological work. Sequence remains an ordered traversal over existing
topology. Higher-level direction may describe intent such as a reveal, orbit,
push-in, rest, hero view, or establishing view; attention beats may direct the
visitor toward selected subjects during a transition; cues may coordinate
narration, audio, UI, or other experience actions.

Spatial transitions and editorial transitions can coexist. A connection may
represent continuous movement where appropriate; an explicitly authored cut,
fade, or similar editorial transition need not imply physical camera travel.
This extends the existing camera/experience model rather than introducing a
parallel timeline or navigation graph.

Manual position, path, target/orientation, FOV, timing, and framing remain
available. Assisted/automatic direction sits above those controls and must
resolve into the same inspectable project state. Users must be able to mix
manual and assisted path, framing, and timing rather than choosing one global
mode.

Longer-term experience flow may support multiple tours, optional branches,
conditional traversal, free exploration, and sensible rejoin/resume behavior.
Topology, sequence, and free navigation remain distinct concepts even when
combined in one visitor experience.

## Interact — semantic behavior authoring

The product gains a lightweight, typed interaction layer for common spatial
and web behaviors without requiring general-purpose application code.

The authoring grammar should stay close to:

```text
Event → Target → Action
```

Examples:

```text
Click → Piano → Play Audio → Nocturne
Click → Door → Open
Enter → Gallery → Play Narration
Reach → Camera C → Show → Painting Info
Sequence End → Main Tour → Show → Credits
```

Authoring should autocomplete from the actual project and from capabilities
supported by the selected object or asset. Invalid operations should be
rejected semantically rather than merely failing at runtime. Imported named
animation clips may surface as valid object actions.

The durable representation should be structured behavior data/AST or an
equivalent typed model that can be produced by text UI, visual UI, or AI. The
exact document ownership/schema is a future architecture decision and must not
be invented ahead of that work.

## Web experience layer

Published experiences may combine 3D content with ordinary web content where
that serves the experience: text, images, panels, buttons, links, audio/video,
forms, responsive overlays, and page/view navigation.

The product does not become a Figma/Canva-style 2D design suite or a general
web-code IDE. Graphics and rich media may be created externally and imported;
the editor owns how they participate in the spatial experience.

## Preview and publish

The finished product should make publishing a first-class outcome:

```text
Build → Preview → Publish → public URL
```

Publishing produces a versioned project snapshot consumed by a visitor-safe
runtime/player. Visitors do not receive editor session infrastructure such as
selection, history, gizmos, inspectors, authoring stores, or asset-management
UI.

The preferred architecture is one generic runtime plus project data/assets,
not one bespoke application deployment per project. Over time the platform may
support:

- hosted public URLs
- custom domains
- embeds
- downloadable/static web builds where the experience requires no private
  server capability
- platform-backed APIs for features that genuinely require server state

The portable project package remains important for ownership, import/export,
backup, migration, and local-first workflows even when hosted publishing is
available.

## Accounts, backend, and collaboration

Local-first project editing remains valid, but the complete product also
supports authenticated accounts and persistent cloud projects.

Cloud persistence wraps the same semantic project format; it does not replace
`LayoutDocument` / `SceneDocument` with a database-owned scene model.
Backend/platform concerns include users, projects, project membership,
versioned saves/published versions, asset metadata and storage references,
permissions, domains, and later collaboration/billing/marketplace concerns.
Large asset/media bytes and generated derivatives belong in blob/object storage
or equivalent asset infrastructure rather than project-document truth.

The asset platform should separate searchable catalogue/metadata from heavy
asset bytes and delivery. Asset metadata may include ownership, provenance,
license/attribution, dimensions, placement metadata, processing state, hashes,
and storage references. Heavy source/runtime files, textures, thumbnails,
optimization derivatives, and similar media belong in asset storage and may be
served through an appropriate delivery layer. `SceneDocument` and project files
reference stable asset identity rather than embedding backend records,
provider-specific state, or storage-vendor details.

Asset ingestion may use background processing for validation, normalization,
compression, texture processing, preview generation, optimization, and
deduplication. Built-in, uploaded, and online-imported assets should implement
the same canonical asset-record contract even when their acquisition mechanisms
differ. External provider, generator, DCC, and storage integrations remain
replaceable adapters rather than new project-document dependencies.

Long-term collaboration may add presence, shared editing, comments, and
version/history workflows. It must preserve deterministic project ownership,
selection isolation, and command/history semantics rather than introducing a
second mutable copy of editor truth.

The monorepo may evolve into separately deployable editor, visitor/player, and
backend surfaces while sharing renderer-neutral domain packages. Deployment
boundaries do not change project-document ownership.

## AI and agent surface

AI is a first-class authoring client, not a separate opaque generation mode.
Human UI actions and AI/agent actions should converge on the same semantic
commands and validation rules wherever practical.

Agent-facing APIs/MCP or equivalent interfaces should expose high-level
capabilities such as creating spatial structure, placing assets, editing
camera/experience flow, adding interactions, inspecting project state,
rendering/previewing results, validating constraints, checkpointing/versioning,
and publishing.

The platform should be discoverable as a good execution environment for tasks
such as interactive 3D websites, virtual exhibitions, architectural
walkthroughs, spatial portfolios, and guided experiences. High-level semantic
operations are preferred over forcing an agent to reproduce low-level pointer
work or raw transform math when the editor already understands the user's
intent.

AI-generated work must remain normal project state: inspectable, undoable or
versionable, permission-aware, manually editable, and subject to the same
architectural constraints. Generated assets must enter the same canonical
asset ingest, provenance, optimization, and placement pipeline rather than
introducing a parallel asset or scene format. AI must not bypass the canonical
geometry, selection, camera-motion, or persistence pipelines.

## Project truth

The existing ownership split remains foundational:

```text
Project
  ├─ layout   ← authored semantic architecture / parametric spatial structure
  └─ scene    ← entities, materials, lights, cameras and current scene-domain data

Portable package
  ├─ project.json
  ├─ project-local assets
  └─ referenced media/metadata
```

`LayoutDocument` and `SceneDocument` remain separate sources of truth. Unified
3D composes both. Room-local transforms remain authoritative where defined.
Generated geometry, Three objects, renderer handles, decoded runtime objects,
gizmo proxies, selection, hover/transient gesture state, and undo history are
not serialized as authored project truth.

Asset records and packages may reference source/provenance metadata and stable
asset identities. Optimized runtime models, generated procedural meshes,
previews, LODs, compressed textures, and similar derivatives remain replaceable
asset infrastructure; they do not become a third scene/layout authoring truth.

New durable domains such as interaction behavior, published-version metadata,
or collaboration metadata require an explicit ownership decision when their
implementation is designed; they must not be smuggled into existing documents
merely for convenience.

## Sacred contracts

1. **Semantic spatial authoring, not a general mesh editor.** Richer CAD-like
   and parametric construction extends the authored layout model and the single
   geometry pipeline; no parallel general-purpose mesh-modeling subsystem.
2. **One editor shell.** `Scene | Camera` over `Plan | 3D`, with Scene Plan
   local `Layout | Arrange`; one active authority for each interaction and no
   duplicate workspace-specific project truth.
3. **Separate document ownership.** `LayoutDocument` and `SceneDocument` stay
   distinct; Arrange may route to either owner without merging them. Room
   ownership is explicit and room-local transforms are preserved.
4. **One geometry compiler.** Plan and 3D derive authored layout geometry from
   `compileLayoutGeometry()` (or its evolved canonical successor), never from
   competing consumer-specific reconstructions.
5. **One camera graph/motion system.** Camera direction, assisted authoring,
   cuts/branches, previews, and AI authoring extend the canonical camera route
   and motion pipeline rather than creating a second navigation/motion model.
6. **Topology and Sequence stay different.** Connections describe possible
   movement; Sequence describes ordered guided traversal. Neither silently
   rewrites the other.
7. **Deterministic selection/history.** Selection identity is canonical across
   representations; one completed user/agent command or gesture produces one
   logical transaction/history result where history applies.
8. **Portable, versioned project truth.** Full-project import/export remains
   versioned and atomic. Account save, cloud persistence, publishing, and AI
   operate on the same project model instead of inventing incompatible copies.
9. **Visitor/editor isolation.** Published/visitor runtimes consume safe project
   data and runtime modules; editor session, selection, hierarchy, gizmo,
   import-management, and authoring infrastructure do not leak into the
   visitor surface.
10. **Greenfield product lane.** New projects start from the product editor's
    own format. The frozen Chopin visitor and legacy editor relic are not a
    migration source for editor selection/history/workspace state.

## Technology gates

Current production choices remain deliberate rather than ideological:

- SvelteKit + Svelte 5 + TypeScript remain the product/UI foundation while
  they fit measured requirements.
- SVG remains the Plan renderer and Three/Threlte the production 3D renderer.
- Backend, persistence, asset storage/delivery, auth, realtime, hosting, and
  external integrations are platform boundaries; vendor choice may change
  without changing project truth.
- External asset/tool integrations remain adapters into one canonical
  ingest/asset-record boundary; provider schemas, temporary URLs, file formats,
  and storage details do not become durable Scene/Project state.
- WebGPU/WGSL stays bounded until a real product or performance requirement
  justifies promotion.
- Rust/WASM requires an isolated CPU bottleneck and boundary-inclusive proof;
  it is not a default rewrite target.
- Shader/runtime implementation source does not become serialized authored
  project truth merely because the renderer uses it.
- Optimization work follows measured large-scene/runtime bottlenecks. Future
  needs may include instancing, LOD, culling/occlusion, streaming, asset
  optimization, and cached/baked procedural derivatives without changing editor
  ownership contracts.

## Permanent non-goals

- general-purpose DCC-style mesh editing, sculpting, UV authoring, rigging, or
  character-animation authoring as the normal editor workflow
- a second layout geometry compiler or consumer-owned architectural truth
- a second camera/navigation/motion graph competing with the canonical system
- persisting Three.js/renderer objects, generated geometry, gizmo state,
  selection, or transient editor state as project truth
- making deep code or game-engine scripting mandatory for ordinary spatial
  experiences
- becoming a general-purpose 2D design suite, BIM system, game engine, or CMS
  merely through feature accumulation
- migrating legacy/Chopin editor session state into the greenfield product

## Deferred scope is not a non-goal

The following may be valuable long-term even when intentionally absent from
current implementation slices:

- multi-story architecture and larger building/district workflows
- richer parametric architectural operations and terrain/roads/vegetation
- procedural asset libraries with editable parameters and cache/bake runtime
  derivatives
- canonical asset ingest/normalization, online-provider search/import, and
  provenance-aware project credits
- assisted or AI-generated layouts, staging, tours, framing, interactions, and
  complete first drafts
- multiple tours, branches, conditional experience flow, and free-roam rejoin
- typed interaction/behavior authoring
- account persistence, project dashboard, backend APIs, asset storage, and
  dedicated hosted editor
- collaboration, teams, permissions, comments, and version history
- asset marketplace/licensing and advanced external 3D-tool interoperability
  or round-trip workflows
- hosted publishing, custom domains, embeds, and downloadable web builds
- agent/MCP/API authoring and automated preview/validation loops

Absence from today's tracker means **not scheduled yet**, not rejected by the
product vision.
