# Layout Room Name Canonical Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure a room name edited in the Layout inspector is committed to `LayoutPreviewState` before canonical Layout JSON copy/download, so `Draft Room 1` becomes `Manual QA Room` in exported JSON.

**Architecture:** Keep `LayoutPreviewState.project.layout` as the only canonical layout source and keep `updateLayoutRoomFields()` as the validated mutation path. Replace the room-name input's DOM-owned value with a small inspector-local draft: input updates the draft, blur or Enter commits through `updateLayoutRoomFields()`, and failed commits restore the last canonical name. `layoutPreviewCanonicalJson()` and `EditorProjectMenu` remain unchanged because focused testing proves the mutation/codec path already serializes a committed rename correctly.

**Tech Stack:** Svelte 5 runes, TypeScript, Vitest, existing Layout v1 codec.

## Global Constraints

- Preserve visitor isolation: editor changes stay under `apps/museum/src/lib/editor/`; `/museum` and visitor chunks remain untouched.
- Preserve `LayoutDocument` as editor-only state; `rooms.ts` remains visitor architecture source of truth until B4/B5.
- Preserve `serializeLayoutDocument()` as canonical Layout JSON serializer and baseline comparison operand.
- Use `updateLayoutRoomFields()` for room-name validation and mutation; do not add a second layout write path.
- Keep scene history and scene dirty state untouched; layout mutations remain preview-state-only.
- Do not change Layout v1 schema or generated room naming.
- Do not add test dependencies or a component-test framework for this narrow fix.
- Preserve all existing user changes in the dirty worktree.
- No commits unless user explicitly asks; commit commands are intentionally omitted.

---

## File Map

- Modify `apps/museum/src/lib/editor/EditorInspector.svelte`: own the transient room-name draft and commit it explicitly to canonical layout state.
- Modify `apps/museum/src/lib/editor/layout/layout-preview-state.test.ts`: retain the focused canonical serialization regression and cover whitespace normalization/rejection.
- No change to `apps/museum/src/lib/editor/EditorProjectMenu.svelte`: its copy/download actions already serialize `layoutPreview.project.layout` at invocation time.
- No component-contract update: expected persistence contract already says canonical `serializeLayoutDocument()` output reflects successful layout mutations.

### Task 1: Lock canonical room rename behavior at the state boundary

**Files:**

- Modify: `apps/museum/src/lib/editor/layout/layout-preview-state.test.ts`
- Test: `apps/museum/src/lib/editor/layout/layout-preview-state.test.ts`

**Interfaces:**

- Consumes: `updateLayoutRoomFields(state: LayoutPreviewState, roomId: string, patch: LayoutRoomFieldPatch): LayoutRoomEditResult`
- Consumes: `layoutPreviewCanonicalJson(state: LayoutPreviewState): string`
- Produces: regression contract that successful names are trimmed and serialized, while empty names preserve prior canonical JSON.

- [ ] **Step 1: Keep the existing successful-rename regression and add normalization/rejection assertions**

Replace the current `persists draft room renames into canonical layout JSON` test with:

```ts
it('persists only validated draft room renames into canonical layout JSON', () => {
	const state = createLayoutPreviewState();
	resetLayoutPreview(state);
	const committed = commitLayoutDraftRoom(state, [
		[0, 0],
		[4, 0],
		[4, 3],
		[0, 3]
	]);
	expect(committed.success).toBe(true);
	if (!committed.success) return;

	const originalJson = layoutPreviewCanonicalJson(state);
	expect(updateLayoutRoomFields(state, committed.roomId, { name: '   ' })).toEqual({
		success: false,
		message: 'Room name cannot be empty'
	});
	expect(layoutPreviewCanonicalJson(state)).toBe(originalJson);

	expect(
		updateLayoutRoomFields(state, committed.roomId, { name: '  Manual QA Room  ' })
	).toEqual({ success: true });
	expect(state.project.layout.floors[0]!.rooms[0]!.name).toBe('Manual QA Room');

	const exported = JSON.parse(layoutPreviewCanonicalJson(state));
	expect(exported.floors[0].rooms[0].name).toBe('Manual QA Room');
	expect(layoutPreviewCanonicalJson(state)).not.toContain('Draft Room 1');
});
```

- [ ] **Step 2: Run the focused state test as a diagnostic**

Run:

```bash
npm test -w @portfolio/museum -- --run src/lib/editor/layout/layout-preview-state.test.ts
```

Expected for this regression: PASS. This confirms `updateLayoutRoomFields()` and `layoutPreviewCanonicalJson()` are not the failing boundary. If unrelated A4 assertions still report `state.status` as `undefined`, record them separately; do not change status/baseline behavior in this room-name fix.

### Task 2: Make Inspector room-name editing an explicit transaction

**Files:**

- Modify: `apps/museum/src/lib/editor/EditorInspector.svelte`
- Test: `apps/museum/src/lib/editor/layout/layout-preview-state.test.ts`

**Interfaces:**

- Consumes: `selectedLayoutRoom: LayoutRoom | undefined`
- Consumes: `updateLayoutRoomFields(layoutPreview, roomId, { name }): LayoutRoomEditResult`
- Produces: inspector-local `roomNameDraft: string`; canonical commit on blur or Enter; canonical restore on Escape or rejection.

- [ ] **Step 1: Add room-name draft state synchronized from canonical selection**

Place beside `clusterNameDraft`:

```ts
let roomNameDraft = $state('');
```

Place after the existing cluster-name effect:

```ts
$effect(() => {
	roomNameDraft = selectedLayoutRoom?.name ?? '';
});
```

This effect re-seeds the draft when selection changes or a successful mutation replaces `layoutPreview.project`. Typing changes only `roomNameDraft`, so spaces and temporarily empty input remain editable until commit.

- [ ] **Step 2: Replace event-owned room-name mutation with draft commit helpers**

Replace `updateRoomName(event: Event)` with:

```ts
function commitRoomName() {
	const room = selectedLayoutRoom;
	if (!room) return;
	const result = updateLayoutRoomFields(layoutPreview, room.id, { name: roomNameDraft });
	if (!result.success) {
		roomNameDraft = room.name;
		store.setStatusMessage(`Room rejected: ${result.message}`);
		return;
	}
	const committedRoom = layoutPreview.project.layout.floors
		.flatMap((floor) => floor.rooms)
		.find((candidate) => candidate.id === room.id);
	roomNameDraft = committedRoom?.name ?? room.name;
	store.setStatusMessage('Updated room name');
}

function onRoomNameKeyDown(event: KeyboardEvent) {
	if (event.key === 'Enter') {
		event.preventDefault();
		(event.currentTarget as HTMLInputElement).blur();
		return;
	}
	if (event.key !== 'Escape' || !selectedLayoutRoom) return;
	event.preventDefault();
	roomNameDraft = selectedLayoutRoom.name;
	(event.currentTarget as HTMLInputElement).select();
}
```

Reading the committed room back from `layoutPreview.project.layout` ensures the input displays codec-normalized state, not stale pre-mutation object data.

- [ ] **Step 3: Bind the room-name input to the draft and commit on blur**

Replace:

```svelte
<label>Name<input type="text" value={selectedLayoutRoom.name} onchange={updateRoomName} /></label>
```

with:

```svelte
<label>
	Name
	<input
		type="text"
		bind:value={roomNameDraft}
		onblur={commitRoomName}
		onkeydown={onRoomNameKeyDown}
	/>
</label>
```

Clicking Project and then Copy JSON necessarily blurs the input first; blur synchronously commits before `copyLayoutJson()` serializes state. Enter uses the same blur path, avoiding duplicate writes. Escape restores canonical value without writing.

- [ ] **Step 4: Run focused tests and static checks**

Run:

```bash
npm test -w @portfolio/museum -- --run src/lib/editor/layout/layout-preview-state.test.ts
npm run check -w @portfolio/museum
```

Expected:

- Canonical room-name regression passes.
- No new TypeScript or Svelte diagnostics from `EditorInspector.svelte`.
- Any pre-existing A4 status/baseline failures or four known baseline Svelte diagnostics are reported separately, not fixed under this plan.

### Task 3: Verify the user-visible export sequence

**Files:**

- Verify only: `apps/museum/src/lib/editor/EditorInspector.svelte`
- Verify only: `apps/museum/src/lib/editor/EditorProjectMenu.svelte`

**Interfaces:**

- Consumes: browser clipboard permission and existing Layout JSON Copy action.
- Produces: copied canonical JSON containing the committed room name.

- [ ] **Step 1: Start the museum editor**

Run:

```bash
npm run dev -w @portfolio/museum
```

Expected: Vite serves the museum app without a build error.

- [ ] **Step 2: Reproduce the exact acceptance path**

In `/dev/museum-editor`:

1. Open Layout workspace.
2. Draft and select a room named `Draft Room 1`.
3. Change Name to `Manual QA Room`.
4. Click outside the field, then confirm inspector heading shows `Manual QA Room`.
5. Open Project → Layout JSON → Copy JSON.
6. Paste clipboard into a text editor.

Expected JSON fragment:

```json
{
  "id": "layout-room-1",
  "name": "Manual QA Room"
}
```

Exact surrounding room fields may differ. Copied JSON must contain `"name": "Manual QA Room"` for selected room and must not retain `"name": "Draft Room 1"` for that room.

- [ ] **Step 3: Verify keyboard and rejection behavior**

Repeat with these cases:

- Type `Keyboard Room`, press Enter, copy Layout JSON: exported name is `Keyboard Room`.
- Type only spaces, blur: inspector restores prior canonical name, reports `Room name cannot be empty`, and copied JSON remains unchanged.
- Type a new name, press Escape: input restores prior canonical name and copied JSON remains unchanged.
- Rename, then use Download JSON: downloaded `museum-layout.json` contains same committed name as Copy JSON.

- [ ] **Step 4: Run final focused verification**

Run:

```bash
npm test -w @portfolio/museum -- --run src/lib/editor/layout/layout-preview-state.test.ts
npm run check -w @portfolio/museum
npm run build -w @portfolio/museum
```

Expected: room-name regression passes; check/build add no new failures attributable to this fix. Record pre-existing failures verbatim and keep them outside scope.

## Self-Review

- Spec coverage: exact select → rename → blur → Copy JSON repro covered in Task 3.
- Canonical ownership: no parallel export cache, schema change, or scene-history write added.
- Failure behavior: empty names fail closed and restore canonical display.
- Type consistency: all names/signatures match current `LayoutPreviewState`, `LayoutRoomFieldPatch`, and `updateLayoutRoomFields()` APIs.
- Placeholder scan: no deferred implementation placeholders.
