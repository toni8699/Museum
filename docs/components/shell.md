# Shell and workspaces

**Read when:** app chrome, Scene/Camera switch, Layout mode, top bar, timeline frame, project menu.  
**Last reviewed:** 2026-08-10

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

Project menu: Import JSON / paste / `.museumpack.zip` · Export package · Copy/Download JSON · Reset · validation. Layout import/export separate when CAD lands. **No** automatic git Save. Dirty leave prompts.

Timeline: collapsed ~36px / open ~220–360px; Camera auto-opens. Lanes: Guided Route · Camera Framing (no independent Pos/Target/FOV curves).
