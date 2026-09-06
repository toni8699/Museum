# North star — final product vision

**Read when:** choosing product direction, defining long-term scope, or reviewing
pitches. **Current implementation priorities and sequencing live in the
tracker:** [`plans/README.md`](./plans/README.md). **P21+ shell / Project Hub /
Visitor Preview target IA** (entry, project navigation, Row 1 / Row 2 chrome
placement, persistence presentation) lives in
[`Design-specs/Design-Plan(P21+).md`](./Design-specs/Design-Plan(P21+).md).
Current behavior remains canonical in the architecture/component/design
contracts; this document states the destination, not a claim that every
capability already exists.
**Ratified 2026-08-31:** the project shell has two primary creative modes —
**Spatial** (the current editor) and **Experience** (long-term direction) —
plus project-level **Assets** and **Publish** surfaces. Not-yet-built
capabilities here are direction only; nothing here claims they exist today.

## Product vision

Museum Editor is a web-native platform for authoring, directing, revising,
and publishing **interactive spatial experiences**. Creators compose and
direct the world in Spatial mode, then shape how visitors understand,
navigate, and interact with that world in Experience mode — all without
external DCC tools, game-engine scripting, or deployment knowledge for
normal work.

Build, Stage, Direct, and Experience are complementary authoring
capabilities, not a mandatory waterfall. A creator may import a space, start
from a template, start from assets or story/content, or skip heavy
architecture authoring. The conceptual loop is:

```text
Compose / Build
↔ Stage
↔ Direct
↔ Shape visitor experience
→ Preview / validate
→ Publish
→ Revise
```

Representative outcomes include museums and exhibitions, architectural and
historical walkthroughs, spatial portfolios, product showrooms, educational
experiences, interactive stories, guided experiences, and other 3D-first web
experiences. The Chopin museum is a proving use case, not the product
category. Guided exhibitions, showrooms, portfolios, and educational/guided
projects are candidate early validation examples — not the permanent
category boundary, and no market validation is claimed for any wedge.

The product is **not** a Blender replacement, a game engine, a BIM system, a
Webflow-style website builder, a general CMS, or a Figma/Canva-style 2D
design suite. Its value is the combination of **semantic spatial authoring +
experience direction + visitor-facing web UI + a portable, publishable
runtime**.

The product should remain useful in an AI-heavy future — not because AI
cannot build 3D (assume frontier AI can increasingly create geometry, stage
scenes, author lighting and cameras, write Three.js, operate DCC tools,
create interactions, debug, and deploy), but because stronger AI makes
reusable, tested behavior more useful: the model reuses capabilities instead
of rebuilding them. Museum Editor is not primarily a prompt-to-3D
generator. It is a reusable spatial experience authoring and execution
platform where AI is a client, not a separate generation mode. The pipeline
it owns is:

```text
human / agent intent
→ canonical spatial project
→ reusable semantic operations
→ inspect / revise
→ validation
→ visitor-safe runtime
→ publish
→ continue editing / revise later
```

The durable advantage must come from accumulated, tested reusable behavior
across composition, revision, validation, runtime, and delivery. Semantic
project state and operations make that reuse possible; they are not a moat
merely because they exist. Whether using this platform is cheaper and more
reliable than rebuilding equivalent infrastructure is a hypothesis to
measure, not a claim.

The goal: when a human or an AI is asked to build an interactive 3D museum,
showroom, portfolio, architectural walkthrough, or guided spatial experience,
the path through this platform's existing project model, architectural
primitives, scene staging, camera direction, runtime, and publishing system
should be worth preferring over regenerating a bespoke Three.js application
and its infrastructure. Humans and AI operate the same canonical project
behavior. External models and generators supply intent, meshes,
textures, worlds, and proposed arrangements; the product supplies structure,
operations, constraints, reuse, validation, runtime, and publishing. Generic
3D generation is replaceable upstream infrastructure: provider output always
enters through canonical ingest into project state, and provider identity
survives only as provenance metadata — never as a second project
architecture.

Human direct manipulation, structured authoring, and AI/agent authoring
operate on the same semantic project model, as two clients of one canonical
state:

```text
Human author → direct manipulation / structured authoring
AI agent     → semantic operations / inspection / validation
```

Both produce the same canonical project state. AI may generate or revise
large parts of an experience, but the result remains inspectable, editable,
constrained, versionable, and publishable through the normal editor. The
product is the reusable execution environment between user intent and a
published spatial web experience:

```text
Prompt / human intent
        ↓
Reusable authoring substrate
        ↓
Layout + Scene + Camera + Experience
        ↓
Validation
        ↓
Visitor runtime
        ↓
Published URL
```

## Project shell and modes

The long-term project shell has **two primary creative modes**:

```text
Project Shell
├─ Spatial
├─ Experience
│  ├─ Navigation
│  ├─ Content
│  └─ Interactions
├─ Assets
└─ Publish
```

`Spatial` and `Experience` are the two primary creative modes. `Assets` and
`Publish` are project-level supporting surfaces, not additional spatial
workspaces.

The `Experience` decomposition above (**Navigation · Content · Interactions**)
is conceptual future structure only. **Interactions are an authoring lens
within Experience, not a third project mode:** Experience is the
visitor-facing presentation/navigation/behavior-authoring surface, and
Interaction is the semantic behavior model that surface uses.

Conceptual product hierarchy:

```text
Account
└─ Workspace / Dashboard
   └─ Project
      ├─ Spatial
      ├─ Experience
      ├─ Assets
      └─ Publish
```

Spatial mode is the current editor and remains the core authoring system;
Experience mode is the long-term direction described below. The public product
may later include Landing, Examples / community projects, Guides / tutorials,
Sign in, and Dashboard surfaces; Landing and Dashboard entry surfaces are
reserved in the P21 tier (product shell + Project Hub), while Examples /
community projects, Guides / tutorials, and Sign-in surfaces are not
near-term roadmap work and are not over-designed ahead of schedule.

## Core authoring model — Spatial mode

Inside **Spatial mode**, the editor remains organized around the canonical
internal workspace model `Scene | Camera` over `Plan | 3D`:

```text
Spatial
├─ Scene
│  ├─ Plan
│  │  ├─ Layout   → build and refine spatial structure
│  │  └─ Arrange  → arrange movable authored content in 2D
│  └─ 3D          → author scene content, materials, lighting, placement
└─ Camera
   ├─ Plan        → author spatial camera graph/topology and paths
   └─ 3D          → author movement, framing, view intent, and experience
```

These are views of one project inside one persistent shell, not separate apps.
The shell may grow new contextual capabilities, but the domain/view model stays
coherent and does not become a collection of unrelated workspaces. This model
is **not** replaced or flattened by the project-level shell: `Scene | Camera`
and `Plan | 3D` remain the canonical axes inside Spatial mode, and existing
spatial domains are not renamed because a project shell now exists.

## Build (Spatial) — architectural authoring

Scene Plan grows from rough drafting into a practical architectural authoring
surface for constructing spaces that are good enough to experience directly.
P23 (Layout Depth) is explicitly staged: the first useful set favors
high-leverage spatial semantics — numeric placement/dimensions, stronger
snapping, alignment, better openings/doors/windows, duplicate/repeat of
supported structure, and simple reusable architectural primitives. Later
depth (stairs, railings, richer parametric components, curved-wall tooling,
profile/extrude, sweep, revolve, roof helpers, general constraint
sophistication) stays in the North Star as demand/evidence-gated follow-ups,
not prerequisites for the first Experience proof.

Every addition extends `LayoutDocument` and the single geometry compiler; they do not create a second mesh-authoring
system. Every addition flows `LayoutDocument` → `compileLayoutGeometry()` →
Plan + 3D, and stays `LayoutDocument`-owned — never promoted into Scene
merely because something renders in 3D.

Build capabilities should be expressible as deterministic domain operations
independent of their toolbar/button presentation wherever practical (see
Shared authoring operations). The strategic reason: semantic architecture is
reusable project structure that a human or an agent can request directly —
doors, stairs, alignment, duplication — instead of reconstructing arbitrary
geometry or code each time. P23 (Layout Depth) expands this Build vocabulary;
it does not add editor features for their own sake.

The product is **not** a general-purpose DCC replacement. Deep mesh topology
editing, sculpting, UV authoring, rigging, character animation, and bespoke
organic modeling remain better served by external tools and imported assets.

## Stage (Spatial) — scene composition and shared assets

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

All asset sources converge on **one canonical asset record / ingest boundary**;
a once-accepted asset resolves through the same placement, packaging, and
publishing rules regardless of origin. External tools, providers, generators,
and file formats are replaceable boundaries around that boundary rather than
durable project concepts. Imported records preserve provenance needed for safe
reuse and publishing, including source identity, creator, license, attribution,
and source reference where applicable. Credits/attribution should be derivable
from project asset metadata rather than maintained as unrelated manual text.

Generic mesh supply is not the product advantage by itself. The value is how
assets become structured, reusable participants in spatial authoring and
interaction, with tested integration and useful feedback — validation itself
is not the moat.
structured, reusable participants in spatial authoring and interaction.
Scene staging becomes structured project state that can be inspected,
edited, reused, and validated rather than bespoke rendering code generated
per project. Lighting stays `SceneDocument`-owned scene/staging truth —
authored light types, properties, and presets — and must not become
shell/global configuration merely because it affects the whole rendered
scene. Provider and generator output always enters through the canonical
Asset Registry ingest into normal project operations; provider identity may
survive as provenance metadata, but the provider is replaceable and never
becomes project architecture. P24 (Scene / Staging Depth) is explicitly
staged: the first useful set favors durable asset placement/replacement,
duplicate, strong transforms, multi-select where justified,
alignment/distribute, floor/wall placement, material editing, core authored
lighting, and one useful reusable lighting/environment setup. Later depth
(advanced grouping, richer placement tools, a larger environment catalogue,
richer lighting rigs, advanced material workflows) follows evidence; it does
not block the first Experience proof. P24 expands this Stage vocabulary; it
does not add editor features for their own sake.

**Assets belong to the project, not a mode.** Long-term, assets are a
project-level shared resource system consumed by both modes through one
project asset registry:

```text
Project Asset Registry
        ↓
   ┌────┴─────┐
Spatial    Experience
```

Categories may include **3D** (GLB/models, procedural/built-in assets,
materials, textures), **Media** (images, audio, video), and **Presentation**
(logos, thumbnails, visitor UI media). The same asset may be consumed in
multiple contexts: `piano.glb` in Spatial; `portrait.webp` as a Spatial
texture **and** an Experience info panel; `nocturne.mp3` in a spatial
interaction **and** Experience audio/content; `logo.svg` in Experience UI.
There is **no** independent Spatial and Experience asset store. The current
Spatial asset library remains available contextually, but long-term it is a
filtered/contextual view over the shared project registry; Experience may
invoke the same picker filtered toward images/audio/video. User-wide reusable
assets ("My Assets" → add/reference into Project Assets) are deferred;
project-local shared project asset management is the near-term model. The
three broad source classes above remain intact — file-backed (GLB, images,
audio, video), built-in/procedural with no object-storage object, and
provider-imported with provenance/license metadata — and object storage
remains for heavy bytes only; procedural assets are not forced to pretend to
be GLBs.

## Direct (Spatial) — experience and camera direction

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
visitor toward selected subjects during a transition. **Cues are semantic
temporal markers emitted by the authored camera flow, not visitor-action
bindings.** Experience interactions may listen for those cue events and bind
narration, audio, UI, or other visitor-facing actions to them. Spatial Camera
therefore owns where/when a cue occurs; Experience Interaction owns what
happens in response.

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

That agents can increasingly stage cameras themselves does not obsolete this
system — it raises its value. Generated camera intent resolves into
inspectable, editable, reusable, validated, runtime-compatible canonical
camera state: one camera graph, one route system, one motion evaluator, with
topology vs Sequence kept separate and Plan/3D parity preserved. Experience
references Camera rather than duplicating it. Camera is the Direct
vocabulary of the reusable substrate, alongside the Build (Layout) and Stage
(Scene) vocabularies.

Longer-term experience flow may support multiple tours, optional branches,
conditional traversal, free exploration, and sensible rejoin/resume behavior.
Topology, sequence, and free navigation remain distinct concepts even when
combined in one visitor experience. The current physical Sequence
representation (ordered links stored on nodes) is retained until multiple
tours or repeated node occurrences create a concrete requirement; any such
migration stays inside the existing Camera domain with one route system and
one motion evaluator. Room-based scope remains current; if future
imported/outdoor/world workflows become important, coordinate/ownership
evolution is explicit future architecture work — no current rewrite.

## Experience mode — how visitors understand and navigate the world

Experience mode is a distinct **project-level authoring surface** around the
same spatial project. It answers:

> How does the visitor understand, navigate, and interact with the authored
> spatial experience?

It exists specifically to make spatial experiences complete and usable on the
web. It is **not** a general website builder; the product does not compete
with Webflow, Figma, Canva, general HTML/CSS editors, CMS platforms, or
traditional landing-page builders.

Representative future capabilities:

```text
Experience
├─ Navigation
│  ├─ collapsible side menu
│  ├─ room / section lists
│  ├─ headings / groups
│  └─ destinations
│
├─ Content
│  ├─ titles
│  ├─ subtitles
│  ├─ descriptions
│  ├─ images
│  ├─ info panels
│  └─ links / actions
│
└─ Interactions
   └─ Event → Target → Action
       references Spatial + Assets
```

**Experience and Interaction are distinct, not overlapping.** Experience is the
surface: navigation, content, and visitor-facing UI (including visitor-safe
settings such as guided/free navigation, motion/reduced-motion, and audio
controls). **Interaction is the semantic behavior model that surface uses** —
structured `Event → Target → Action` rules. Interaction is an authoring lens
within Experience, not a catch-all owner for visitor UI, camera data, scene
objects, or assets.

Example: a visitor enters the 3D experience, moves to the Paris room, moves
toward the piano/table, an info panel appears, clicks **Learn More**, and opens
an internal or external destination. A collapsible menu (Introduction · Early
Life · Paris Room · Piano · Final Years) may reference existing authored
cameras or spatial destinations. Concretely:

```text
Experience / Navigation:  "Piano" menu item → Camera Piano
Experience / Content:      Piano Info = title + subtitle + image + Learn More
Interaction model:          Reach Camera Piano → Show Piano Info
```

Navigation defines where the visitor can go. Content defines what can be
presented. Interaction defines when or why an action occurs.

Experience (P25) begins once P23/P24 have produced a minimum useful authored
environment — before their optional depth tails — not after broad Build +
Stage completion:

```text
P23 minimum useful Build set
        +
P24 minimum useful Stage set
        ↓
P25 narrow complete Experience foundation
        ↓
bounded agent + reuse proof
        ↓
evidence-led deeper P23/P24/P25 capabilities
```

P23 and P24 remain separate ownership domains; the change is
sequencing/depth, not ownership. The first Experience proof is deliberately
narrow (destination + visitor navigation + contextual content + a small
semantic trigger/action set with visitor-safe motion/accessibility
behavior).

Its future
`Event → Target → Action` model composes existing project meaning rather
than compensating for missing Spatial capabilities. No `ExperienceDocument`
schema is invented now; persistence ownership stays deferred as stated under
Project truth.

## Same world, different authoring lens

Spatial and Experience operate on the **same project, the same 3D world, the
same cameras, the same assets, and the same runtime** — they expose different
authoring lenses over that shared truth:

```text
same project · same scene · same cameras · same assets · same runtime

        ↓

different authoring surface / authority
```

Spatial authors spatial truth; Experience authors how the visitor reacts to and
navigates that truth. Experience does **not** require an independent renderer or
an alternate scene. A future Experience workspace may reuse the visitor-safe /
editor preview of the same 3D project while placing different authoring UI
around it:

```text
Experience
[Navigation] [Content] [Interactions]

┌──────────────┬──────────────────┬──────────────┐
│ Interaction  │    3D Preview    │ Inspector    │
│ tree / rules │                  │              │
│              │ same project     │ Event        │
│ Gallery      │ same cameras     │ Target       │
│  Enter       │ same assets      │ Action       │
│   → Narrate  │                  │              │
└──────────────┴──────────────────┴──────────────┘
```

This is **not another 3D workspace authority** — it is another authoring
surface over the same project state. Do not create `ExperienceScene`,
`ExperienceCameraGraph`, `ExperienceCameraPath`, `ExperienceRenderer` truth, or
equivalent duplicates.

## Spatial camera authority vs Experience interaction authority

**Spatial → Camera is the sole authority** for authored camera and path truth:

```text
camera node pose        path geometry / anchors
connection topology     sequence
transition duration     camera target / orientation
FOV                     framing
camera / path spatial editing
```

Experience interactions may **reference and observe** this authored state, but
they must not become another camera editor. For example, Experience may display
read-only values and react to the canonical timeline:

```text
Transition: Gallery Entrance → Piano

Duration      5.2 s       read-only
Path length   12.4 m      read-only
```

```text
At 60% of transition → Show Piano title
```

Changing path shape, path anchors, camera pose, transition duration, FOV, or
framing must route the author back to **Spatial → Camera → Plan / 3D**. A
future Experience surface may expose an action such as **Edit Camera Path ↗**
that switches to the canonical Spatial Camera surface and preserves the
relevant camera/connection selection where practical — it does not duplicate
the editing controls in Experience.

**Experience references Spatial; it never duplicates it.**

```text
Spatial
creates spatial project truth

        ↓ references

Experience
creates visitor-facing navigation and presentation
```

An Experience menu item such as "Piano" resolves to an existing camera / room /
authored destination, and the **canonical camera/navigation pipeline executes
the movement**. Experience mode must not create duplicate camera positions,
camera graphs, camera sequences, camera paths, room definitions, scene
objects, or layout geometry. The hard architecture rule:

```text
Experience navigation intent
→ canonical spatial navigation / camera system
```

Never:

```text
Experience UI
→ independent XYZ/FOV interpolation
```

There remains **one camera graph, one route system, and one motion evaluator**.
Interaction triggers that depend on camera reached, transition progress, cue
reached, or sequence completion derive those events from this canonical
camera/runtime evaluation — never an independent Experience camera.

**Motion accessibility changes presentation, not spatial truth.** Reduced /
no-motion visitor preferences affect transition presentation only:

```text
Normal:
Piano menu item → authored motion transition → Camera Piano

Reduced motion:
Piano menu item → cut / reduced transition → same Camera Piano
```

No alternate camera graphs and no duplicate destination state are created for
accessibility.

## Interaction and behavior authoring

Interaction is the underlying **semantic behavior model** of the Experience
surface. The product gains a lightweight, typed interaction layer for common
spatial and web behaviors without requiring general-purpose application code.
Experience may expose these rules through visual/structured authoring UI; the
interaction layer provides the behavior underneath.

The authoring grammar stays close to:

```text
Event → Target → Action
```

Examples (audio/media selected from the shared project asset registry):

```text
Enter → Gallery → Play Audio → gallery-narration.mp3
Click → Piano → Play Audio → nocturne.mp3
Reach → Camera C → Show → Painting Info
Cue Reached → Piano Reveal → Show → Piano Info
Sequence End → Main Tour → Show → Credits
```

**Prefer semantic triggers** that refer to authored project meaning over raw
seconds:

```text
Enter Room / Leave Room     Sequence Start / End
Reach Camera                Transition Start / End
Cue Reached                 Click Object
```

Advanced temporal triggers may come later where useful (for example `At 60% of
transition` or `At 2.5 s into transition`), but they must evaluate against the
**canonical authored transition/timeline**, never a copied copy:

```text
Spatial transition duration = 5 s
Interaction: at 60% → fade narration in → evaluates at 3.0 s

Spatial duration later changes to 8 s
same 60% interaction                 → evaluates at 4.8 s
```

The interaction stores/references semantic or relative timing according to its
eventual contract; it must not silently copy camera timing into a second source
of truth. No persistence representation is defined now.

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
forms, responsive overlays, and page/view navigation. In the long-term model
this surface is authored in Experience mode.

The product does not become a Figma/Canva-style 2D design suite, a general
web-code IDE, a Webflow-like website builder, or a traditional landing-page
builder. Graphics and rich media may be created externally and imported; the
editor owns how they participate in the spatial experience.

## Preview and publish

The finished product should make publishing a first-class outcome:

```text
Build → Preview → Publish → public URL
```

Published output combines the **visitor-safe spatial runtime + Experience UI
+ project data/assets**. A published experience may contain menus, contextual
titles, info panels, links, audio controls, motion preferences, and navigation
controls. Visitors never receive editor session infrastructure: selection,
undo/redo, gizmos, Inspector, editor shell state, authoring stores, or
asset-management UI. Visitor/editor isolation stays strict. The eventual
proof is a cold visitor runtime: published project/version + closed asset
resolution + visitor bootstrap loading in a fresh browser into the visitor
experience, without requiring `EditorApp`, editor stores, selection,
history, gizmos, or editor-only asset setup.

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

Strategically, publishing establishes the reusable execution target for
every human-authored or agent-authored project: canonical project →
deterministic asset resolution → visitor-safe runtime → published version →
URL. That closed loop is what lets future agents validate and finish work
instead of stopping at generated files.

## Developer and export direction

The same authored project should eventually support multiple consumption
levels:

```text
Non-developer
→ hosted Publish

Developer
→ downloadable / static web build

Experienced developer
→ project package + runtime SDK

Advanced integration
→ headless runtime + project data
```

Conceptual portable package:

```text
project package
├─ project.json
├─ asset manifest
└─ project-local assets
```

A future runtime SDK / headless runtime should let an external
React/Vue/Svelte/Next/Astro (etc.) application load the project, navigate to
an authored destination, play/pause a sequence, set a motion preference, and
listen for semantic events — conceptually `runtime.goToCamera(...)`,
`runtime.goToRoom(...)`, `runtime.playSequence(...)`, `runtime.setMotion(...)`,
`runtime.on('cameraReached', ...)`. **None of this SDK is defined or
implemented now.**

The rule for all developer integration: it consumes the **same visitor-safe
runtime and canonical spatial systems**. It never exports editor internals and
never requires developers to reproduce camera interpolation. Authored
Experience UI is optional for developers — use the product's visitor UI,
override/style it, or ignore it and build a custom application UI.

## Accounts, backend, and collaboration

Local-first project editing remains valid, but the complete product also
supports authenticated accounts and persistent cloud projects.

Cloud persistence continues to wrap the canonical project document rather than
replacing it:

```text
project_versions
→ versioned ProjectDocument JSONB
```

The database owns users, projects, project versions, asset
metadata/references, ownership/permissions, and later published versions.
Heavy files (GLB, textures, images, audio, video, later generated
derivatives) live in object storage. The editor is never normalized into
relational `walls` / `scene_objects` / `camera_nodes` / `path_anchors` tables
unless a later concrete requirement justifies separate queryable metadata.
Future project schema versions may extend the versioned envelope with
`experience`, which does not require Experience-specific database tables now.

Identity stays external: an external identity provider proves/authenticates
identity, while the Museum Editor backend owns the application session and
product authorization. Fastify + Postgres own project ownership/permissions —
who may open, edit, or publish a project. The identity provider never becomes
the canonical project-permission model, and the North Star does not overfit
to any single provider's implementation.

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
second mutable copy of editor truth. Versioned Save is not conflict
detection: before simultaneous human/agent writers are supported, an
explicit stale-write/revision-precondition design is required. No CRDTs.

The monorepo may evolve into separately deployable editor, visitor/player, and
backend surfaces while sharing renderer-neutral domain packages. Deployment
boundaries do not change project-document ownership.

## AI and agent surface

AI is a first-class authoring client, not a separate opaque generation mode.
Human UI actions and AI/agent actions should converge on the same semantic
commands and validation rules wherever practical.

The explicit agent loop is:

```text
inspect
→ propose
→ apply semantic operations
→ preview
→ validate
→ refine
→ checkpoint/version
→ publish
```

The preferred agent surface is high-level semantic operations — not:

* arbitrary raw project JSON mutation
* generated Svelte component trees
* direct Three.js object mutation
* pointer-level UI automation when a semantic operation exists
* arbitrary JavaScript/Python execution as the primary product API

Low-level escape hatches may exist eventually, but they are not the canonical
authoring contract. Repeated, stable semantics with demonstrated
reuse/demand are candidates for reusable primitives — not everything an AI
happens to generate twice.

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

After P22 plus the minimum P23/P24 slices plus a narrow P25 visitor journey,
the roadmap calls for a bounded agent/reuse proof — testing whether a
strong agent can inspect a project and make semantic edits, stage, author
camera/experience changes, validate, preview, publish, and perform a
requested revision through the same canonical behavior as human authoring —
before broad platform expansion. The first proof exposes only a small useful
set of existing/extracted operations; transport (in-process TypeScript, MCP,
REST, WebMCP) stays replaceable per client need. No custom planner, chat UI,
generic agent framework, four transports, or large MCP surface is required
for that proof.

## Shared authoring operations (future direction)

Human UI and Agent/API should become clients of the same deterministic
authoring behavior:

```text
Human UI ─────────┐
                  │
Agent / API ──────┼→ Semantic Authoring Operations
                  │          ↓
Import/provider ──┘     Project documents
                             ↓
                    canonical compilers/runtime
```

The direction: new authoring capability should be expressible as a
deterministic domain operation independent of its toolbar/button presentation
wherever practical. Conceptually (names illustrative only — no such generic
framework is claimed to exist):

```ts
createOpening(...)
setLayoutObjectTransform(...)
alignLayoutObjects(...)
placeAsset(...)
setSceneTransform(...)
createLight(...)
setLightProperties(...)
createCamera(...)
connectCameras(...)
setCameraCurve(...)
setSequence(...)
setShot(...)
```

No complete generic command framework is claimed to exist today, and none is
created now. Extract domain operations incrementally as real P23/P24/P25
capabilities require them: semantic intent → explicit inputs →
validation/preconditions → deterministic candidate/mutation → one
transaction/history result → render/runtime. Before any future
implementation plan extracts one, the implementation agent must
inspect the current mutator/store/history abstractions and reuse them where
appropriate; only the abstraction that current code pressure justifies gets
extracted. UI remains one client of domain behavior, never its sole owner —
that is what later makes an agent API inexpensive instead of requiring a
second implementation of the editor. An agent must not need to change human
selection merely to mutate project state. Current history supports separate
Layout/Scene domain entries; when the first real multi-domain operation
(Layout/Scene/Camera/Experience) requires it, construct the complete
candidate, validate it, and apply it atomically — do not pretend several
independent commits are already one transaction. No CRDT/event sourcing.

## Project truth

The existing ownership split remains foundational:

```text
Project
  ├─ layout      ← authored semantic architecture / parametric spatial structure
  ├─ scene       ← entities, materials, lights, cameras and current scene-domain data
  └─ experience  ← future ownership boundary only — visitor navigation, contextual
                   content, visitor-facing UI configuration, presentation preferences

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

`ExperienceDocument` is a **future ownership boundary only** and is not
defined yet: no concrete TypeScript schema, no codecs, no migrations, no
backend endpoints, and nothing in the current backend slices. Ratifying that
**Interaction authoring lives under Experience** (product/UI ownership) does
**not** determine persistence/document ownership. The durable interaction
representation remains an explicit future decision — possibly
`ExperienceDocument └─ interactions` or a sibling `Project └─ interactions`
domain; this direction chooses between neither and no schema is pre-designed
now.

## Sacred contracts

1. **Semantic spatial authoring, not a general mesh editor.** Richer CAD-like
   and parametric construction extends the authored layout model and the single
   geometry pipeline; no parallel general-purpose mesh-modeling subsystem.
2. **One Spatial editor shell.** Inside Spatial mode, `Scene | Camera` over
   `Plan | 3D`, with Scene Plan local `Layout | Arrange`; one active authority
   for each interaction and no duplicate workspace-specific project truth. The
   project-level shell adds Experience / Assets / Publish surfaces without
   renaming or flattening these canonical axes.
3. **Separate document ownership.** `LayoutDocument` and `SceneDocument` stay
   distinct; Arrange may route to either owner without merging them. Room
   ownership is explicit and room-local transforms are preserved.
4. **One geometry compiler.** Plan and 3D derive authored layout geometry from
   `compileLayoutGeometry()` (or its evolved canonical successor), never from
   competing consumer-specific reconstructions.
5. **One camera graph/motion system.** Camera direction, assisted authoring,
   cuts/branches, previews, AI authoring, and **Experience navigation /
   interaction intent** resolve through the canonical camera route and motion
   pipeline rather than creating a second navigation/motion model. Experience
   UI never performs independent XYZ/FOV interpolation. Interaction triggers
   (camera reached, transition progress, cue reached, sequence completion)
   derive from this one evaluation, never an independent Experience camera.
   Spatial Camera may emit semantic cue markers; Experience Interaction owns
   the visitor-facing action binding to those cue events.
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
11. **Experience references Spatial — never duplicates it.** Experience
    authoring binds to existing cameras, rooms, and authored destinations and
    composes visitor-facing navigation/presentation; it never creates
    duplicate camera positions, graphs, sequences, paths, room definitions,
    scene objects, or layout geometry, and it never edits camera/path/timing
    truth. Interactions are an Experience authoring lens, not a separate mode.
    Motion/reduced-motion preferences change transition presentation only,
    never spatial truth or destination state.
12. **Assets belong to the project, not a mode.** One shared project asset
    registry serves both Spatial and Experience; no independent per-mode
    asset store and no second asset/ingest pipeline.
13. **One semantic authoring path per intent.** Human UI, automation, and
    future agent/API clients converge on the same validated project mutation
    semantics wherever practical. Agent authoring must not create a parallel
    Scene/Layout/Camera representation, bypass document ownership, or
    produce a second history model. This coexists with contract 7: one
    completed user/agent command or gesture produces one logical
    transaction/history result where history applies.

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
- becoming a general-purpose 2D design suite, BIM system, game engine, CMS,
  Webflow-style website builder, or landing-page builder merely through
  feature accumulation, or competing with Figma/Canva as a 2D design suite
- a generic AI agent framework, or training a proprietary general 3D/world
  model — external models, generators, and agent intelligence stay
  replaceable clients/suppliers, welcome through supported ingest
- Experience mode duplicating camera, geometry, room, or scene-authoring
  systems instead of referencing Spatial truth (including separate Spatial
  and Experience asset stores)
- migrating legacy/Chopin editor session state into the greenfield product

Use this test before expanding authoring depth: does this capability
describe, compose, direct, or validate a spatial web experience at a
reusable semantic level? Good candidates include walls, openings, doors,
stairs, platforms, dimensions, alignment, asset placement, lighting, camera
shots, and interactions. Likely upstream/external-tool territory includes
mesh topology editing, sculpting, retopology, UV editing, rig authoring,
general character animation, arbitrary shader/node DCC work, and
general-purpose geometry modeling. Imported or generated results from those
systems are welcome; the product simply does not own their authoring
workflows.

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
- Experience mode: project shell surface, `ExperienceDocument` design, visitor
  menu authoring, destination bindings, contextual titles/info cards, visitor
  preferences, and reduced-motion behavior
- Experience asset picker over the shared project registry
- developer runtime SDK and headless runtime integration
- user-wide reusable assets ("My Assets")
- account persistence, project dashboard, backend APIs, asset storage, and
  dedicated hosted editor
- collaboration, teams, permissions, comments, and version history
- asset marketplace/licensing and advanced external 3D-tool interoperability
  or round-trip workflows
- hosted publishing, custom domains, embeds, and downloadable web builds
- community/gallery ecosystem (Landing, Examples, Guides, Sign in, Dashboard)
- agent/MCP/API authoring and automated preview/validation loops
- domain-level validation and observability for authoring and agent loops
  (constraint checks, spatial facts, camera/route integrity, performance
  signals) — established incrementally as P23/P24 primitives grow, not as a
  giant validator subsystem now
- reusable presets and experience kits (gallery rooms, lighting setups,
  pedestals, camera reveals, inspection shots, tour segments, staging
  presets, interaction recipes) that resolve into normal project primitives
  and operations rather than opaque generated blobs — reuse lowers agent
  tool calls, tokens, latency, and failure surface

Absence from today's tracker means **not scheduled yet**, not rejected by the
product vision. Experience-mode work stays unscheduled until persistence and
Spatial completion land; no Experience implementation tickets are created
ahead of that.

## Agent-readiness acceptance direction

Future architectural acceptance principles — not claims that they all pass
today:

1. A human UI action and an equivalent headless semantic operation produce
   the same authored document delta.
2. One completed operation produces one logical transaction/history result
   where history applies.
3. Layout operations mutate `LayoutDocument`; Scene operations mutate
   `SceneDocument`; cross-document operations require an explicitly designed
   atomic contract rather than accidental side effects.
4. Plan-level transforms preserve state owned exclusively by 3D authoring.
5. Room-local ownership/transforms remain explicit and are never inferred
   merely from coordinates.
6. Camera operations reuse the canonical route/motion system.
7. Generated assets enter the existing Asset Registry/ingest path.
8. Visitor runtime consumes project truth without editor
   selection/history/gizmo/session infrastructure.
9. Validation can run without requiring UI pointer interaction.
10. Project changes remain serializable/versionable and contain no
    renderer/Three objects.

## Strategic success test

The AI/reuse thesis is falsifiable. Eventually compare the same capable
model, same brief, same assets, and same acceptance criteria on project
types such as gallery/exhibition, product showroom, spatial portfolio,
guided educational experience, or architectural walkthrough, against:

```text
A. Museum Editor / canonical operations
B. strong reusable-code / Three.js starter baseline (not generate-from-zero)
```

Measure revisions as well as first creation: total time/intervention to
accepted published result, total cost/failed attempts, revision correctness
plus unrelated regressions, cold publish/runtime success, manual
continuation/editability, and reuse in a second project. Do not invent
numeric wins — no 2×/3×/10× savings are claimed until measured. These are
strategy metrics, not current release gates.

## Final conceptual hierarchy

The north star converges on:

```text
Public Product
├─ Landing / Learn / Community            future
└─ User Workspace
   └─ Project
      │
      ├─ Spatial
      │  ├─ Scene
      │  │  ├─ Plan → Layout | Arrange
      │  │  └─ 3D
      │  └─ Camera
      │     └─ canonical spatial / path / timing authority
      │
      ├─ Experience                      future
      │  ├─ Navigation
      │  ├─ Content
      │  └─ Interactions
      │       └─ Event → Target → Action
      │           references Spatial + Assets
      │
      ├─ Assets
      │  └─ shared project asset registry
      │
      └─ Publish
         ├─ visitor-safe runtime
         ├─ hosted project version
         └─ export / integration later
```

The authority flow:

```text
Spatial authors world + movement
          ↓
Experience observes / references that truth
          ↓
Interaction rules react to semantic events
          ↓
canonical visitor runtime executes the result
```

**Same project, same world, same cameras, same assets, same runtime —
different authoring lenses. Spatial defines spatial truth; Experience defines
how the visitor navigates, understands, and reacts to it. Assets and
publishing belong to the project, and all surfaces operate on one portable
project truth.**
