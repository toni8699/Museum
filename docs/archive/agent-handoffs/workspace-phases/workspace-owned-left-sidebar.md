# Interim Handoff — Workspace-Owned Left Sidebar

## Status

- **Slice:** Workspace-owned left sidebar.
- **Result:** Complete. Scene owns Scene/Assets; Camera owns the camera-node tree.
- **Persistence:** No scene JSON, schema, dirty-baseline, or history format changes.
- **Commit:** None created.

## Files Changed

- `apps/museum/src/lib/editor/EditorLeftSidebar.svelte`
- `apps/museum/src/lib/editor/EditorCameraTree.svelte` (new)
- `apps/museum/src/lib/editor/EditorSceneTree.svelte`
- `apps/museum/src/lib/editor/EditorInspector.svelte`
- `apps/museum/src/lib/editor/MuseumEditorApp.svelte`
- `apps/museum/src/lib/editor/museum-editor.svelte.ts`
- `apps/museum/src/lib/editor/editor-outliner.ts`
- Focused editor/store/helper tests beside those modules
- This handoff and `docs/agent-handoffs/CURRENT.md`

## Final Component Ownership

- `EditorLeftSidebar.svelte` owns the single bound/inert `<aside>` and branches only on `store.currentWorkspace`.
- Scene renders its remembered Scene/Assets tabs and the selected `EditorSceneTree` or `EditorAssetLibrary`.
- Camera hides Scene/Assets tabs and renders `Camera Tour` plus `EditorCameraTree`.
- `EditorSceneTree.svelte` is room/cluster/placement-only; the former flat camera section is removed.
- `EditorCameraTree.svelte` reads `document.navigationNodes`, `nodeCount`, and unified `navigationSelection` directly. It adds no copied node state or topology grouping.
- The asset inspector is Scene-workspace-only, so a remembered `leftPanel='assets'` cannot hide camera tools in Camera.

## Store APIs and Selection/Focus Contracts

- Added `selectPlacementFromTree(placementId, { additive?, focus? })`.
  - Resolves the placement's authored room, selects and expands it, delegates to existing single/toggle selection, clears incompatible navigation/cluster selection, and requests at most one placement focus.
  - Additive selection defaults to no focus and preserves ordered multi-selection.
- Added `selectClusterFromTree(clusterId, { focus? })`.
  - Validates authored room/member ownership before changing session state, selects and expands the room/cluster, delegates to existing cluster selection, and requests one selection focus by default.
- Camera rows still call `selectNavigationNode(node.id)`. Re-clicking the selected position handle remains a no-op and does not increment the focus request.
- Selection never changes `currentWorkspace`.
- Tree selection, workspace switching, tab choice, and expansion remain session-only.
- Fixed first-cluster reactivity by assigning the optional cluster array before pushing through the state proxy; existing add/remove/undo semantics are unchanged.
- Sidebar scene-object shortcuts now apply to Scene-tree focus only. Viewport shortcut ownership is unchanged; Camera-tree focus cannot duplicate/group/delete/drop placements.

## Tests and Verification

- Targeted editor/store/helper tests: 3 files / 98 tests passed before the final additions.
- `npm test`: 20 files / 299 tests passed.
- `npm run check`: 0 errors and 0 warnings.
- `npm run build`: passed.
- `git diff --check`: passed.
- Production smoke: `/museum` = 200; `/dev/museum-editor` = 404.
- Production visitor output search found no `Camera Tour`, `Camera Nodes`, `EditorCameraTree`, `selectPlacementFromTree`, or `MuseumEditorStore` symbols.
- No lint script is configured.

Focused coverage includes workspace/left-panel persistence, canonical JSON/history/dirty invariants, placement selection from a null room, additive first selection without focus, cluster selection from a null room, navigation/placement/cluster exclusivity, redundant node-focus no-op behavior, and selection never auto-switching workspaces.

## Browser Acceptance

- Scene showed Scene/Assets tabs, no camera-node section, one-line `Read only` room rows, and no horizontal sidebar overflow.
- Measured row heights: room 34 px; placement 32 px.
- A Paris placement selected without first clicking Paris; Shift-click produced ordered two-object selection.
- Creating the first cluster rendered an expanded compact cluster with member/add/remove rows; selecting the cluster selected both members and showed cluster inspector state.
- Assets → Camera → Scene restored Assets as the selected Scene tab.
- Camera showed only `Camera Tour` / `Camera Nodes` with eight numbered, labeled rows; scene objects remained visible in the shared viewport.
- Camera-node selection framed the existing helper and exposed the camera inspector/preview controls even when Assets was the remembered Scene tab.
- Scene timeline measured 36 px; Camera timeline measured 280 px.
- Visitor preview made the shared sidebar inert and disabled workspace/tools; Stop restored interaction.
- A cluster creation followed by workspace, tab, expansion, and selection changes was still the next Undo action, returning the document to Saved.
- `/museum` retained the visitor HUD and exposed no editor sidebar/helpers.
- Editor and visitor browser consoles had no warnings or errors.

## Known Gaps

- The repository has no component-mount test stack, so component branching/density is covered by Svelte compilation and browser acceptance rather than a new mounting dependency.
- The checked-in scene contains no clusters. The exact null-room cluster-selection prerequisite is covered by the store test; browser acceptance created the first cluster after selecting its two members.
- The same-node no-focus contract is asserted by focus-version tests; the browser pass selected and framed a node but did not instrument camera matrices for a visual delta assertion.
- Connections, camera keys, guided-order editing, deletion, search/filtering, visibility/locks, context menus, drag/re-parent, and tree keyboard navigation remain intentionally deferred.

## Exact Next-Slice Recommendation

Camera/Object viewport selection scope.
