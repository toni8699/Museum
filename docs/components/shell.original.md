# Shell and workspaces

**Read when:** app chrome, Scene/Camera switch, Layout mode, top bar, timeline frame, project menu.  
**Last reviewed:** 2026-08-12

---

```text
┌─────────────────────────────────────────────────────────────┐
│ Top bar — Scene|Camera · Undo/Redo · Preview · Project      │
├──────────┬──────────────────────────────┬───────────────────┤
│ Left     │  3D viewport + tools         │ Inspector         │
├──────────┴──────────────────────────────┴───────────────────┤
│ Camera timeline (collapsed in Scene; open in Camera)        │
└─────────────────────────────────────────────────────────────┘
```

Scene ↔ Camera = **attention only** (not document/history/world).  
Layout mode (CAD) = selection mutex vs Museum mode (lock before plan UX).

| Workspace | Preview |
|-----------|---------|
| Scene | Preview Museum → `/museum` |
| Camera | Preview Tour → in-editor guided play |

Project menu: scene Import/Paste/Copy/Download/Reset plus a separate Layout JSON Import/Paste/Copy/Download/Reset section. Layout status and invalid-import feedback appear in the menu, sidebar, and inspector. Scene and layout replacement confirmations are document-scoped; editor navigation and browser unload protect either dirty document. Undo/Redo remains enabled in Layout and shares one chronological stack with tagged scene/layout entries. The top-bar scene dirty badge remains scene-scoped. **No** automatic git Save.

Layout workspace chrome: viewport toolbar contains Plan/3D, Select, Rect room, Polygon room, and Plan Snap/Grid or 3D Ceiling controls. Plan Select room bodies move complete room units; selected rooms expose a centroid rotation arm and Shift 15° snap. Right sidebar keeps layout status/counts visible and presents Place, Objects, and Selection accordion sections; accordion state is session-only. Room inspector rotation applies relative degrees and resets to zero.

Timeline: collapsed ~36px / open ~220–360px; Camera auto-opens. Lanes: Guided Route · Camera Framing (no independent Pos/Target/FOV curves).
