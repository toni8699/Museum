# Final Handoff — Phase 3.4 Guided Order

## Status

- **Slice:** Phase 3.4 — guided-order editing and reciprocal-cycle validation.
- **Result:** Complete through automated, build, HTTP, and production-isolation acceptance.
- **Schema:** Unchanged v3. No scene JSON, timeline drag-connect, framing-handle, or timing changes.
- **Commit:** None created.

## Delivered

- Added pure validation for reading the current reciprocal guided cycle and planning complete reorder, free-node insertion, and guided-node removal.
- Guided display order is pinned to `entrance-start`, contains at least two unique known nodes, and validates every consecutive direct edge including the final return to start.
- Insert rejects a node already in the cycle, an invalid gap, or either missing neighbor edge. Remove rejects free nodes, the pinned start, fewer than two retained stops, or a missing predecessor-successor edge.
- Added atomic store APIs: `setGuidedTourOrder`, `insertNodeIntoGuidedTour`, and `removeNodeFromGuidedTour`.
- One successful command rewrites every reciprocal `nextNodeId` / `previousNodeId` pair in one history entry. Nodes outside the order become free-only; graph connections and directional camera keys remain untouched.
- List/API edits never create connections. Every rejection reports the failed invariant and leaves document, graph, and history unchanged.
- Camera Tour now reads the validated order from the store. `entrance-start` is marked Start and cannot move or leave the tour.
- Guided rows support earlier/later/remove controls and drag reorder. Selecting a free node exposes insertion gaps; free rows can also be dragged into a gap.
- Active editor interactions, active/Visitor playback, and pending camera commands block guided-order writes. Paused Director state remains editable and refreshes from the rebuilt runtime graph.
- Timeline knob scrubbing across connection sections now preserves the paused Director observer framing and the user's Follow on/off state; explicit edge/node selection retains existing hard-recenter behavior.
- Paused Through Camera now accepts timeline knob scrubbing too; active playback remains locked, and scrubbing keeps Through Camera mode while sampling each connection.

## Files Changed

- `apps/museum/src/lib/editor/editor-navigation-graph.ts`
- `apps/museum/src/lib/editor/editor-navigation-graph.test.ts`
- `apps/museum/src/lib/editor/museum-editor.svelte.ts`
- `apps/museum/src/lib/editor/museum-editor.test.ts`
- `apps/museum/src/lib/editor/EditorCameraTree.svelte`
- Agent/release/camera-layout documentation.

## Verification

- Focused graph/store/shell suite: 3 files / 147 tests passed.
- Full suite: 22 files / 368 tests passed.
- `npm run check`: 0 errors and 0 warnings.
- `npm run build`: passed.
- `git diff --check`: clean.
- Development `/dev/museum-editor` = 200.
- Production `/museum` = 200; `/dev/museum-editor` = 404.
- Production visitor output contains no guided-order store, validation, status, or tree-helper symbols.

## Browser Acceptance

- Browser-control runtime exposed no browser instances, so interactive drag/click acceptance could not run in this session.
- Manual follow-up: add both required edges around a free node, select it, insert it at a displayed gap, reorder it with drag/arrows, remove it, and Undo each operation. Confirm missing-edge attempts show exact rejection status and create no connection.

## Release Boundary

- Phase 3.4 is complete.
- **Exact next slice:** Phase 3.5 — timeline drag-to-connect plus the documented atomic missing straight-edge exception.
- Do not pull framing handles or timing schema into Phase 3.5.
