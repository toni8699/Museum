# Shell and workspaces

**Read when:** app chrome, Scene/Camera switch, Layout mode, top bar, timeline frame, project menu.  
**Last reviewed:** 2026-08-23 (P9)

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

The shell is a domain×view matrix over **one shared `Plan | 3D` view axis**
(P1.7): `Scene | Camera` switches domain; a `Plan | 3D` switch applies to
both domains; a domain switch never snaps the view (boot: Scene → Plan).
Domain changes are attention-only (not document/history/world); view changes
never change domain. Camera owns the same timeline state in Plan and 3D.

Camera mounts the four-section `CameraSidebar` (Environment · Sequence
Inspector · Unsequenced · Connections). Environment is read-only. Per-camera
chevrons expose a component-local flat accordion of directly connected
Unsequenced sidequests; ordered Sequence neighbors are omitted, and there is
no standalone Neighbors section. Reorder remains drag-only. Scene 3D owns
`Hierarchy | Assets`. Scene-only tabs, Assets, and
Add Room never appear in Camera. No empty Camera rail mounts over the
viewport; workspace actions stay in the contextual viewport toolbar except
for the Camera Plan toolbar (P1.5), which owns Select/View, Add Camera,
Connect, and Grid/Snap.

**Camera → Plan (P1.5)** mounts over the architectural backdrop with its own
contextual toolbar (Select/View, Add Camera, Connect, Grid/Snap); the Plan
inspector becomes workspace-specific — world X/Z, flow order, per-direction
connection timing with Forward/Reverse + authored/automatic switching — while
Scene → Plan keeps its read-only gate for preserved scene/camera selections.
Behavior (gestures, hit priority, backdrop authority, timing authoring,
history rules) is canonical in [`camera-tour.md`](./camera-tour.md).

| Workspace | Preview |
|-----------|---------|
| Scene | Preview Scene → `/museum` |
| Camera | Preview Camera → in-editor selected-camera view; Preview Edge and Preview Sequence remain contextual scopes |

Project menu: scene Import/Paste/Copy/Download/Reset + separate Layout JSON Import/Paste/Copy/Download/Reset section. Layout status + invalid-import feedback appear in menu, sidebar, inspector. Scene + layout replacement confirmations document-scoped; editor navigation + browser unload protect either dirty document. Undo/Redo enabled in Layout, shares one chronological stack with tagged scene/layout entries. Top-bar scene dirty badge scene-scoped. **No** automatic git Save.

Layout workspace chrome: viewport toolbar has Plan/3D, Select, Rect room, Polygon room, Plan Snap/Grid or 3D Ceiling controls. Plan Select room bodies move complete room units; selected rooms expose centroid rotation arm + Shift 15° snap. Right sidebar keeps layout status/counts visible, presents Place, Objects, Selection accordion sections; accordion state session-only. Room inspector rotation applies relative degrees, resets to zero.

Timeline: collapsed `48px`; default expanded `288px`, user range `240–300px`.
Expansion state persists verbatim and never auto-expands on a domain switch.
Display lanes: Camera Path · Shots · FOV · Look At · Roll. These project the
current two backing models (Guided Route + Camera Framing); P3 adds no new
Shots/Roll entities or independent raw curves.

Status bar is persistent and informational. Its save state aggregates scene
and layout dirtiness; Plan reads Plan grid/snap state and Plan navigation
hints, while 3D reads 3D grid/transform-snap state and 3D navigation hints.
