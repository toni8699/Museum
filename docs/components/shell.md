# Shell and workspaces

**Read when:** app chrome, Scene/Camera switch, Layout mode, top bar, timeline frame, project menu.  
**Last reviewed:** 2026-08-19

---

```text
┌─────────────────────────────────────────────────────────────┐
│ Top bar — Scene|Camera · Plan|3D · Undo/Redo · Project      │
├──────────┬──────────────────────────────┬───────────────────┤
│ Left     │  3D viewport + tools         │ Inspector         │
├──────────┴──────────────────────────────┴───────────────────┤
│ Camera timeline — mounted in Camera domain only             │
├─────────────────────────────────────────────────────────────┤
│ Status — workspace · selection · save · hints · grid/snap   │
└─────────────────────────────────────────────────────────────┘
```

The shell is a domain×view matrix: `Scene | Camera` is the primary domain
switcher and each domain remembers its own `Plan | 3D` view. Domain changes
are attention-only (not document/history/world); view changes never change
domain. Camera owns the same timeline state in Plan and 3D.

Left-panel routing is transitional until P1.7: Scene 3D owns
`Hierarchy | Assets`; Camera mounts the unified tree as read-only environment
plus the live Camera Flow panel. Scene-only tabs, Assets, and Add Room never
appear in Camera. No empty Camera rail mounts over the viewport; workspace
actions stay in the contextual viewport toolbar except for the Camera Plan
toolbar (P1.5), which owns Select/View, Add Camera, Connect, and Grid/Snap.

**Camera → Plan (P1.5)** is the live top-down camera-graph authoring surface:
layers 1–5 of the shared Plan render model render the architectural backdrop
(subdued), and a Camera-authoring profile replaces the tour layers with every
topology edge (undirected, no arrows), nodes at resolved world X/Z with
`1…N` order labels or the free-node badge, relevant interior anchors,
selection/hover styles, and per-direction effective timing labels. Gestures:
Add Camera (room-floor hit → one committed free node), Connect (source node →
rubber band → destination commit), X/Z node drag, existing-anchor drag, and
direct path bend (edge drag inserts one interior anchor) — each a single scene
history entry via existing store commands; node/anchor Y is preserved exactly
and room ownership never silently changes. Camera Plan never writes a layout
selection: backdrop hits stay camera-domain only. The Plan inspector becomes
workspace-specific: Camera → Plan mounts the Camera Plan inspector (world X/Z,
flow order, connection timing with Forward/Reverse + authored/automatic
switching); Scene → Plan keeps its read-only gate for preserved scene/camera
selections.

| Workspace | Preview |
|-----------|---------|
| Scene | Preview Museum → `/museum` |
| Camera | Preview Tour → in-editor guided play |

Project menu: scene Import/Paste/Copy/Download/Reset + separate Layout JSON Import/Paste/Copy/Download/Reset section. Layout status + invalid-import feedback appear in menu, sidebar, inspector. Scene + layout replacement confirmations document-scoped; editor navigation + browser unload protect either dirty document. Undo/Redo enabled in Layout, shares one chronological stack with tagged scene/layout entries. Top-bar scene dirty badge scene-scoped. **No** automatic git Save.

Layout workspace chrome: viewport toolbar has Plan/3D, Select, Rect room, Polygon room, Plan Snap/Grid or 3D Ceiling controls. Plan Select room bodies move complete room units; selected rooms expose centroid rotation arm + Shift 15° snap. Right sidebar keeps layout status/counts visible, presents Place, Objects, Selection accordion sections; accordion state session-only. Room inspector rotation applies relative degrees, resets to zero.

Timeline: collapsed ~36px / open ~220–360px; Camera auto-opens and preserves
expanded state across Camera Plan/3D. Lanes: Guided Route · Camera Framing (no
independent Pos/Target/FOV curves).

Status bar is persistent and informational. Its save state aggregates scene
and layout dirtiness; Plan reads Plan grid/snap state and Plan navigation
hints, while 3D reads 3D grid/transform-snap state and 3D navigation hints.
