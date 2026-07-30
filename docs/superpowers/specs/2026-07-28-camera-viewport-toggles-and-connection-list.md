# Camera viewport toggles + node connections list

Date: 2026-07-28
Status: design, ready for implementation

## Problem

Camera workspace too busy. Editor can't focus on one concern (paths vs framing vs node handles) without visually turning off the others. Selected node exposes its edges only in the 3D viewport — no textual summary. User said "FOV"; that maps to the existing framing helpers (`EditorCameraFramingHelpers` finite frustum + FOV handles, plus view-key markers) — not a new projection.

## Goals

- 3 viewport toggle layers, independent, honour user choice strictly (with one connect-flow exception below).
- Read-only connections list inside inspector when a committed node is selected.
- No new 3D geometry. No new motion path. No new navigation graph.
- Session state only — refresh wipes.
- Touch only Camera workspace (`/dev/museum-editor` route, dev-only).

## Non-goals

- localStorage persistence.
- A new / more accurate FOV cone beyond the existing framing helpers.
- New persistence for any document data.
- Free-mode connections picker (free nodes inherit existing behaviour).
- Auto-rescue toggles when viewport empty (except forced node handles during connect — see Decisions).

## Design

### 1. Store flags

`MuseumEditorStore` gains 3 `$state` booleans, default `true`, session-only, never enter history/JSON:

```
viewportShowNodes = $state(true)
viewportShowPaths = $state(true)
viewportShowFraming = $state(true)
```

Add matching toggle setters for UI binding. Default = full visibility (current behaviour preserved). Switching `currentWorkspace` does NOT touch flags.

Semantics of `viewportShowNodes`: controls **node handles only** — the existing `EditorCameraHelpers` eye/target (or position-only) markers. There is no all-nodes overlay in the viewport today; do not invent one.

### 2. Viewport wiring

`EditorViewport.svelte`. Wrap each helper block:

```
{#if store.viewportShowPaths}
  <EditorCameraPathHelpers {store} />
{/if}
{#if store.viewportShowFraming}
  <EditorCameraViewHelpers {store} />
  <EditorCameraFramingHelpers {store} />
{/if}
{#if store.viewportShowNodes || store.forceMountCameraNodeHandles}
  ...existing conditional block that mounts <EditorCameraHelpers>...
{/if}
```

`{#if}` (not `display: none`) — helper components run `disposeAll` on unmount via existing `onDestroy` / `$effect` cleanup; prevents Three.js material/geometry leaks.

**Path hide = unmount only.** Do not also thread `viewportShowPaths` into `EditorCameraPathHelpers`' internal `hidden` check; that check stays for preview/interaction states only.

**Connect exception** — captured as a `$derived` getter on the store (not the raw `pendingNavigationCommand`, so `place-camera` does not trigger force-mount):

```
get forceMountCameraNodeHandles() {
  const kind = this.pendingNavigationCommand?.kind;
  return kind === 'connect-existing' || kind === 'connect-pending-node';
}
```

While this returns true, node helpers stay mounted even if `viewportShowNodes` is false, so viewport picking of the destination camera node keeps working. Tree connect remains available regardless.

Selection logic unchanged: `store.navigationSelection` still resolves hits regardless of visibility (toggling off removes pickable geometry, so viewport hits on that layer become impossible — desired).

### 3. Toolbar dropdown

`EditorViewportToolbar.svelte`. Add new View menu between Snap and Add groups. Render **only when** `store.currentWorkspace === 'camera'` (hide in Scene — no silent no-op).

```
<button aria-haspopup="menu" aria-expanded={viewMenuOpen}>View ▾</button>
{#if viewMenuOpen}
  <div role="menu" aria-label="Viewport helpers" class="view-menu">
    <button role="menuitem" aria-pressed={store.viewportShowNodes}
            onclick={() => store.toggleViewportShowNodes()}>
      Node handles
    </button>
    <button role="menuitem" aria-pressed={store.viewportShowPaths}
            onclick={() => store.toggleViewportShowPaths()}>
      Tour paths
    </button>
    <button role="menuitem" aria-pressed={store.viewportShowFraming}
            onclick={() => store.toggleViewportShowFraming()}>
      Framing & FOV
    </button>
  </div>
{/if}
```

Toggle button label: static `View ▾`. No badge. Each menu row uses `aria-pressed` to reflect state. Click toggles setter; menu stays open for rapid multi-toggle. Click-outside closes (reuse / extend the existing `onMount` window `pointerdown` pattern from the Add menu so both menus close).

Styling: reuse `.toolbar` / `.tool-group` / `button`/`active` rules in `EditorViewportToolbar.svelte`. Charcoal/amber palette per project tone.

Menu open-state is component-local `let viewMenuOpen`. Workspace switch leaves the menu in whatever state the editor left it (no auto-close, no auto-open) — easier mental model than surprise resets.

### 4. Inspector connections list

`EditorCameraInspector.svelte`. Inside the committed-node branch only (`selection?.kind === 'node' && node && point && !pendingNode`), after the existing `topology` div, add:

```
<section class="connections" aria-label="Node connections">
  <div class="section-heading">
    <h3>Connections</h3>
    <span>{outgoing.length + incoming.length}</span>
  </div>
  {#if outgoing.length + incoming.length === 0}
    <p>No connections</p>
  {:else}
    <ul>
      <!-- one row per connection the selected node participates in -->
    </ul>
  {/if}
</section>
```

Do **not** show this section for pending camera placement.

Pure helper `getNodeConnections(document, nodeId)` (new file `editor-camera-connections.ts`, or next to outliner — **not** a store method) returns `{ outgoing, incoming }` with partner lookup. Sort: outgoing first, then incoming; stable by `connection.id` within each bucket. `keysCount` returns `{ forward, reverse, total }`.

One row per connection ID (a connection has exactly one `fromNodeId` and one `toNodeId`, so the selected node is either from OR to — never both on the same id). Row template:

```
<li class="connection-row {isOutgoing ? 'outgoing' : 'incoming'}">
  <span class="badge">{isOutgoing ? '▶' : '◀'}</span>
  <span class="partner">{partnerLabel}</span>
  <span class="room">{partnerRoomId}</span>
  <div class="actions" role="group" aria-label="Open direction">
    <button type="button"
            title="Open forward direction for {connectionId}"
            onclick={() => store.selectCameraConnectionDirection(c.id, 'forward')}>
      Forward
    </button>
    <button type="button"
            title="Open reverse direction for {connectionId}"
            onclick={() => store.selectCameraConnectionDirection(c.id, 'reverse')}>
      Reverse
    </button>
  </div>
</li>
```

- Badge ▶ outgoing (`c.fromNodeId === node.id`); ◀ incoming (`c.toNodeId === node.id`).
- Two direction buttons per row (`Forward` / `Reverse`) so both directions are reachable from the list. Both call `store.selectCameraConnectionDirection(c.id, direction)` and are always clickable — framing-track selection needs to land even when one side has zero authored view-keys.
- `partnerLabel` = `formatCameraNodeLabel(partner.label, partner.id)` from `editor-outliner` (import: `import { formatCameraNodeLabel } from './editor-outliner';`).
- `partnerRoomId` rendered as small ID tag.
- Full row meta (anchors / kind / clearance / keys) lives on `title="…"` only — not inline. Template: `{anchorsCount} anchors · {kind} · {clearance} m clearance · {forwardKeys}+{reverseKeys} view keys ({totalKeys} total)`.
- Zero counts still appear in the title (`0 anchors`, `0 view keys`) so ghost edges obvious on hover.
- List stays visible during `isCameraPreviewPlaying` (read-only).
- Partner missing → row skipped (defensive).
- Filter incoming `◀` rows: the `Reverse` button is disabled when the connection has no `viewTracks.reverse` even though the route runs reverse automatically — button still usable for framing-track selection.

### 5. FOV framing

No new geometry. Toggle label `Framing & FOV` maps to existing `EditorCameraViewHelpers` + `EditorCameraFramingHelpers`. A more accurate frustum cone, if wanted later, is a separate spec.

## Files

| File | Change |
|------|--------|
| `apps/museum/src/lib/editor/museum-editor.svelte.ts` | Add 3 `$state` flags + toggle setters + `forceMountCameraNodeHandles` getter; no history/JSON impact |
| `apps/museum/src/lib/editor/EditorViewport.svelte` | Wrap 3 helper families in `{#if}`; outer gate reads `forceMountCameraNodeHandles` |
| `apps/museum/src/lib/editor/EditorViewportToolbar.svelte` | Add View dropdown (Camera workspace only) + click-outside; menu a11y label |
| `apps/museum/src/lib/editor/EditorCameraInspector.svelte` | Add committed-node connections section; two action buttons per row |
| `apps/museum/src/lib/editor/editor-camera-connections.ts` | Pure `getNodeConnections(document, nodeId)` returning buckets + per-track key counts |
| `apps/museum/src/lib/editor/editor-camera-connections.test.ts` | Buckets, sort, missing-partner skip, zero-count titles |
| `apps/museum/src/lib/editor/museum-editor.test.ts` | Viewport flags: defaults, toggle, no dirty + no history bump |
| `docs/CAMERA_AND_LAYOUT.md` / `docs/agent-handoffs/CURRENT.md` | One-line note in each |

`EditorCameraPathHelpers.svelte` is **unchanged** (unmount from parent is sufficient).

## Data flow

1. User clicks dropdown row → toggle mutates `$state` flag.
2. Parent `{#if}` mounts/unmounts helpers; existing cleanup disposes Three resources.
3. Toolbar reflects `aria-pressed` on each row (no badge).
4. Node-select → inspector `$derived` calls `getNodeConnections` over `store.document.connections`.

No new store derivations. No document mutations.

## Error handling

- Helper unmount paths already covered (`dispose*` functions exist).
- Click-outside handler: null `toolbarElement` → no-op.
- Missing partner on a connection row → skip that row.

## Testing

- `museum-editor.test.ts`: `viewport visibility flags default true, toggle does not dirty the document`:
  - all 3 flags default `true` on store creation
  - toggle setters flip each flag
  - toggling does NOT bump `historyVersion` and does NOT flip `isDirty`
  - `serializeSceneDocument(document)` output is byte-equal before/after a toggle
  - `forceMountCameraNodeHandles` returns true only for `connect-existing` / `connect-pending-node`, false for `place-camera` and null
- `editor-camera-connections.test.ts`: `getNodeConnections` returns sorted `{ outgoing, incoming }` with stable id ordering; skips missing partners; `keysCount` reports forward/reverse/total.
- No visual regression test in v1 (manual).
- Existing `editor-camera-path.test.ts` unchanged — toggle never reaches motion builder.

## Decisions (locked)

- Empty-state: strict — if all off + no selection, viewport empty. No auto-rescue of toggles.
- Connect exception: force-show node handles via `forceMountCameraNodeHandles` getter, only for `connect-existing` / `connect-pending-node` (not `place-camera`).
- Node toggle semantics: **Node handles** (eye/target / connect position markers) only — not an all-nodes layer.
- Path hide: unmount only; no extra flag inside path helpers.
- Connection row click: two buttons per row (`Forward` + `Reverse`), both call `store.selectCameraConnectionDirection` with the chosen direction.
- List sort: outgoing first, then incoming; stable by `connection.id`.
- `keysCount`: broken into `{ forward, reverse, total }`; `total` = forward + reverse.
- Meta density: partner + direction in the row; anchors/kind/clearance/keys in `title`.
- View menu: Camera workspace only; menu a11y label `Viewport helpers`.
- Menu open-state: component-local, persists across workspace switch.
- Persistence: session-only. No `localStorage`.

## Out of scope (recorded, not built)

- New / more accurate FOV cone — see non-goals.
- Keyboard shortcuts for toggles — v2.
- Per-layer color customization — v2.
