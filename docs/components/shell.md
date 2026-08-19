# Shell and workspaces

**Read when:** app chrome, Scene/Camera switch, Layout mode, top bar, timeline frame, project menu.  
**Last reviewed:** 2026-08-18

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
actions stay in the contextual viewport toolbar until the Camera Plan surface
provides its implemented controls.

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
