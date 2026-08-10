# Shell and workspaces

**Read when:** changing app chrome, layout regions, workspace switch, top-bar actions, timeline frame.  
**Last reviewed:** 2026-08-10

---

## Five persistent regions

```text
┌──────────────────────────────────────────────────────────────────────┐
│ Top bar — brand · Scene|Camera · Undo/Redo · Preview · Project      │
├──────────────┬───────────────────────────────────┬───────────────────┤
│ Left sidebar │         3D viewport + tools       │ Right inspector   │
│ Scene|Assets │                                   │ (contextual)      │
│ or Camera    │                                   │                   │
│ tour tree    │                                   │                   │
├──────────────┴───────────────────────────────────┴───────────────────┤
│ Bottom camera timeline (collapsed in Scene; open in Camera)          │
└──────────────────────────────────────────────────────────────────────┘
```

| Region | Role |
|--------|------|
| Top bar | App-wide actions only; dirty badge; workspace tabs |
| Left | Scene tree + Assets (Scene ws) · Guided tour / camera tree (Camera ws) |
| Viewport | Shared world; local Select/Move/Rotate/Scale tools; helpers |
| Inspector | One panel for current selection |
| Timeline | Guided route + framing keys; not independent Pos/Target/FOV curves |

---

## Workspace switch

Switching **Scene ↔ Camera** changes attention, default helpers, and timeline open state.

It does **not** replace: document, history, selection registry, or the 3D world.

| Workspace | Focus | Preview control |
|-----------|--------|-----------------|
| Scene | Place/transform objects, materials | **Preview Museum** → `/museum` |
| Camera | Tour graph, paths, framing, timeline | **Preview Tour** → in-editor guided play |

Authors may still select props while framing cameras (shared viewport).

---

## Timeline chrome

| State | Height |
|-------|--------|
| Collapsed | ~36px |
| Open | Resizable ~220–360px (default ~280px) |

Camera workspace auto-opens the timeline. Scene remembers the session choice.

Lane names: **Guided Route**, **Camera Framing**.

---

## Project menu (top bar)

- Import JSON / paste JSON  
- Import `.museumpack.zip`  
- Export package  
- Copy / Download JSON (does not clear dirty)  
- Reset to checked-in scene  
- Validation status  

True filesystem **Save** is deferred. Unsaved leave / tab-close prompts when dirty.

---

## Update when

Regions, workspace rules, preview labels, timeline sizing/lanes, or project-menu capabilities change.
